import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { joinCompanyAction, registerCompanyAction } from '@/session-actions';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

const errors: Record<string, string> = {
  not_found: 'No active company has that name. Check the spelling with your company admin.',
  exists: 'A company with that name is already registered. Use "Join your company" above instead.',
};

export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state !== 'no_company') redirect('/');
  const error = errors[(await searchParams).error ?? ''];
  return (
    <AuthCard title="Join your company">
      <p className="muted" style={{ fontSize: 13 }}>
        Signed in as {s.email}. If your company already uses Orbit, enter its name. Your company admin approves the request.
      </p>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--bad)' }}>
          {error}
        </p>
      )}
      <form action={joinCompanyAction} className="o-stack" style={{ gap: 12 }}>
        <label className="o-field">
          Company name
          <input className="o-input" name="company" required minLength={2} maxLength={120} />
        </label>
        <label className="o-field">
          Your job title
          <input className="o-input" name="title" maxLength={100} placeholder="Site engineer" />
        </label>
        <button className="o-btn primary block" type="submit">
          Request to join
        </button>
      </form>

      <h2 style={{ fontSize: 15, margin: '24px 0 8px' }}>New to Orbit? Register your company</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        You become its company admin once Orbit approves the registration.
      </p>
      <form action={registerCompanyAction} className="o-stack" style={{ gap: 12 }}>
        <label className="o-field">
          Company name
          <input className="o-input" name="name" required minLength={2} maxLength={120} />
        </label>
        <label className="o-field">
          Your job title
          <input className="o-input" name="title" maxLength={100} placeholder="Company admin" />
        </label>
        <label className="o-field">
          Time zone
          <select className="o-select" name="timezone" defaultValue="Asia/Kolkata">
            {['Asia/Kolkata', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Europe/London', 'Australia/Perth', 'UTC'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button className="o-btn block" type="submit">
          Register company
        </button>
      </form>
    </AuthCard>
  );
}
