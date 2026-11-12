import Link from 'next/link';
import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { Chip, DataTable, EmptyState, KpiStrip, TopBar } from '@orbit/ui';
import { fmtDate, fmtQty, roleLabel, type Priority } from '../config';
import { TRADES } from '../trades';
import { admin, dashboard, floor, loadConfig, myRole, NOT_READY, notReady, queue, store, workorders, type WoFilter } from '../server';
import { DailyReportClient } from './DailyReportClient';
import { HoursByTrade, OrdersAtAGlance, ProductionCharts } from './DashboardCharts';
import { SettingsClient } from './SettingsClient';
import { NotReady, PageHead, PriorityChip, Progress, woHref, WoTable } from './ui';
import { WorkOrderForm } from './WorkOrderForm';
import { WorkOrderView } from './WorkOrderView';
import { Materials, MrPage, Receipts, Stock } from './materials';

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);

/** Shows a friendly page instead of an error before migration 0023 has run. */
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

const Message = ({ title }: { title: string }) => (
  <div className="o-page">
    <EmptyState title={title} />
  </div>
);

const Dashboard: Screen = async () => {
  const d = await query((tx, ctx) => dashboard.dashboard(tx, ctx));
  const k = d.kpi;
  return (
    <>
      <TopBar crumbs={['Production', 'Dashboard']} />
      <div className="o-page">
        <PageHead title="Production dashboard" lead={`You sign in as ${roleLabel(d.me).toLowerCase()}.`}>
          {['engineer', 'manager', 'admin'].includes(d.me) && (
            <Link className="o-btn primary" href="/production/new">
              New work order
            </Link>
          )}
          {['supervisor', 'manager', 'admin'].includes(d.me) && (
            <Link className="o-btn" href="/production/report">
              Daily report
            </Link>
          )}
        </PageHead>
        <KpiStrip
          items={[
            { value: String(k.open), label: 'Open work orders' },
            { value: String(k.floor), label: 'On the shop floor' },
            { value: String(k.late), label: 'Past due date', tone: k.late ? 'hivis' : undefined },
            { value: String(k.rework), label: 'Back from QC for rework', tone: k.rework ? 'hivis' : undefined },
          ]}
        />
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Pipeline</h2>
            <Link className="o-btn small" href="/production/board">
              Shop-floor board
            </Link>
          </div>
          <div className="p-pipe">
            {d.pipeline.map((s) => (
              <Link key={s.id} href={`/production/orders?f=${s.id === 'completed' ? 'done' : 'open'}`} className={`p-pipe-step${s.count ? ' on' : ''}`}>
                <span className="p-pipe-n">{s.count}</span>
                <span className="p-pipe-l">{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <ProductionCharts d={d} />
        <OrdersAtAGlance d={d} />
        <div className="o-half">
          <HoursByTrade d={d} />
          <div className="o-panel">
            <h2>Recent activity</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.recent.length === 0 && <li className="faint">No activity yet.</li>}
              {d.recent.map((x) => (
                <li key={x.id} style={{ fontSize: 13 }}>
                  <Link href={woHref(x.woId)}>{x.number}</Link> {x.text}
                  <div className="faint" style={{ fontSize: 11 }}>
                    {x.by || 'Orbit'} · {new Date(x.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </li>
              ))}
            </ul>
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
      <TopBar crumbs={['Production', 'My tasks']} />
      <div className="o-page">
        <PageHead title="My tasks" lead={`Waiting for you as ${roleLabel(d.me).toLowerCase()}.`} />
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

const FILTERS: { id: WoFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'floor', label: 'On the floor' },
  { id: 'late', label: 'Late' },
  { id: 'done', label: 'Finished' },
  { id: 'all', label: 'All' },
];

const Orders: Screen = async ({ searchParams }) => {
  const filter = (FILTERS.find((f) => f.id === one(searchParams.f))?.id ?? 'open') as WoFilter;
  const trade = TRADES.find((t) => t.id === one(searchParams.trade))?.id;
  const q = one(searchParams.q) ?? '';
  const rows = await query((tx, ctx) => workorders.listWorkOrders(tx, ctx, { filter, trade, q }));
  return (
    <>
      <TopBar crumbs={['Production', 'Work orders']} />
      <div className="o-page">
        <PageHead title="Work orders" lead="Every job and where it is.">
          <Link className="o-btn primary" href="/production/new">
            New work order
          </Link>
        </PageHead>
        <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <nav className="o-tabs" aria-label="Filter">
            {FILTERS.map((f) => (
              <Link key={f.id} href={`?f=${f.id}${trade ? `&trade=${trade}` : ''}`} aria-current={f.id === filter ? 'page' : undefined}>
                {f.label}
              </Link>
            ))}
          </nav>
          <form className="o-row" style={{ gap: 6 }}>
            <input type="hidden" name="f" value={filter} />
            <select className="o-select" name="trade" defaultValue={trade ?? ''} aria-label="Trade" style={{ width: 200 }}>
              <option value="">All trades</option>
              {TRADES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input className="o-input" name="q" defaultValue={q} placeholder="Search number, job, customer" style={{ width: 220 }} aria-label="Search" />
            <button className="o-btn small" type="submit">
              Go
            </button>
          </form>
        </div>
        <div className="o-panel flush">
          <WoTable rows={rows} />
        </div>
      </div>
    </>
  );
};

const NewWo: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ me: await myRole(tx, ctx), cfg: await loadConfig(tx, ctx.companyId), so: await workorders.salesOrdersToPlan(tx, ctx), projects: await workorders.projectsToPlan(tx, ctx) }));
  if (!['engineer', 'manager', 'admin'].includes(d.me)) return <Message title="Your production role does not plan work orders." />;
  return <WorkOrderForm trades={d.cfg.trades} salesOrders={d.so} projects={d.projects} />;
};

const EditWo: Screen = async ({ searchParams }) => {
  const id = one(searchParams.id) ?? '';
  const d = isId(id) ? await query(async (tx, ctx) => ({ detail: await workorders.workOrderDetail(tx, ctx, id), cfg: await loadConfig(tx, ctx.companyId), projects: await workorders.projectsToPlan(tx, ctx) })) : null;
  if (!d?.detail) return <Message title="Work order not found." />;
  const { wo, materials, ops, can } = d.detail;
  if (!can.edit) return <Message title="Only a draft can be changed." />;
  return (
    <WorkOrderForm
      trades={d.cfg.trades}
      salesOrders={[]}
      projects={d.projects}
      editId={wo.id}
      number={wo.number}
      returnedNote={wo.returnedNote}
      initial={{
        trade: wo.trade,
        title: wo.title,
        customer: wo.customer ?? '',
        qty: String(wo.qty),
        unit: wo.unit,
        due: wo.due ?? '',
        priority: wo.priority as Priority,
        fields: (wo.fields ?? {}) as Record<string, string>,
        notes: wo.notes ?? '',
        materials: materials.map((m) => ({ item: m.item, qty: String(m.qty), unit: m.unit })),
        operations: ops.map((o) => ({ name: o.name })),
      }}
    />
  );
};

const Order: Screen = async ({ searchParams }) => {
  const id = one(searchParams.id) ?? '';
  const d = isId(id) ? await query((tx, ctx) => workorders.workOrderDetail(tx, ctx, id)) : null;
  if (!d) return <Message title="Work order not found." />;
  return <WorkOrderView d={d} />;
};

const BOARD = [
  { id: 'pending_release', label: 'Waiting release' },
  { id: 'released', label: 'Released' },
  { id: 'in_progress', label: 'In production' },
  { id: 'final_qc', label: 'With QC' },
  { id: 'completed', label: 'Ready to dispatch' },
] as const;

const Board: Screen = async () => {
  const rows = await query((tx, ctx) => workorders.listWorkOrders(tx, ctx, { filter: 'all' }));
  return (
    <>
      <TopBar crumbs={['Production', 'Shop-floor board']} />
      <div className="o-page">
        <PageHead title="Shop-floor board" lead="Every work order in progress, by stage." />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD.length}, minmax(210px, 1fr))`, gap: 12, overflowX: 'auto', alignItems: 'start' }}>
          {BOARD.map((col) => {
            const list = rows.filter((r) => r.status === col.id);
            return (
              <div key={col.id} className="o-panel" style={{ padding: 10, background: 'var(--paper)' }}>
                <div className="o-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{col.label}</strong>
                  <span className="faint" style={{ fontSize: 11 }}>
                    {list.length}
                  </span>
                </div>
                <div className="o-stack" style={{ gap: 8 }}>
                  {list.length === 0 && <span className="faint" style={{ fontSize: 12 }}>Empty</span>}
                  {list.map((r) => (
                    <Link key={r.id} href={woHref(r.id)} className="o-panel" style={{ padding: 10, textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <div className="faint" style={{ fontSize: 11 }}>
                        {r.number} · {r.trade}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, margin: '2px 0 6px' }}>{r.title}</div>
                      <Progress value={r.progress} tone={r.rework ? 'bad' : undefined} />
                      <div className="o-row" style={{ fontSize: 11, justifyContent: 'space-between', marginTop: 4 }}>
                        <span>
                          {fmtQty(r.qty)} {r.unit}
                        </span>
                        <span className={r.late ? 'bad' : 'muted'}>due {fmtDate(r.due)}</span>
                      </div>
                      <div className="o-row" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        <PriorityChip priority={r.priority} />
                        {r.rework && <Chip tone="bad">QC failed: rework</Chip>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

const Report: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ me: await myRole(tx, ctx), wos: await floor.floorOperations(tx, ctx) }));
  if (!['supervisor', 'manager', 'admin'].includes(d.me)) return <Message title="Supervisors and the production manager report output." />;
  return <DailyReportClient wos={d.wos} />;
};

const Output: Screen = async () => {
  const d = await query((tx, ctx) => floor.outputLog(tx, ctx));
  return (
    <>
      <TopBar crumbs={['Production', 'Output log']} />
      <div className="o-page">
        <PageHead title="Output log" lead="Production reported in the last 14 days." />
        <KpiStrip items={d.byDay.slice(0, 4).map((x) => ({ value: `${fmtQty(x.hours)} h`, label: `${fmtDate(x.day)} · ${x.lines} lines · ${x.workers} people` }))} />
        <div className="o-panel flush">
          <div className="o-scroll">
            <DataTable
              rows={d.rows}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No production reported yet." />}
              columns={[
                { key: 'd', header: 'Date', render: (r) => fmtDate(r.day) },
                { key: 'w', header: 'Work order', render: (r) => <Link href={woHref(r.workOrderId)}><strong>{r.number}</strong> {r.title}</Link> },
                { key: 'o', header: 'Operation', render: (r) => r.operation },
                { key: 'q', header: 'Qty', num: true, render: (r) => `${fmtQty(r.qty)} ${r.unit}` },
                { key: 'h', header: 'Hours', num: true, render: (r) => r.hours || '-' },
                { key: 'p', header: 'People', num: true, render: (r) => r.workers || '-' },
                { key: 's', header: 'Shift', render: (r) => r.shift ?? '-' },
                { key: 'r', header: 'Remarks', render: (r) => <span className="muted">{r.remarks ?? ''}</span> },
                { key: 'b', header: 'By', render: (r) => <span className="muted">{r.by}</span> },
              ]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

const Store: Screen = async () => {
  const d = await query((tx, ctx) => store.storeWork(tx, ctx));
  return (
    <>
      <TopBar crumbs={['Production', 'Store']} />
      <div className="o-page">
        <PageHead title="Store: issue and dispatch" lead="Materials still to issue to released work orders, and finished work waiting to go out." />
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Materials to issue</h2>
          </div>
          <DataTable
            rows={d.toIssue}
            rowKey={(r) => r.id}
            empty={<EmptyState title="Everything planned has been issued." />}
            columns={[
              { key: 'w', header: 'Work order', render: (r) => <Link href={woHref(r.id)}><strong>{r.number}</strong> {r.title}</Link> },
              { key: 's', header: 'Still to issue', render: (r) => r.short.map((s) => `${s.item}: ${fmtQty(s.left)} ${s.unit}`).join(' · ') },
              { key: 'p', header: '', render: (r) => <PriorityChip priority={r.priority} /> },
              { key: 'd', header: 'Due', num: true, render: (r) => fmtDate(r.due) },
            ]}
          />
        </div>
        <div className="o-panel flush">
          <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
            <h2>Ready to dispatch</h2>
          </div>
          <DataTable
            rows={d.toDispatch}
            rowKey={(r) => r.id}
            empty={<EmptyState title="Nothing waiting to go out." />}
            columns={[
              { key: 'w', header: 'Work order', render: (r) => <Link href={woHref(r.id)}><strong>{r.number}</strong> {r.title}</Link> },
              { key: 'c', header: 'Customer', render: (r) => r.customer ?? '-' },
              { key: 'q', header: 'Quantity', num: true, render: (r) => `${fmtQty(r.qty)} ${r.unit}` },
              { key: 'd', header: 'Due', num: true, render: (r) => fmtDate(r.due) },
            ]}
          />
        </div>
      </div>
    </>
  );
};

const Trades: Screen = async () => (
  <>
    <TopBar crumbs={['Production', 'Trade forms']} />
    <div className="o-page">
      <PageHead title="Trade forms" lead="What each trade's work order asks for and its default operations. The checklists go to QC in the Quality portal when the work is finished." />
      {TRADES.map((t) => (
        <details key={t.id} className="o-panel">
          <summary style={{ cursor: 'pointer' }}>
            <strong>{t.name}</strong> <span className="muted" style={{ fontSize: 12 }}>· {t.detail}</span>
          </summary>
          <div className="o-half" style={{ marginTop: 12 }}>
            <div>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>Form fields</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {t.fields.map((f) => (
                  <li key={f.id}>
                    {f.label}
                    {f.required ? ' *' : ''}
                    {f.options ? <span className="faint"> ({f.options.join(', ')})</span> : ''}
                  </li>
                ))}
              </ul>
              <h3 style={{ fontSize: 13, margin: '12px 0 6px' }}>Operations</h3>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {t.operations.map((o) => (
                  <li key={o.name}>
                    {o.name}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>QC checklist (used in the Quality portal)</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {t.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <h3 style={{ fontSize: 13, margin: '12px 0 6px' }}>Final checks</h3>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {t.finalChecklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      ))}
    </div>
  </>
);

const Settings: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ cfg: await loadConfig(tx, ctx.companyId), team: await admin.productionTeam(tx, ctx), admin: ctx.role === 'company_admin' }));
  if (!d.admin) return <Message title="Only a company admin can change production settings." />;
  return (
    <>
      <TopBar crumbs={['Production', 'Production settings']} />
      <div className="o-page">
        <PageHead title="Production settings" lead="Trades, rules and who does what. Nothing changes until you save." />
        <SettingsClient cfg={d.cfg} team={d.team} />
      </div>
    </>
  );
};

export const productionRoutes: Record<string, Screen> = Object.fromEntries(
  Object.entries({
    '': Dashboard,
    queue: Queue,
    orders: Orders,
    new: NewWo,
    edit: EditWo,
    order: Order,
    board: Board,
    report: Report,
    output: Output,
    store: Store,
    materials: Materials,
    mr: MrPage,
    stock: Stock,
    receipts: Receipts,
    trades: Trades,
    'admin/settings': Settings,
  }).map(([k, s]) => [k, guard(s)]),
);

