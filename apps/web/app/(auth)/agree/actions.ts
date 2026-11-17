'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { signDocs, signInput } from '@/legal/state';

/** Signs the current Terms and Privacy Policy, then continues into Orbit. */
export async function signAgreementsAction(form: FormData) {
  const s = await getSession();
  if (s.state !== 'ok' && s.state !== 'no_company') redirect('/');
  const parsed = signInput.safeParse({ signedName: form.get('signedName'), terms: form.get('terms') === 'on', privacy: form.get('privacy') === 'on' });
  if (!parsed.success) redirect(`/agree?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Check the form')}`);
  const h = await headers();
  await signDocs({
    userId: s.state === 'ok' ? s.ctx.userId : s.userId,
    companyId: s.state === 'ok' ? s.ctx.companyId : null,
    role: s.state === 'ok' ? s.ctx.role : null,
    signedName: parsed.data.signedName,
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    userAgent: h.get('user-agent'),
  });
  redirect('/');
}
