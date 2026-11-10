import { asc } from 'drizzle-orm';
import { devAuthEnabled, getDb } from '@orbit/core/next';
import { users } from '@orbit/db';
import { Icon } from '@orbit/ui';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const dev = devAuthEnabled();
  const people = dev ? await (await getDb()).select().from(users).orderBy(asc(users.name)) : [];
  return (
    <AuthCard title="Sign in to Orbit">
      <p className="muted" style={{ marginBottom: 20 }}>
        Use your company Microsoft or Google account, or a one-time code sent to your work email.
      </p>
      {error && (
        <div className="o-banner bad" role="alert" style={{ marginBottom: 16 }}>
          Sign-in did not complete. Please try again.
        </div>
      )}
      <a className="o-btn primary block" href="/auth/login">
        Continue to sign in
      </a>
      <p className="muted" style={{ fontSize: 13, margin: '16px 0 0' }}>
        New company? <a href="/auth/login?hint=sign-up">Create an account</a> and register your company.
      </p>
      <div className="o-auth-note">
        <Icon name="lock" />
        <span>Orbit never sees your password. Sign-in is handled by your identity provider over an encrypted connection.</span>
      </div>
      {dev && (
        <div className="o-devlist">
          <div>Local development: sign in as</div>
          {people.map((u) => (
            <a key={u.id} href={`/auth/dev?email=${encodeURIComponent(u.email)}`}>
              {u.name} <span>{u.email}</span>
            </a>
          ))}
        </div>
      )}
    </AuthCard>
  );
}
