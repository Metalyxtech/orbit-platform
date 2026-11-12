import Link from 'next/link';
import { Chip, ColumnChart, PieChart, StackedBarChart } from '@orbit/ui';
import { fmtDate, fmtQty } from '../config';
import type { dashboard } from '../server';
import { PriorityChip, Progress, StatusChip, woHref } from './ui';

type Data = Awaited<ReturnType<typeof dashboard.dashboard>>;

const STAGE_COLORS: Record<string, string> = { draft: '#9aa3ab', pending_release: '#d4a72c', released: '#4aa3c7', in_progress: '#2f5d8a', final_qc: '#8b5fbf', completed: '#3a9a6b' };
const MATERIAL: Record<Data['orders'][number]['material'], { label: string; tone: 'grey' | 'steel' | 'hivis' | 'warn' }> = {
  ok: { label: 'Nothing waiting', tone: 'grey' },
  purchase: { label: 'With Purchase', tone: 'steel' },
  arrived: { label: 'Arrived, to issue', tone: 'hivis' },
  store: { label: 'Requested', tone: 'warn' },
};

/** Production in charts: where the work orders are, daily hours, material requests and hours by trade. */
export function ProductionCharts({ d }: { d: Data }) {
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  return (
    <div className="o-chart-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
      <div className="o-panel">
        <h2>Open work orders by stage</h2>
        <PieChart unit="" decimals={0} size={170} empty="No open work orders." label="Open work orders by stage" slices={d.pipeline.map((s) => ({ label: s.label, value: s.count, color: STAGE_COLORS[s.id] }))} />
      </div>
      <div className="o-panel">
        <h2>Due dates</h2>
        <PieChart
          unit=""
          decimals={0}
          size={170}
          empty="No open work orders."
          label="Open work orders by due date"
          slices={[
            { label: 'Past due date', value: d.orders.filter((w) => w.late).length, color: '#b42318' },
            { label: 'Due within 7 days', value: d.orders.filter((w) => !w.late && w.due && w.due <= soon).length, color: '#e07b39' },
            { label: 'Due later', value: d.orders.filter((w) => !w.late && w.due && w.due > soon).length, color: '#3a9a6b' },
            { label: 'No due date', value: d.orders.filter((w) => !w.due).length, color: '#9aa3ab' },
          ]}
        />
      </div>
      <div className="o-panel">
        <h2>Hours reported, last 14 days</h2>
        <ColumnChart
          height={190}
          series={[{ name: 'Hours', color: '#2f5d8a' }]}
          points={d.hoursByDay.map((p) => ({ label: String(Number(p.day.slice(8))), values: [p.hours] }))}
          format={(v) => fmtQty(v)}
        />
        <p className="o-chart-note">From the supervisors' daily production reports.</p>
      </div>
      <div className="o-panel">
        <h2>Material requests waiting</h2>
        {d.mrByStatus.every((m) => m.count === 0) ? (
          <div className="o-empty">No material request is waiting.</div>
        ) : (
          <StackedBarChart unit="" series={[{ name: 'Requests', color: '#e07b39' }]} rows={d.mrByStatus.filter((m) => m.count).map((m) => ({ label: m.label, parts: [m.count] }))} />
        )}
        <p className="o-chart-note">Where each open request is right now.</p>
      </div>
    </div>
  );
}

/** Hours reported per trade this week. */
export function HoursByTrade({ d }: { d: Data }) {
  const maxH = Math.max(1, ...d.hoursByTrade.map((h) => h.hours));
  return (
    <div className="o-panel">
      <h2>Hours by trade, last 7 days</h2>
      {d.hoursByTrade.length === 0 && <div className="o-empty">No production reported this week.</div>}
      {d.hoursByTrade.map((h) => (
        <div key={h.trade} className="o-stack-row">
          <span className="o-stack-label">{h.trade}</span>
          <span className="o-stack-track">
            <span className="o-stack-part" style={{ width: `${(h.hours / maxH) * 100}%`, background: 'var(--steel)' }} />
          </span>
          <span className="num" style={{ fontSize: 12 }}>
            {fmtQty(h.hours)} h
          </span>
        </div>
      ))}
    </div>
  );
}

/** Every open work order on one line: stage, progress, material position and due date. */
export function OrdersAtAGlance({ d, limit = 12 }: { d: Data; limit?: number }) {
  const rows = d.orders.slice(0, limit);
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Open work orders at a glance</h2>
        <Link className="o-btn small" href="/production/orders">
          All work orders
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="o-empty">No open work orders.</div>
      ) : (
        <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                <th>Work order</th>
                <th>Stage</th>
                <th style={{ width: 190 }}>Progress</th>
                <th>Materials</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={woHref(w.id)}>
                      <strong>{w.number}</strong> {w.title}
                    </Link>
                    <div className="sub">
                      {w.trade}
                      {w.customer ? ` · ${w.customer}` : ''} · {fmtQty(w.qty)} {w.unit}
                    </div>
                  </td>
                  <td>
                    <span className="o-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <StatusChip status={w.status} />
                      <PriorityChip priority={w.priority} />
                      {w.rework && <Chip tone="bad">Rework</Chip>}
                    </span>
                  </td>
                  <td>
                    <Progress value={w.progress} tone={w.rework ? 'bad' : undefined} />
                    <div className="sub">
                      {w.opsDone} of {w.opsTotal} operations
                    </div>
                  </td>
                  <td>
                    <Chip tone={MATERIAL[w.material].tone}>{MATERIAL[w.material].label}</Chip>
                    {w.openRequests > 0 && (
                      <div className="sub">
                        {w.openRequests} {w.openRequests === 1 ? 'request' : 'requests'} open
                      </div>
                    )}
                  </td>
                  <td className="nw">
                    {fmtDate(w.due)} {w.late && <Chip tone="bad">Late</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
