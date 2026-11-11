import Link from 'next/link';
import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { Chip, ColumnChart, EmptyState, KpiStrip, PieChart, TopBar } from '@orbit/ui';
import { fmtDate, roleLabel, SOURCE_COLOR, SOURCE_IDS, SOURCE_KIND } from '../config';
import { admin, dashboard, inspections, myRole, NOT_READY, notReady, queue, type QcFilter } from '../server';
import { InspectionView } from './InspectionView';
import { SettingsClient } from './SettingsClient';
import { inspHref, InspTable, NotReady, PageHead, ResultChip, SourceTag } from './ui';

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Shows a friendly page instead of an error before migration 0025 has run. */
const guard =
  (s: Screen): Screen =>
  async (p) => {
    try {
      return await s(p);
    } catch (err) {
      if (notReady(err)) return <NotReady message={NOT_READY} />;
      throw err;
    }
  };

const PASS = 'var(--ok)';
const FAIL = 'var(--bad)';

const Dashboard: Screen = async () => {
  const d = await query((tx, ctx) => dashboard.dashboard(tx, ctx));
  const k = d.kpi;
  return (
    <>
      <TopBar crumbs={['Quality', 'Dashboard']} />
      <div className="o-page">
        <PageHead title="Quality dashboard" lead={`Incoming material and finished work, inspected and approved. You sign in as ${roleLabel(d.me).toLowerCase()}.`}>
          <Link className="o-btn" href="/quality/reports">
            Final reports
          </Link>
          <Link className="o-btn primary" href="/quality/queue">
            My tasks
          </Link>
        </PageHead>
        <KpiStrip
          items={[
            { value: String(k.pending), label: 'Waiting for inspection', tone: k.pending ? 'hivis' : undefined },
            { value: String(k.submitted), label: 'Waiting final approval', tone: k.submitted ? 'hivis' : undefined },
            { value: String(k.month), label: `Final reports this month${k.monthPass === null ? '' : ` (${k.monthPass}% pass)`}` },
            { value: k.passRate === null ? '-' : `${k.passRate}%`, label: 'Pass rate (6 months)' },
            { value: k.avgTurn === null ? '-' : k.avgTurn < 48 ? `${k.avgTurn} h` : `${Math.round(k.avgTurn / 24)} d`, label: 'Average time to final approval' },
          ]}
        />
        <div className="o-half">
          <div className="o-panel">
            <h2>Results by month</h2>
            {d.months.every((m) => !m.pass && !m.fail) ? (
              <p className="faint" style={{ margin: 0 }}>No final reports yet.</p>
            ) : (
              <ColumnChart points={d.months.map((m) => ({ label: m.label, values: [m.pass, m.fail] }))} series={[{ name: 'Pass', color: PASS }, { name: 'Fail', color: FAIL }]} height={190} />
            )}
          </div>
          <div className="o-panel">
            <h2>Where inspections come from</h2>
            <div className="o-row" style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <PieChart slices={d.bySource.map((s) => ({ label: SOURCE_KIND[s.source], value: s.total, detail: `${s.total ? Math.round((s.pass / s.total) * 100) : 0}% pass · ${s.open} open`, color: SOURCE_COLOR[s.source] }))} size={150} unit="reports" decimals={0} />
              <table className="o-table" style={{ flex: 1, minWidth: 240 }}>
                <thead>
                  <tr>
                    <th>From</th>
                    <th className="num">Final</th>
                    <th className="num">Pass</th>
                    <th className="num">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {d.bySource.map((s) => (
                    <tr key={s.source}>
                      <td>
                        <SourceTag source={s.source} />
                      </td>
                      <td className="num">{s.total}</td>
                      <td className="num">{s.total ? `${Math.round((s.pass / s.total) * 100)}%` : '-'}</td>
                      <td className="num">{s.open}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="o-half">
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Latest final reports</h2>
              <Link className="o-btn small" href="/quality/reports">
                All
              </Link>
            </div>
            {d.recent.length === 0 ? (
              <EmptyState title="No final reports yet." />
            ) : (
              <table className="o-table">
                <tbody>
                  {d.recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={inspHref(r.id)}>
                          <strong>{r.number}</strong> {r.title}
                        </Link>
                        <div className="faint" style={{ fontSize: 11 }}>
                          {r.sourceRef}
                          {r.party ? ` · ${r.party}` : ''} · {r.inspector} / {r.approver}
                        </div>
                      </td>
                      <td>
                        <ResultChip result={r.result} />
                      </td>
                      <td className="num muted">{fmtDate(r.approvedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Most failures</h2>
              <span className="muted" style={{ fontSize: 12 }}>
                Suppliers and customers' jobs, 6 months
              </span>
            </div>
            {d.worst.length === 0 ? (
              <EmptyState title="No failures. Well done." />
            ) : (
              <table className="o-table">
                <tbody>
                  {d.worst.map((w) => (
                    <tr key={`${w.source}:${w.party}`}>
                      <td>
                        {w.party} <SourceTag source={w.source} />
                      </td>
                      <td className="num">
                        <Chip tone="bad">{w.fail} failed</Chip>
                      </td>
                      <td className="num muted">of {w.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const Queue: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ items: await queue.myQueue(tx, ctx), me: await myRole(tx, ctx) }));
  return (
    <>
      <TopBar crumbs={['Quality', 'My tasks']} />
      <div className="o-page">
        <PageHead title="My tasks" lead={`Waiting for you as ${roleLabel(d.me).toLowerCase()}, oldest first.`} />
        <div className="o-panel flush">
          {d.items.length === 0 ? (
            <EmptyState title="Nothing waiting for you. You are up to date." />
          ) : (
            <table className="o-table">
              <tbody>
                {d.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link href={i.href}>
                        <strong>{i.title}</strong>
                      </Link>
                      <div className="faint" style={{ fontSize: 11 }}>
                        {i.detail}
                      </div>
                    </td>
                    <td className="num">{i.urgent && <Chip tone="bad">Urgent</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
};

const FILTERS: { id: QcFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'With QC engineer' },
  { id: 'submitted', label: 'With QC manager' },
  { id: 'approved', label: 'Final' },
  { id: 'all', label: 'All' },
];

const Inspections: Screen = async ({ searchParams }) => {
  const filter = (FILTERS.find((f) => f.id === one(searchParams.f))?.id ?? 'open') as QcFilter;
  const source = SOURCE_IDS.find((s) => s === one(searchParams.source));
  const q = one(searchParams.q) ?? '';
  const rows = await query((tx, ctx) => inspections.listInspections(tx, ctx, { filter, source, q }));
  return (
    <>
      <TopBar crumbs={['Quality', 'Inspections']} />
      <div className="o-page">
        <PageHead title="Inspections" lead="Requests from Purchase (incoming material) and Production (finished work)." />
        <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <nav className="o-tabs" aria-label="Filter">
            {FILTERS.map((f) => (
              <Link key={f.id} href={`?f=${f.id}${source ? `&source=${source}` : ''}`} aria-current={f.id === filter ? 'page' : undefined}>
                {f.label}
              </Link>
            ))}
          </nav>
          <form className="o-row" style={{ gap: 6 }}>
            <input type="hidden" name="f" value={filter} />
            <select className="o-select" name="source" defaultValue={source ?? ''} aria-label="From" style={{ width: 200 }}>
              <option value="">Purchase and Production</option>
              <option value="purchase">Incoming material (Purchase)</option>
              <option value="production">Finished work (Production)</option>
            </select>
            <input className="o-input" name="q" defaultValue={q} placeholder="Report, PO, WO, supplier" style={{ width: 220 }} aria-label="Search" />
            <button className="o-btn small" type="submit">
              Go
            </button>
          </form>
        </div>
        <div className="o-panel flush">
          <InspTable rows={rows} empty="No inspections here." final={filter === 'approved'} />
        </div>
      </div>
    </>
  );
};

const Reports: Screen = async ({ searchParams }) => {
  const result = (['pass', 'fail'] as const).find((r) => r === one(searchParams.result));
  const source = SOURCE_IDS.find((s) => s === one(searchParams.source));
  const rows = await query((tx, ctx) => inspections.listInspections(tx, ctx, { filter: 'approved', result, source }));
  const link = (r?: string, s?: string) => `?${[r ? `result=${r}` : '', s ? `source=${s}` : ''].filter(Boolean).join('&')}`;
  return (
    <>
      <TopBar crumbs={['Quality', 'Final reports']} />
      <div className="o-page">
        <PageHead title="Final reports" lead="Inspection reports with the QC manager's final approval. Open one to print it." />
        <nav className="o-tabs">
          <Link href={link(undefined, source)} aria-current={!result ? 'page' : undefined}>
            All
          </Link>
          <Link href={link('pass', source)} aria-current={result === 'pass' ? 'page' : undefined}>
            Passed
          </Link>
          <Link href={link('fail', source)} aria-current={result === 'fail' ? 'page' : undefined}>
            Failed
          </Link>
          <span style={{ flex: 1 }} />
          <Link href={link(result, undefined)} aria-current={!source ? 'page' : undefined}>
            All
          </Link>
          {SOURCE_IDS.map((s) => (
            <Link key={s} href={link(result, s)} aria-current={source === s ? 'page' : undefined}>
              {SOURCE_KIND[s]}
            </Link>
          ))}
        </nav>
        <div className="o-panel flush">
          <InspTable rows={rows} empty="No final reports yet." final />
        </div>
      </div>
    </>
  );
};

const Inspection: Screen = async ({ searchParams }) => {
  const id = one(searchParams.id) ?? '';
  const d = /^[0-9a-f-]{36}$/.test(id) ? await query((tx, ctx) => inspections.inspectionDetail(tx, ctx, id)) : null;
  if (!d)
    return (
      <div className="o-page">
        <EmptyState title="Inspection not found." />
      </div>
    );
  return <InspectionView d={d} />;
};

const Settings: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ team: await admin.qualityTeam(tx, ctx), admin: ctx.role === 'company_admin' }));
  if (!d.admin)
    return (
      <div className="o-page">
        <EmptyState title="Only a company admin can change quality settings." />
      </div>
    );
  return (
    <>
      <TopBar crumbs={['Quality', 'Quality settings']} />
      <div className="o-page">
        <PageHead title="Quality settings" lead="Who inspects and who gives final approval. Purchase sends received material here; Production sends finished work." />
        <SettingsClient team={d.team} />
      </div>
    </>
  );
};

export const qualityRoutes: Record<string, Screen> = Object.fromEntries(
  Object.entries({
    '': Dashboard,
    queue: Queue,
    inspections: Inspections,
    reports: Reports,
    inspection: Inspection,
    'admin/settings': Settings,
  }).map(([k, s]) => [k, guard(s)]),
);
