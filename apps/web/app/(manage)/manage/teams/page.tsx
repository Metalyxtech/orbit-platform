import { redirect } from 'next/navigation';
import { getSession, query } from '@orbit/core/next';
import { canManageTeams, teamsOverview } from '@orbit/core/teams';
import { EmptyState } from '@orbit/ui';
import { TeamsClient } from './TeamsClient';

export const dynamic = 'force-dynamic';

/** GM and company admins: put people on each project (won sales order). */
export default async function ProjectTeamsPage() {
  const s = await getSession();
  if (s.state !== 'ok' || !canManageTeams(s.ctx)) redirect('/manage');
  const d = await query((tx, ctx) => teamsOverview(tx, ctx));
  return (
    <>
      <header className="o-top">
        <strong>Project teams</strong>
      </header>
      <div className="o-page">
        <p className="muted" style={{ fontSize: 13, margin: 0, maxWidth: '75ch' }}>
          Put the people who work on a project in its team: its managers, engineers, supervisors, store keepers and QC. A project with a team is seen <strong>only by its team</strong>, the GM and
          company admins, in Sales, Production, Purchase and Quality, including approvals and task lists. Projects without a team stay open to everyone.
        </p>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {d.fromSales
            ? 'Projects come from Sales: each won enquiry (sales order) is a project.'
            : 'Your company does not use the Sales portal, so add your projects here. They also appear in Timesheet (hours) and Purchase (requests), and work orders can be made for them.'}
        </p>
        {!d.ready ? (
          <EmptyState title="Project teams switch on after the latest database update." />
        ) : (
          <TeamsClient projects={d.projects} people={d.people} canAdd={!d.fromSales} />
        )}
      </div>
    </>
  );
}
