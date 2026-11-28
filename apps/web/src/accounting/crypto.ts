import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { findSecret } from '@orbit/core/aws';
import { signBody, verifySignature } from '@orbit/core/hmac';

// Companies' accounting tokens are stored encrypted (AES-256-GCM) with SteelConnect360's own key
// from SSM (/orbit/<env>/app/accountingTokenKey). The same key signs the OAuth "state" so a
// connection can only finish for the person and company that started it.

async function key() {
  const raw = await findSecret('accountingTokenKey');
  if (!raw) throw new Error('Accounting connections are not set up on this server yet (accountingTokenKey is missing).');
  return { raw, aes: createHash('sha256').update(raw).digest() };
}

export async function encrypt(plain: string | null | undefined) {
  if (!plain) return null;
  const { aes } = await key();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aes, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
}

export async function decrypt(sealed: string | null | undefined) {
  if (!sealed) return null;
  if (!sealed.startsWith('v1:')) throw new Error('Unknown token format');
  const { aes } = await key();
  const buf = Buffer.from(sealed.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', aes, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export type OAuthState = { c: string; m: string; p: string; n: string };

/** Signed state for the provider's sign-in page (valid 15 minutes). */
export async function signState(s: OAuthState) {
  const { raw } = await key();
  const body = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${body}.${Buffer.from(signBody(raw, body)).toString('base64url')}`;
}

export async function readState(state: string | null): Promise<OAuthState | null> {
  if (!state) return null;
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const { raw } = await key();
  if (!verifySignature(raw, body, Buffer.from(sig, 'base64url').toString(), 15 * 60)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as OAuthState;
  } catch {
    return null;
  }
}
