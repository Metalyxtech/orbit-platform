import { KpiStrip, LineChart, PieChart, StackedBarChart } from '@orbit/ui';
import { portalColor, type PortalGlance } from './glance';

/**
 * The company on one screen, across every portal it has: totals, a pie of where the open work
 * is, a line of new work per month and a bar of on-time against late. With one portal the same
 * charts show just that portal.
 */
export function CompanyGlance({ labels, rows, waiting }: { labels: string[]; rows: PortalGlance[]; waiting: number }) {
  if (!rows.length) return null;
  const open = rows.reduce((n, r) => n + r.open, 0);
  const late = rows.reduce((n, r) => n + r.late, 0);
  const thisMonth = rows.reduce((n, r) => n + (r.months.at(-1) ?? 0), 0);
  return (
    <section className="o-stack" style={{ gap: 16 }}>
      <KpiStrip
        items={[
          { value: String(open), label: rows.length === 1 ? `${rows[0].unit[0].toUpperCase()}${rows[0].unit.slice(1)}` : 'Open items, all portals' },
          { value: String(late), label: 'Past their date', tone: late ? 'hivis' : undefined },
          { value: String(waiting), label: 'Waiting for you', tone: waiting ? 'hivis' : undefined },
          { value: String(thisMonth), label: 'Started this month' },
        ]}
      />
      <div className="o-chart-grid">
        <div className="o-panel">
          <h2>Open work by portal</h2>
          <PieChart unit="" decimals={0} size={170} empty="Nothing is open right now." label="Open work by portal" slices={rows.map((r) => ({ label: r.name, value: r.open, detail: r.unit, color: portalColor(r.portal) }))} />
        </div>
        <div className="o-panel">
          <h2>New work per month</h2>
          <LineChart
            label="New work per month by portal"
            area={rows.length === 1}
            series={rows.map((r) => ({ name: r.name, color: portalColor(r.portal) }))}
            points={labels.map((l, i) => ({ label: l, values: rows.map((r) => r.months[i] ?? 0) }))}
            empty="Nothing started in the last 6 months."
          />
          <p className="o-chart-note">Enquiries, purchase requests, work orders, inspections and timesheets submitted. Last 6 months.</p>
        </div>
        <div className="o-panel">
          <h2>On time and late</h2>
          {open === 0 ? (
            <div className="o-empty">Nothing is open right now.</div>
          ) : (
            <StackedBarChart
              unit=""
              series={[
                { name: 'On time', color: '#2f5d8a' },
                { name: 'Past its date', color: '#c94f6d' },
              ]}
              rows={rows.filter((r) => r.open > 0).map((r) => ({ label: r.name, detail: r.unit, parts: [r.open - r.late, r.late] }))}
            />
          )}
          <p className="o-chart-note">Late means past the follow-up, need-by or due date.</p>
        </div>
      </div>
    </section>
  );
}
