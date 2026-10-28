import { asc } from 'drizzle-orm';
import { devAuthEnabled, getDb } from '@orbit/core/next';
import { users } from '@orbit/db';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const dev = devAuthEnabled();
  const people = dev ? await (await getDb()).select().from(users).orderBy(asc(users.name)) : [];
  return (
    <AuthCard title="Sign in">
      <p className="muted">Use your company Microsoft or Google account, or an email code.</p>
      {error && <div className="o-banner bad" style={{ marginBottom: 12 }}>Sign-in did not complete. Please try again.</div>}
      <a className="o-btn primary block" style={{ display: 'block', textAlign: 'center' }} href="/auth/login">
        Continue
      </a>
      <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>
        New company? <a href="/auth/login?hint=sign-up">Create an account</a> and register your company.
      </p>
      {dev && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>Local development: sign in as</div>
          {people.map((u) => (
            <a key={u.id} href={`/auth/dev?email=${encodeURIComponent(u.email)}`} style={{ display: 'block', padding: '4px 0', fontSize: 13 }}>
              {u.name} <span className="faint">{u.email}</span>
            </a>
          ))}
        </div>
      )}
    </AuthCard>
  );
}
