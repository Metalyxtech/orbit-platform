import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signs internal calls (escalator Lambda -> /api/internal/timer). Header: x-orbit-signature: t=<unix>,v1=<hex> */
export function signBody(secret: string, body: string, at = Math.floor(Date.now() / 1000)) {
  const mac = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
  return `t=${at},v1=${mac}`;
}

export function verifySignature(secret: string, body: string, header: string | null, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const at = Number(parts.t);
  if (!Number.isFinite(at) || Math.abs(Date.now() / 1000 - at) > toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${at}.${body}`).digest('hex'));
  const given = Buffer.from(parts.v1 ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
