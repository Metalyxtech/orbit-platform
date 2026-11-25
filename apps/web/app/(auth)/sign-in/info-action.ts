'use server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { newEvent, type EmailIntent } from '@orbit/core/events';
import { sendWithoutOutbox } from '@orbit/core/outbox';
import { catalogPortal, PORTAL_CATALOG } from '@/portal-catalog';

export type InfoState = { status: 'idle' | 'sent' | 'error'; message?: string; email?: string };

const input = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid work email.').max(200),
  name: z.string().trim().max(80).optional(),
  company: z.string().trim().max(120).optional(),
  phone: z
    .string()
    .trim()
    .min(1, 'Enter your phone number.')
    .max(30)
    .regex(/^\+?[0-9 ()\-.]{6,30}$/, 'Enter a valid phone number.'),
  message: z.string().trim().max(600).optional(),
  portals: z.array(z.enum(PORTAL_CATALOG.map((p) => p.id) as [string, ...string[]])).min(1, 'Choose at least one portal.'),
});

// Best effort, per server instance: stops one visitor from using the form to flood an inbox.
const hits = new Map<string, number[]>();
function tooMany(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > max;
}

const text = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v : undefined);

/** Sign-in page: "Email me the details". Sends the portal guide to the visitor and a copy to the sales inbox. */
export async function requestPortalInfoAction(_prev: InfoState, form: FormData): Promise<InfoState> {
  console.info('[portal-info] request received', JSON.stringify({ portals: form.getAll('portals'), hasPhone: !!text(form.get('phone')) }));
  // Honeypot: people never see this field, bots fill it in. Pretend it worked.
  // (Named so browser autofill and password managers leave it alone.)
  if (text(form.get('hp_trap_9x'))) {
    console.warn('[portal-info] honeypot filled; treated as bot, nothing sent');
    return { status: 'sent' };
  }

  const parsed = input.safeParse({
    email: form.get('email'),
    name: text(form.get('name')),
    company: text(form.get('company')),
    phone: text(form.get('phone')) ?? '',
    message: text(form.get('message')),
    portals: form.getAll('portals'),
  });
  if (!parsed.success) {
    console.info('[portal-info] rejected:', parsed.error.issues[0]?.message);
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }
  const d = parsed.data;

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (tooMany(`ip:${ip}`, 5, 60 * 60 * 1000) || tooMany(`to:${d.email}`, 3, 24 * 60 * 60 * 1000)) {
    console.info('[portal-info] rate limited');
    return { status: 'error', message: 'We already sent a few emails from here. Please check your inbox, or try again later.' };
  }

  const sections = d.portals.map((id) => {
    const p = catalogPortal(id)!;
    return { title: p.name, body: p.tagline, items: p.features, accent: p.accent };
  });
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const baseUrl = process.env.APP_BASE_URL ?? (host ? `${proto}://${host}` : undefined);
  const props = { baseUrl, path: '/pricing', name: d.name, email: d.email, company: d.company, phone: d.phone, message: d.message, sections };

  const intents: EmailIntent[] = [{ to: [d.email], template: 'portal_info', props }];
  const leads = (process.env.APP_LEADS_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (leads.length) intents.push({ to: leads, template: 'portal_info_lead', props: { ...props, path: undefined } });

  const requestId = h.get('x-request-id') ?? crypto.randomUUID();
  const events = intents.map((email) => newEvent('lead.portal_info', { companyId: 'platform', companyStage: 'live', requestId }, { email }));

  // Also log the enquiry in the SteelConnect admin (Metalyx Inquiries tab), which pops a notification for admins.
  await forwardToSteelConnectAdmin(d, h.get('referer') ?? '');

  try {
    if (!(await sendWithoutOutbox(events))) {
      // Local development without AWS: show what would have been sent.
      console.info('[portal-info] no APP_SQS_EVENTS_URL; email not sent', JSON.stringify(events.map((e) => e.data.email)));
    }
  } catch (err) {
    console.error('[portal-info] send failed', err);
    return { status: 'error', message: 'We could not send the email just now. Please try again in a minute.' };
  }
  return { status: 'sent', email: d.email };
}

// Same backend the Metalyx website posts to. The Cloud Run URL is tried first
// (proven path from serverless hosts), then the custom domain.
const STEELCONNECT_CONTACT_APIS = [
  process.env.APP_STEELCONNECT_API_URL,
  'https://steelconnect-api-453964978221.asia-south1.run.app',
  'https://api.steelconnectapp.com',
]
  .filter((u): u is string => !!u)
  .map((u) => u.replace(/\/$/, '') + '/api/tool-leads/contact')
  .filter((u, i, all) => all.indexOf(u) === i);

/** Best effort: a failure here must not stop the visitor getting their email. */
async function forwardToSteelConnectAdmin(d: z.infer<typeof input>, page: string) {
  const portals = d.portals.map((id) => catalogPortal(id)?.name ?? id).join(', ');
  const message = [
    'ORBIT PORTAL ENQUIRY',
    '',
    `Portals: ${portals}`,
    `Name: ${d.name ?? '-'}`,
    `Email: ${d.email}`,
    `Phone: ${d.phone}`,
    `Company: ${d.company ?? '-'}`,
    '',
    'Description:',
    d.message ?? '(none given)',
  ].join('\n');
  const body = JSON.stringify({
    name: d.name ?? d.email,
    email: d.email,
    company: d.company ?? '',
    phone: d.phone,
    interest: `Orbit portals — ${portals}`,
    message,
    botField: '',
    page,
    source: 'orbit-portal-info',
  });
  for (const url of STEELCONNECT_CONTACT_APIS) {
    try {
      // Cloud Run scales to zero, so allow for a cold start (two tries fit the ~30s request limit).
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'orbit-portal-info/1.0' },
        body,
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        console.info('[portal-info] enquiry sent to SteelConnect admin via', url);
        return true;
      }
      console.error('[portal-info] steelconnect admin forward failed', url, res.status, (await res.text().catch(() => '')).slice(0, 300));
    } catch (err) {
      console.error('[portal-info] steelconnect admin forward failed', url, err);
    }
  }
  return false;
}
