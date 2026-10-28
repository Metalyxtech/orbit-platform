import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** AES-256-GCM sealed cookie value. Key = sha256(cookie password from SSM). */
export function seal(data: unknown, password: string): string {
  const key = createHash('sha256').update(password).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function unseal<T>(value: string | undefined, password: string): T | null {
  if (!value) return null;
  try {
    const [iv, tag, body] = value.split('.').map((p) => Buffer.from(p, 'base64url'));
    const key = createHash('sha256').update(password).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as T;
  } catch {
    return null;
  }
}
