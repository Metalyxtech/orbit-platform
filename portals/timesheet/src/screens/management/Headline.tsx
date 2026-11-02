import { query } from '@orbit/core/next';
import { KpiStrip } from '@orbit/ui';
import { executive } from '../../server';
import { fmtH, monthName } from './shared';

/** One-line Timesheet summary for the Management overview page. */
export async function TimesheetHeadline() {
  const d = await query((tx, ctx) => executive.summaryView(tx, ctx));
  const k = d.kpis;
  const overdue = d.levels.reduce((n, l) => n + l.overdue, 0);
  return (
    <KpiStrip
      items={[
        { value: fmtH(k.approvedHours), label: `Approved hours, ${monthName(d.month)}` },
        { value: fmtH(k.overtimeHours), label: `Overtime (${k.overtimePct}%)`, tone: 'hivis' },
        { value: `${k.onTimePct}%`, label: 'Weeks submitted on time' },
        { value: String(k.waiting), label: overdue ? `In approval (${overdue} overdue)` : 'In approval' },
      ]}
    />
  );
}
