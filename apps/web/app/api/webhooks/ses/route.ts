import { createVerify } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { emailSuppressions } from '@orbit/db';
import { getDb } from '@orbit/core/next';

export const dynamic = 'force-dynamic';

interface SnsMessage {
  Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
  MessageId: string;
  Token?: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  SubscribeURL?: string;
  Timestamp: string;
  SignatureVersion: '1' | '2';
  Signature: string;
  SigningCertURL: string;
}

interface SesEvent {
  eventType?: string;
  notificationType?: string;
  bounce?: { bounceType: string; bouncedRecipients: { emailAddress: string }[] };
  complaint?: { complainedRecipients: { emailAddress: string }[] };
}

const certCache = new Map<string, string>();
const MAX_BODY = 256 * 1024; // SNS messages are at most 256 KB

const isSnsHost = (u: URL) => u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);

/** Verifies the SNS signature (certificate must come from sns.<region>.amazonaws.com). */
async function verifySns(m: SnsMessage): Promise<boolean> {
  if (typeof m.SigningCertURL !== 'string' || typeof m.Signature !== 'string') return false;
  let certUrl: URL;
  try {
    certUrl = new URL(m.SigningCertURL);
  } catch {
    return false;
  }
  if (!isSnsHost(certUrl) || !certUrl.pathname.endsWith('.pem')) return false;
  let cert = certCache.get(m.SigningCertURL);
  if (!cert) {
    const res = await fetch(certUrl, { redirect: 'error' });
    if (!res.ok) return false;
    cert = await res.text();
    if (certCache.size > 20) certCache.clear();
    certCache.set(m.SigningCertURL, cert);
  }
  const keys =
    m.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  const toSign = keys
    .filter((k) => m[k as keyof SnsMessage] !== undefined)
    .map((k) => `${k}\n${m[k as keyof SnsMessage]}\n`)
    .join('');
  const verifier = createVerify(m.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1');
  verifier.update(toSign);
  return verifier.verify(cert, m.Signature, 'base64');
}

/** SNS topic orbit-<env>-ses-feedback: bounces and complaints go on the suppression list. */
export async function POST(req: NextRequest) {
  // Fail closed: without the expected topic, anyone's SNS topic could post validly signed
  // messages here and put arbitrary addresses on the suppression list.
  const topicArn = process.env.APP_SES_TOPIC_ARN;
  if (!topicArn) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let m: SnsMessage;
  try {
    m = JSON.parse(raw) as SnsMessage;
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  if (!m || m.TopicArn !== topicArn) return NextResponse.json({ error: 'unknown topic' }, { status: 403 });
  if (!(await verifySns(m).catch(() => false))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  if (m.Type === 'SubscriptionConfirmation' && m.SubscribeURL) {
    // Only ever call back to SNS itself (the URL is signed, this guards against SSRF anyway).
    const url = new URL(m.SubscribeURL);
    if (!isSnsHost(url)) return NextResponse.json({ error: 'bad subscribe url' }, { status: 400 });
    await fetch(url, { redirect: 'error' });
    return NextResponse.json({ ok: true });
  }
  if (m.Type !== 'Notification') return NextResponse.json({ ok: true });

  let event: SesEvent;
  try {
    event = JSON.parse(m.Message) as SesEvent;
  } catch {
    return NextResponse.json({ ok: true, suppressed: 0 });
  }
  const type = event.eventType ?? event.notificationType;
  const suppress: { email: string; reason: string }[] = [];
  if (type === 'Bounce' && event.bounce?.bounceType === 'Permanent') {
    for (const r of event.bounce.bouncedRecipients) suppress.push({ email: r.emailAddress.toLowerCase(), reason: 'bounce' });
  }
  if (type === 'Complaint' && event.complaint) {
    for (const r of event.complaint.complainedRecipients) suppress.push({ email: r.emailAddress.toLowerCase(), reason: 'complaint' });
  }
  if (suppress.length) {
    const db = await getDb();
    await db.insert(emailSuppressions).values(suppress).onConflictDoNothing();
  }
  return NextResponse.json({ ok: true, suppressed: suppress.length });
}
