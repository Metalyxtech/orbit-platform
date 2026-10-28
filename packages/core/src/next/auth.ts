import { WorkOS } from '@workos-inc/node';
import { cookies } from 'next/headers';
import { getSecret } from '../aws/secrets';
import { seal, unseal } from './cookie';

export const SESSION_COOKIE = 'orbit_session';
export const DEV_COOKIE = 'orbit_dev_user';
const SESSION_HOURS = 12;

export interface AuthIdentity {
  workosUserId: string;
  email: string;
  name: string;
  organizationId?: string;
  sessionId?: string;
  exp: number;
}

/** Local-only shortcut: pick a seeded user without WorkOS. Never active outside APP_STAGE=local. */
export const devAuthEnabled = () => process.env.APP_STAGE === 'local' && process.env.APP_AUTH_MODE === 'dev';

let workos: Promise<WorkOS> | undefined;
export function getWorkOS() {
  workos ??= getSecret('workosApiKey').then(
    (key) => new WorkOS(key, { clientId: process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID }),
  );
  return workos;
}

const redirectUri = () => `${process.env.APP_BASE_URL}/auth/callback`;

export async function authorizationUrl(state: string, screenHint?: 'sign-up' | 'sign-in') {
  const w = await getWorkOS();
  return w.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID!,
    redirectUri: redirectUri(),
    state,
    screenHint,
  });
}

/** Exchanges the AuthKit code and writes our own sealed session cookie. */
export async function completeSignIn(code: string): Promise<AuthIdentity> {
  const w = await getWorkOS();
  const res = await w.userManagement.authenticateWithCode({
    code,
    clientId: process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID!,
  });
  const sid = JSON.parse(Buffer.from(res.accessToken.split('.')[1], 'base64url').toString()).sid as string | undefined;
  const identity: AuthIdentity = {
    workosUserId: res.user.id,
    email: res.user.email.toLowerCase(),
    name: [res.user.firstName, res.user.lastName].filter(Boolean).join(' ') || res.user.email,
    organizationId: res.organizationId,
    sessionId: sid,
    exp: Date.now() + SESSION_HOURS * 3_600_000,
  };
  const password = await getSecret('workosCookiePassword');
  (await cookies()).set(SESSION_COOKIE, seal(identity, password), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600,
  });
  return identity;
}

export async function readIdentity(): Promise<AuthIdentity | null> {
  const jar = await cookies();
  if (devAuthEnabled()) {
    const email = jar.get(DEV_COOKIE)?.value;
    return email
      ? { workosUserId: `dev|${email}`, email, name: email, exp: Date.now() + 3_600_000 }
      : null;
  }
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const identity = unseal<AuthIdentity>(raw, await getSecret('workosCookiePassword'));
  return identity && identity.exp > Date.now() ? identity : null;
}

/** Clears our cookie and returns the WorkOS logout URL (ends the AuthKit session too). */
export async function signOutUrl(): Promise<string> {
  const identity = await readIdentity();
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(DEV_COOKIE);
  if (identity?.sessionId && !devAuthEnabled()) {
    const w = await getWorkOS();
    return w.userManagement.getLogoutUrl({ sessionId: identity.sessionId, returnTo: process.env.APP_BASE_URL });
  }
  return '/sign-in';
}
