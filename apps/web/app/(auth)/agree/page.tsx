import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { DOCUMENTS, LEGAL_DOCS } from '@/legal/documents';
import { LegalText } from '@/legal/LegalText';
import { unsignedDocs } from '@/legal/state';
import { signAgreementsAction } from './actions';

export const dynamic = 'force-dynamic';

/** First sign-in (and after a document changes): read and sign the Terms and the Privacy Policy. */
export default async function Agree({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state === 'pending') redirect('/pending');
  const userId = s.state === 'ok' ? s.ctx.userId : s.userId;
  const todo = await unsignedDocs(userId);
  if (!todo.length) redirect('/');
  const error = (await searchParams).error;
  const name = s.state === 'ok' ? s.ctx.name : s.name;
  const admin = s.state === 'ok' && s.ctx.role === 'company_admin';
  const updated = todo.length < LEGAL_DOCS.length;
  return (
    <main style={{ minHeight: '100vh', background: 'var(--graphite)', padding: '24px 16px' }}>
      <div className="o-panel" style={{ maxWidth: 760, margin: '0 auto', padding: '24px 28px' }}>
        <div className="o-row" style={{ marginBottom: 14 }}>
          <div className="o-brand-mark" style={{ borderColor: 'var(--graphite)' }} aria-hidden />
          <strong style={{ fontSize: 18 }}>Orbit</strong>
        </div>
        <h1 style={{ marginBottom: 6 }}>{updated ? 'We have updated our terms' : 'Before you start'}</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Please read and sign {todo.length === 2 ? 'the Terms and Conditions and the Privacy Policy' : DOCUMENTS[todo[0]].title}.
          {admin && s.state === 'ok' && ` As company admin you sign on behalf of ${s.ctx.companyName}.`} You can read them again any time from the links at the
          bottom of the menu.
        </p>
        {error && (
          <div className="o-banner bad" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <form action={signAgreementsAction} className="o-stack" style={{ gap: 14 }}>
          {todo.map((id) => (
            <div key={id} className="o-stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>{DOCUMENTS[id].title}</h2>
              <LegalText doc={DOCUMENTS[id]} compact />
              <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
                <input type="checkbox" name={id} required />I have read and agree to the {DOCUMENTS[id].title}
              </label>
            </div>
          ))}
          {/* A document already signed counts as ticked. */}
          {LEGAL_DOCS.filter((d) => !todo.includes(d.id)).map((d) => (
            <input key={d.id} type="hidden" name={d.id} value="on" />
          ))}
          <label className="o-field" style={{ maxWidth: 360 }}>
            Type your full name to sign
            <input className="o-input" name="signedName" required minLength={2} maxLength={120} defaultValue={name.includes('@') ? '' : name} autoComplete="name" />
          </label>
          <p className="faint" style={{ fontSize: 12, margin: 0 }}>
            Your name, the date and time, and the versions you sign are recorded{admin ? ' for your company and for Orbit' : ''}.
          </p>
          <div className="o-row" style={{ gap: 8, justifyContent: 'space-between' }}>
            <a className="o-btn" href="/auth/sign-out">
              Sign out
            </a>
            <button className="o-btn primary" type="submit">
              Agree and sign
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
