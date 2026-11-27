import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { EmptyState, TopBar } from '@orbit/ui';
import { MARKS } from '../config';
import { attendance, employees, isHrStaff, leave, myRole, NOT_READY, notReady } from '../server';
import { EmployeesClient, LeaveQueueClient, LeaveTypesClient, MyLeaveClient } from './HrClients';

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Page({ crumb, title, lead, children }: { crumb: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <>
      <TopBar crumbs={['HR', crumb]} />
      <div className="o-page">
        <div className="o-page-head">
          <div>
            <h1>{title}</h1>
            {lead && <p>{lead}</p>}
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

/** Before migration 0036 every HR page says the portal is not ready yet, instead of failing. */
async function guarded(render: () => Promise<ReactNode>): Promise<ReactNode> {
  try {
    return await render();
  } catch (err) {
    if (notReady(err)) return <Page crumb="HR" title="HR"><EmptyState title={NOT_READY} /></Page>;
    throw err;
  }
}

const MyHr: Screen = async () =>
  guarded(async () => {
    const d = await query(async (tx, ctx) => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
      return { today, balances: await leave.balances(tx, ctx, ctx.membershipId, Number(today.slice(0, 4))), mine: await leave.myLeave(tx, ctx), record: await employees.myRecord(tx, ctx), name: ctx.name };
    });
    const r = d.record;
    return (
      <Page crumb="My HR" title={`My HR, ${d.name}`} lead="Your leave balance, leave requests and record.">
        {r && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {[r.employeeCode, r.designation, r.department, r.joiningDate ? `joined ${r.joiningDate}` : null].filter(Boolean).join(' · ')}
          </p>
        )}
        <MyLeaveClient balances={d.balances} mine={d.mine} today={d.today} />
      </Page>
    );
  });

const Approvals: Screen = async () =>
  guarded(async () => {
    const rows = await query((tx, ctx) => leave.leaveQueue(tx, ctx));
    return (
      <Page crumb="Leave approvals" title="Leave approvals" lead="Leave asked for by the people you supervise (HR sees everyone's).">
        <LeaveQueueClient rows={rows} />
      </Page>
    );
  });

const Attendance: Screen = async ({ searchParams }) =>
  guarded(async () => {
    const v = await query((tx, ctx) => attendance.monthAttendance(tx, ctx, { month: one(searchParams.month) }));
    const title = new Date(`${v.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return (
      <Page crumb="Attendance" title={`Attendance, ${title}`} lead="Worked out from Timesheet hours, approved leave, public holidays and the weekly off. Nothing to type in.">
        <form className="o-row" style={{ gap: 6 }}>
          <input className="o-input" type="month" name="month" defaultValue={v.month} aria-label="Month" style={{ width: 170 }} />
          <button className="o-btn small" type="submit">
            Show
          </button>
        </form>
        {v.rows.length === 0 ? (
          <EmptyState title="Nobody to show." />
        ) : (
          <div className="o-panel flush">
            <div className="o-scroll">
              <table className="hr-att">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    {v.days.map((d) => (
                      <th key={d.date} scope="col" title={d.holiday ?? undefined} className={d.holiday ? 'hol' : ''}>
                        <span className="faint">{d.dow}</span>
                        <br />
                        {d.day}
                      </th>
                    ))}
                    <th scope="col">Present</th>
                    <th scope="col">Leave</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {v.rows.map((r) => (
                    <tr key={r.membershipId}>
                      <th scope="row">
                        {r.name}
                        {r.code && <div className="faint">{r.code}</div>}
                      </th>
                      {r.marks.map((m, i) => (
                        <td key={i} className={`m-${m === '-' ? 'none' : m}`} title={`${v.days[i].date}: ${MARKS[m].label}`}>
                          {m === '-' ? '' : m}
                        </td>
                      ))}
                      <td className="num">{r.present}</td>
                      <td className="num">{r.leave}</td>
                      <td className="num">{r.absent ? <span className="bad">{r.absent}</span> : 0}</td>
                      <td className="num">{r.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="o-row" style={{ gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
          {Object.entries(MARKS)
            .filter(([k]) => k !== '-')
            .map(([k, m]) => (
              <span key={k}>
                <strong>{k}</strong> {m.label}
              </span>
            ))}
        </div>
      </Page>
    );
  });

const Employees: Screen = async () =>
  guarded(async () => {
    const d = await query((tx, ctx) => employees.directory(tx, ctx));
    return (
      <Page crumb="Employees" title="Employees" lead="Everyone in the company and their HR record. People are added in Company admin, People and portals.">
        <EmployeesClient rows={d.rows} canEdit={d.canEdit} />
      </Page>
    );
  });

const Settings: Screen = async () =>
  guarded(async () => {
    const d = await query(async (tx, ctx) => ({ staff: isHrStaff(await myRole(tx, ctx)), types: await leave.leaveTypes(tx, ctx, true) }));
    if (!d.staff) return <Page crumb="HR settings" title="HR settings"><EmptyState title="Only HR can change these settings." /></Page>;
    return (
      <Page crumb="HR settings" title="HR settings" lead="Leave types and how many days a year each gives. Public holidays are set in Timesheet, Shifts and holidays.">
        <LeaveTypesClient types={d.types} />
      </Page>
    );
  });

/** Path (after /hr) -> screen. Keys match manifest.nav paths. */
export const hrRoutes: Record<string, Screen> = {
  '': MyHr,
  leave: Approvals,
  attendance: Attendance,
  employees: Employees,
  'admin/settings': Settings,
};
