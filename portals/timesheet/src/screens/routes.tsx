import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { DataTable, EmptyState, HBarChart, KpiStrip, StatusChip, TopBar } from '@orbit/ui';
import { admin, approvals, reports, week } from '../server';
import { ApprovalsClient } from './ApprovalsClient';
import { HistoryClient } from './HistoryClient';
import { MyWeekClient } from './MyWeekClient';
import { ProjectsClient, ReportFilters, SettingsClient, UsersClient, WorkflowClient } from './AdminClients';

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

const fmtH = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Dashboard, by role. Management and admins: the whole company. Project managers: their projects
 * and the people on them. Supervisors: their team. Everyone: what waits for their approval.
 */
const Dashboard: Screen = async () => {
  const data = await query(async (tx, ctx) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
    const month = today.slice(0, 7);
    const company = ctx.role === 'company_admin' || ctx.role === 'management';
    const pm = ctx.role === 'project_manager';
    return {
      name: ctx.name.split(' ')[0],
      companyName: ctx.companyName,
      view: company ? ('company' as const) : pm ? ('pm' as const) : ('team' as const),
      month,
      waiting: await approvals.mine(tx, ctx),
      team: await admin.teamOverview(tx, ctx, { weekStart: today }),
      kpis: company || pm ? await reports.kpis(tx, ctx, { month }) : null,
      byProject: company || pm ? await reports.hoursByProject(tx, ctx, { month }) : [],
      byPerson: company || pm ? await reports.hoursByPerson(tx, ctx, { month }) : [],
      levels: company ? await reports.approvalsByLevel(tx, ctx) : [],
      byApprover: company ? await reports.waitingByApprover(tx, ctx) : [],
      top: company || pm ? await reports.topOvertime(tx, ctx, { month }) : [],
    };
  });
  const rows = data.team.rows;
  const count = (...st: string[]) => rows.filter((r) => st.includes(r.status)).length;
  const missing = rows.filter((r) => ['not_started', 'draft', 'returned'].includes(r.status));
  const monthLabel = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const k = data.kpis;
  const overdueLevels = data.levels.reduce((n, l) => n + l.overdue, 0);
  const subtitle =
    data.view === 'company'
      ? `${data.companyName} at a glance: week ${data.team.week} and ${monthLabel}.`
      : data.view === 'pm'
        ? `Your projects and the people on them, week ${data.team.week} and ${monthLabel}.`
        : `Your team, week ${data.team.week}.`;

  const waitingPanel = (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Waiting for you</h2>
        <a className="o-btn small" href="/timesheet/approvals">
          Open approvals
        </a>
      </div>
      <DataTable
        rows={data.waiting.slice(0, 6)}
        rowKey={(r) => r.taskId}
        empty={<span className="faint">Nothing waiting. You are up to date.</span>}
        columns={[
          { key: 'e', header: 'Employee', render: (r) => r.employee },
          { key: 'w', header: 'Week', num: true, render: (r) => r.week },
          { key: 't', header: 'Hours', num: true, render: (r) => fmtH(r.total) },
          { key: 'd', header: '', render: (r) => (r.overdue ? <span className="o-chip bad">Overdue</span> : <span className="faint">{r.stepLabel}</span>) },
        ]}
      />
    </div>
  );

  return (
    <>
      <TopBar crumbs={['Timesheet', 'Dashboard']} />
      <div className="o-page">
        <div>
          <h1>Hello, {data.name}</h1>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            {subtitle}
          </p>
        </div>
        <KpiStrip
          items={[
            { value: String(data.waiting.length), label: 'Waiting for your approval', tone: data.waiting.length ? 'hivis' : undefined },
            { value: `${count('in_approval', 'locked')} / ${rows.length}`, label: data.view === 'company' ? 'Submitted this week, company' : 'Team submitted this week' },
            { value: String(count('locked')), label: 'Approved this week' },
            data.view === 'company'
              ? { value: String(overdueLevels), label: 'Approvals overdue, company', tone: overdueLevels ? 'hivis' : undefined }
              : { value: String(missing.length), label: 'Not submitted yet' },
          ]}
        />
        {k && (
          <KpiStrip
            items={[
              { value: fmtH(k.approvedHours), label: `Approved hours, ${monthLabel}${data.view === 'pm' ? ', your projects' : ''}` },
              { value: fmtH(k.overtimeHours), label: `Overtime hours (${k.overtimePct}%)`, tone: 'hivis' },
              { value: `${k.onTimePct}%`, label: 'Weeks submitted on time' },
              { value: String(k.waiting), label: 'Timesheets in approval, company' },
            ]}
          />
        )}

        <div className="o-cols-wide">
          <div className="o-stack">
            {k && (
              <div className="o-panel">
                <div className="o-panel-head">
                  <h2>Hours by project, {monthLabel}</h2>
                  <a className="o-btn small" href="/timesheet/reports">
                    Reports
                  </a>
                </div>
                {data.byProject.length ? (
                  <HBarChart rows={data.byProject.map((p) => ({ label: p.label, regular: p.regular, overtime: p.overtime }))} />
                ) : (
                  <EmptyState title="No approved hours this month yet." />
                )}
              </div>
            )}
            {data.view === 'company' && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>Approvals by level</h2>
                </div>
                <DataTable
                  rows={data.levels}
                  rowKey={(r) => r.level}
                  empty={<span className="faint">Nothing is waiting for approval.</span>}
                  columns={[
                    { key: 'l', header: 'Level', render: (r) => r.level },
                    { key: 'w', header: 'Waiting', num: true, render: (r) => r.waiting },
                    { key: 'o', header: 'Overdue', num: true, render: (r) => (r.overdue ? <span className="o-chip bad">{r.overdue}</span> : '-') },
                    { key: 'a', header: 'Oldest', num: true, render: (r) => `${r.oldestHours} h` },
                  ]}
                />
              </div>
            )}
            {k && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>{data.view === 'pm' ? `People on your projects, ${monthLabel}` : `Hours by person, ${monthLabel}`}</h2>
                </div>
                <DataTable
                  rows={data.byPerson.slice(0, 15)}
                  rowKey={(r) => r.name}
                  empty={<span className="faint">No hours submitted on these projects this month yet.</span>}
                  columns={[
                    {
                      key: 'n',
                      header: 'Name',
                      render: (r) => (
                        <div>
                          {r.name}
                          <div className="faint" style={{ fontSize: 11 }}>{r.title}</div>
                        </div>
                      ),
                    },
                    { key: 'p', header: 'Projects', num: true, render: (r) => r.projects },
                    { key: 'h', header: 'Submitted h', num: true, render: (r) => fmtH(r.hours) },
                    { key: 'a', header: 'Approved h', num: true, render: (r) => fmtH(r.approved) },
                  ]}
                />
              </div>
            )}
          </div>

          <div className="o-stack">
            {waitingPanel}
            {data.view === 'company' && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>Waiting by approver</h2>
                </div>
                <DataTable
                  rows={data.byApprover}
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
            )}
            {k && (
              <div className="o-panel flush">
                <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                  <h2>{data.view === 'pm' ? `Highest overtime on your projects, ${monthLabel}` : `Highest overtime, ${monthLabel}`}</h2>
                </div>
                <DataTable
                  rows={data.view === 'pm' ? data.top.filter((t) => data.byPerson.some((p) => p.name === t.name)) : data.top}
                  rowKey={(r) => r.name}
                  empty={<span className="faint">No approved overtime this month.</span>}
                  columns={[
                    { key: 'n', header: 'Name', render: (r) => r.name },
                    { key: 'o', header: 'Overtime', num: true, render: (r) => `${fmtH(r.overtime)} h` },
                  ]}
                />
              </div>
            )}
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>{data.view === 'company' ? `Not submitted, week ${data.team.week}` : 'Team this week'}</h2>
                <a className="o-btn small" href="/timesheet/team">
                  Team overview
                </a>
              </div>
              <DataTable
                rows={data.view === 'company' ? missing : rows}
                rowKey={(r) => r.membershipId}
                empty={
                  <span className="faint">
                    {data.view === 'company' ? 'Everyone has submitted.' : 'Nobody reports to you yet. Supervisors are set on the Users page.'}
                  </span>
                }
                columns={[
                  {
                    key: 'n',
                    header: 'Name',
                    render: (r) => (
                      <div>
                        {r.name}
                        <div className="faint" style={{ fontSize: 11 }}>{r.title}</div>
                      </div>
                    ),
                  },
                  { key: 'h', header: 'Hours', num: true, render: (r) => (r.total ? fmtH(r.total) : '-') },
                  { key: 's', header: 'Status', render: (r) => <StatusChip status={r.status} /> },
                ]}
              />
            </div>
          </div>
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
  const data = await query(async (tx, ctx) => ({ projects: await admin.listProjects(tx, ctx), managers: await admin.listManagers(tx, ctx) }));
  return <ProjectsClient projects={data.projects} managers={data.managers} />;
};

const Workflow: Screen = async () => {
  const data = await query((tx, ctx) => admin.workflowOverview(tx, ctx));
  return <WorkflowClient {...data} />;
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
  dashboard: Dashboard,
  '': MyWeek,
  history: History,
  approvals: Approvals,
  team: Team,
  reports: Reports,
  'admin/users': Users,
  'admin/projects': Projects,
  'admin/workflow': Workflow,
  'admin/settings': Settings,
};
