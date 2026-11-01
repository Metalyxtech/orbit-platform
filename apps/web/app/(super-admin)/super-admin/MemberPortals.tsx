import type { MemberPortalRow } from '@orbit/core';
import { setMemberPortalAction } from './actions';

type CompanyPortal = { id: string; name: string; state: 'on' | 'requested' | 'none' };

/**
 * One person's portal access with Super Admin controls. Admins and management see every portal the
 * company has on; people without rows (joined before portal requests) have every portal on.
 */
export function MemberPortals({
  companyId,
  membershipId,
  role,
  memberStatus,
  companyPortals,
  rows,
}: {
  companyId: string;
  membershipId: string;
  role: string;
  memberStatus: string;
  companyPortals: CompanyPortal[];
  rows: MemberPortalRow[];
}) {
  if (role === 'company_admin' || role === 'management') return <span className="faint">All portals</span>;
  const mine = rows.filter((r) => r.membershipId === membershipId);
  const shown = companyPortals.filter((p) => p.state !== 'none' || mine.some((m) => m.portal === p.id));
  if (shown.length === 0) return <span className="faint">None</span>;
  return (
    <div className="o-stack" style={{ gap: 4 }}>
      {shown.map((p) => {
        const row = mine.find((m) => m.portal === p.id);
        const status = row ? row.status : mine.length === 0 && p.state === 'on' ? 'active' : 'off';
        const tone = status === 'active' ? 'ok' : status === 'requested' ? 'warn' : '';
        const label = status === 'active' ? 'On' : status === 'requested' ? 'Requested' : 'Off';
        return (
          <form key={p.id} className="o-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <span className={`o-chip ${tone}`} title={p.state !== 'on' ? 'The company portal is not switched on yet' : undefined}>
              {p.name}: {label}
              {p.state !== 'on' ? ' (company portal off)' : ''}
            </span>
            {memberStatus !== 'disabled' &&
              (status === 'active' ? (
                <button className="o-btn small" formAction={setMemberPortalAction.bind(null, companyId, membershipId, p.id, false)}>
                  Turn off
                </button>
              ) : (
                <button className="o-btn small ok" formAction={setMemberPortalAction.bind(null, companyId, membershipId, p.id, true)}>
                  {status === 'requested' ? 'Approve' : 'Give access'}
                </button>
              ))}
          </form>
        );
      })}
    </div>
  );
}
