import { redirect } from 'next/navigation';
import { readMemberPortals } from '@orbit/core';
import { getSession, query } from '@orbit/core/next';
import { accessiblePortals } from '@/portal-access';
import { portalModules } from '@/portals';
import { AuthCard } from '../AuthCard';

export const dynamic = 'force-dynamic';

/** Portal chooser after sign-in: the portals this person can open, and the ones still waiting for approval. */
export default async function Portals() {
  const s = await getSession();
  if (s.state !== 'ok') redirect('/');
  const { open, waiting } = await query(async (tx, ctx) => {
    const open = await accessiblePortals(tx, ctx);
    const rows = await readMemberPortals(tx, [ctx.membershipId]);
    return { open, waiting: rows.filter((r) => r.status === 'requested' && portalModules[r.portal]).map((r) => r.portal) };
  });
  const name = (id: string) => portalModules[id]?.manifest.name ?? id;
  return (
    <AuthCard title="Choose a portal">
      <p className="muted" style={{ fontSize: 13 }}>
        Signed in to {s.ctx.companyName} as {s.ctx.name}.
      </p>
      <div className="o-stack" style={{ gap: 8 }}>
        {(s.ctx.role === 'management' || s.ctx.role === 'company_admin') && (
          <a className="o-btn primary block" href="/manage">
            Management workspace
          </a>
        )}
        {open.map((p) => (
          <a key={p} className="o-btn primary block" href={`/${p}`}>
            {name(p)}
          </a>
        ))}
        {waiting.map((p) => (
          <div key={p} className="o-row" style={{ justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: 4, padding: '8px 12px' }}>
            <span>{name(p)}</span>
            <span className="o-chip warn">Waiting for approval</span>
          </div>
        ))}
        {open.length === 0 && waiting.length === 0 && <p className="muted">No portals are switched on for you yet. Ask your company admin.</p>}
      </div>
      <a className="o-btn" href="/auth/sign-out" style={{ marginTop: 16 }}>
        Sign out
      </a>
    </AuthCard>
  );
}
