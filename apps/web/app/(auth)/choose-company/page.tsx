import { redirect } from 'next/navigation';
import { getSession } from '@orbit/core/next';
import { chooseCompanyAction } from '@/session-actions';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

const ROLE: Record<string, string> = {
  company_admin: 'Company admin',
  management: 'Management (GM)',
  project_manager: 'Project manager',
  supervisor: 'Supervisor',
  employee: 'Employee',
};

/** After sign-in, for people in more than one company: pick the company to open. */
export default async function ChooseCompany() {
  const s = await getSession();
  if (s.state !== 'ok') redirect('/');
  if (s.companies.length < 2) redirect('/');
  return (
    <AuthCard title="Choose a company">
      <p className="muted" style={{ fontSize: 13 }}>
        Signed in as {s.ctx.email}. You belong to {s.companies.length} companies. You can switch later from the bottom of the menu.
      </p>
      <form action={chooseCompanyAction} className="o-stack" style={{ gap: 8 }}>
        {s.companies.map((c) => (
          <button key={c.id} name="companyId" value={c.id} type="submit" className="o-btn block" style={{ justifyContent: 'space-between', display: 'flex', textAlign: 'left' }}>
            <strong>{c.name}</strong>
            <span className="faint" style={{ fontSize: 12 }}>{ROLE[c.role] ?? c.role}</span>
          </button>
        ))}
      </form>
    </AuthCard>
  );
}
