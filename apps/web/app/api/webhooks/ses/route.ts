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

const certCache = new Map<string, string>();

/** Verifies the SNS signature (certificate must come from sns.<region>.amazonaws.com). */
async function verifySns(m: SnsMessage): Promise<boolean> {
  const certUrl = new URL(m.SigningCertURL);
  if (certUrl.protocol !== 'https:' || !/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(certUrl.hostname)) return false;
  let cert = certCache.get(m.SigningCertURL);
  if (!cert) {
    cert = await (await fetch(m.SigningCertURL)).text();
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

/** SNS topic wepcm-<env>-ses-feedback: bounces and complaints go on the suppression list. */
export async function POST(req: NextRequest) {
  const m = JSON.parse(await req.text()) as SnsMessage;
  if (process.env.APP_SES_TOPIC_ARN && m.TopicArn !== process.env.APP_SES_TOPIC_ARN) {
    return NextResponse.json({ error: 'unknown topic' }, { status: 403 });
  }
  if (!(await verifySns(m))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  if (m.Type === 'SubscriptionConfirmation' && m.SubscribeURL) {
    await fetch(m.SubscribeURL);
    return NextResponse.json({ ok: true });
  }
  if (m.Type !== 'Notification') return NextResponse.json({ ok: true });

  const event = JSON.parse(m.Message) as {
    eventType?: string;
    notificationType?: string;
    bounce?: { bounceType: string; bouncedRecipients: { emailAddress: string }[] };
    complaint?: { complainedRecipients: { emailAddress: string }[] };
  };
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
