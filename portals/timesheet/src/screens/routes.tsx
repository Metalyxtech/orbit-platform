import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { DataTable, EmptyState, HBarChart, KpiStrip, StatusChip, TopBar } from '@orbit/ui';
import { admin, approvals, reports, week } from '../server';
import { ApprovalsClient } from './ApprovalsClient';
import { HistoryClient } from './HistoryClient';
import { MyWeekClient } from './MyWeekClient';
import { ProjectsClient, ReportFilters, SettingsClient, UsersClient } from './AdminClients';

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const MyWeek: Screen = async ({ searchParams }) => {
  const { view, ctx } = await query(async (tx, ctx) => ({ view: await week.getWeek(tx, ctx, { weekStart: one(searchParams.week) }), ctx }));
  const key = `${view.weekStart}:${view.timesheet.status}:${view.timesheet.revision}:${view.rows.length}`;
  return <MyWeekClient key={key} view={view} draftKey={`orbit-ts:${ctx.membershipId}:${view.weekStart}`} />;
};

const History: Screen = async ({ searchParams }) => {
  const { rows, tz } = await query(async (tx, ctx) => ({
    rows: await week.history(tx, ctx, {
      weeks: Number(one(searchParams.weeks) ?? 12) || 12,
      status: (one(searchParams.status) || undefined) as week.TimesheetStatus | undefined,
    }),
    tz: ctx.timezone,
  }));
  return <HistoryClient rows={rows} timezone={tz} />;
};

const Approvals: Screen = async () => {
  const rows = await query((tx, ctx) => approvals.mine(tx, ctx));
  return <ApprovalsClient rows={rows} />;
};

const Team: Screen = async ({ searchParams }) => {
  const data = await query((tx, ctx) => admin.teamOverview(tx, ctx, { weekStart: one(searchParams.week) }));
  return (
    <>
      <TopBar crumbs={['Timesheet', 'Team overview']} />
      <div className="o-page">
        <div>
          <h1>Team overview, week {data.week}</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Where each person's timesheet is for last week.</p>
        </div>
        <div className="o-panel flush">
          <DataTable
            rows={data.rows}
            rowKey={(r) => r.membershipId}
            empty={<EmptyState title="Nobody reports to you yet." />}
            columns={[
              { key: 'n', header: 'Name', render: (r) => r.name },
              { key: 't', header: 'Title', render: (r) => <span className="muted">{r.title}</span> },
              { key: 'h', header: 'Total', num: true, render: (r) => r.total.toFixed(1) },
              { key: 'o', header: 'Overtime', num: true, render: (r) => (r.overtime ? <span className="hivis">{r.overtime.toFixed(1)}</span> : '0.0') },
              { key: 's', header: 'Status', render: (r) => <StatusChip status={r.status} /> },
            ]}
          />
        </div>
      </div>
    </>
  );
};

const Reports: Screen = async ({ searchParams }) => {
  const month = one(searchParams.month) ?? new Date().toISOString().slice(0, 7);
  const projectId = one(searchParams.project) ?? '';
  const filter = { month, projectIds: projectId ? [projectId] : undefined };
  const data = await query(async (tx, ctx) => ({
    kpis: await reports.kpis(tx, ctx, filter),
    byProject: await reports.hoursByProject(tx, ctx, filter),
    waiting: await reports.waitingByApprover(tx, ctx),
    top: await reports.topOvertime(tx, ctx, filter),
    projects: await reports.reportProjects(tx, ctx),
  }));
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const k = data.kpis;
  return (
    <>
      <ReportFilters month={month} projectId={projectId} projects={data.projects} />
      <div className="o-page">
        <div>
          <h1>Labour hours, {monthLabel}</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Approved hours for projects you manage. Figures update when a timesheet is approved.
          </p>
        </div>
        <KpiStrip
          items={[
            { value: k.approvedHours.toLocaleString('en-GB', { minimumFractionDigits: 1 }), label: 'Approved hours' },
            { value: k.overtimeHours.toLocaleString('en-GB', { minimumFractionDigits: 1 }), label: `Overtime hours (${k.overtimePct}%)`, tone: 'hivis' },
            { value: `${k.onTimePct}%`, label: 'Weeks submitted on time' },
            { value: String(k.waiting), label: 'Timesheets waiting for approval' },
          ]}
        />
        <div className="o-cols-wide">
          <div className="o-panel">
            <div className="o-panel-head">
              <h2>Hours by project</h2>
              <span className="o-legend">
                <span>
                  <i style={{ background: 'var(--steel)' }} />
                  Regular
                </span>
                <span>
                  <i style={{ background: 'var(--hatch)' }} />
                  Overtime
                </span>
              </span>
            </div>
            {data.byProject.length ? (
              <HBarChart rows={data.byProject.map((p) => ({ label: p.label, regular: p.regular, overtime: p.overtime }))} />
            ) : (
              <EmptyState title="No approved hours in this month yet." />
            )}
          </div>
          <div className="o-stack">
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>Waiting by approver</h2>
              </div>
              <DataTable
                rows={data.waiting}
                rowKey={(r) => r.name}
                empty={<span className="faint">Nothing waiting.</span>}
                columns={[
                  {
                    key: 'a',
                    header: 'Approver',
                    render: (r) => (
                      <div>
                        {r.name}
                        <div className="faint" style={{ fontSize: 11 }}>{r.title}</div>
                      </div>
                    ),
                  },
                  { key: 'w', header: 'Waiting', num: true, render: (r) => r.waiting },
                  { key: 'o', header: 'Oldest', num: true, render: (r) => (r.oldestHours >= 24 ? <span className="o-chip bad">{r.oldestHours} h</span> : `${r.oldestHours} h`) },
                ]}
              />
            </div>
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>Highest overtime this month</h2>
              </div>
              <DataTable
                rows={data.top}
                rowKey={(r) => r.name}
                empty={<span className="faint">No overtime.</span>}
                columns={[
                  { key: 'n', header: 'Name', render: (r) => r.name },
                  { key: 'o', header: 'Overtime', num: true, render: (r) => `${r.overtime.toFixed(1)} h` },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const Users: Screen = async () => {
  const data = await query(async (tx, ctx) => ({ users: await admin.listUsers(tx, ctx), corrections: await admin.listCorrections(tx, ctx) }));
  return <UsersClient users={data.users} corrections={data.corrections} />;
};

const Projects: Screen = async () => {
  const projects = await query((tx, ctx) => admin.listProjects(tx, ctx));
  return <ProjectsClient projects={projects} />;
};

const Settings: Screen = async () => {
  const data = await query(async (tx, ctx) => ({
    s: await admin.getSettings(tx, ctx),
    projects: await admin.listProjects(tx, ctx),
    companyName: ctx.companyName,
  }));
  return (
    <SettingsClient
      initial={data.s.values as Record<string, unknown>}
      workflow={data.s.workflow}
      timezone={data.s.timezone}
      companyName={data.companyName}
      projects={data.projects}
    />
  );
};

/** Path (after /timesheet) -> screen. Keys match manifest.nav paths. */
export const timesheetRoutes: Record<string, Screen> = {
  '': MyWeek,
  history: History,
  approvals: Approvals,
  team: Team,
  reports: Reports,
  'admin/users': Users,
  'admin/projects': Projects,
  'admin/settings': Settings,
};
