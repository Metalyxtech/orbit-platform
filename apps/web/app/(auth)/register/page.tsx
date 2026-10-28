import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { registerCompanyAction } from '@/session-actions';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

export default async function Register() {
  const s = await getSession();
  if (s.state === 'signed_out') redirect('/sign-in');
  if (s.state !== 'no_company') redirect('/');
  return (
    <AuthCard title="Register your company">
      <p className="muted" style={{ fontSize: 13 }}>
        Signed in as {s.email}. If your company already uses Orbit, ask your company admin to invite you instead.
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
        <button className="o-btn primary block" type="submit">
          Register company
        </button>
      </form>
    </AuthCard>
  );
}
