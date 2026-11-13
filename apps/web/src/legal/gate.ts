import { redirect } from 'next/navigation';
import type { SessionState } from '@orbit/core/next';
import { unsignedDocs } from './state';

/**
 * Sends anyone who has not signed the current Terms and Privacy Policy to /agree first.
 * Super Admin (Orbit staff) is not asked. Call from layouts and entry pages.
 */
export async function requireAgreement(s: SessionState) {
  if (s.state === 'ok' && !s.ctx.isSuperAdmin) {
    if ((await unsignedDocs(s.ctx.userId)).length) redirect('/agree');
  } else if (s.state === 'no_company' && !s.isSuperAdmin) {
    if ((await unsignedDocs(s.userId)).length) redirect('/agree');
  }
}
