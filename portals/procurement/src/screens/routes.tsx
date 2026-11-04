import Link from 'next/link';
import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { Chip, DataTable, EmptyState, KpiStrip, TopBar } from '@orbit/ui';
import { roleLabel, type Stage } from '../config';
import { admin, dashboard, loadConfig, myRole, NOT_READY, notReady, projectNames, requests, stock, suppliers, type RequestFilter } from '../server';
import { ApprovalsClient } from './admin/ApprovalsClient';
import { FormClient } from './admin/FormClient';
import { MoneyClient } from './admin/MoneyClient';
import { RolesClient } from './admin/RolesClient';
import { WorkflowClient } from './admin/WorkflowClient';
import { NewRequestClient } from './NewRequestClient';
import { RequestView } from './RequestView';
import { AddItemClient, StockEntryClient } from './StockClients';
import { SuppliersClient } from './SuppliersClient';
import { fmtDate, fmtK, fmtMoney, fmtQty, NotReady, PageHead, Pipeline, RequestTable, StageChip } from './ui';

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Shows a friendly page instead of an error before migration 0010 has run. */
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

const Dashboard: Screen = async () => {
  const d = await query((tx, ctx) => dashboard.dashboard(tx, ctx));
  const cur = d.currency;
  return (
    <>
      <TopBar crumbs={['Purchase', 'Dashboard']} />
      <div className="o-page">
        <PageHead title="Purchase dashboard" lead={`You sign in as ${d.meLabel}.`}>
          {['requester', 'buyer', 'store', 'manager', 'admin'].includes(d.me) && (
            <Link className="o-btn primary" href="/procurement/new">
              New requisition
            </Link>
          )}
        </PageHead>
        <KpiStrip
          items={[
            { value: String(d.kpis.mine), label: 'Waiting for you', tone: d.kpis.mine ? 'hivis' : undefined },
            { value: String(d.kpis.open), label: 'Open requests' },
            { value: String(d.kpis.late), label: 'Past need-by date' },
            { value: fmtK(cur, d.kpis.poMonth), label: 'Ordered this month' },
          ]}
        />
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Pipeline</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              Open requests by stage
            </span>
          </div>
          <Pipeline stages={d.pipeline} currency={cur} />
        </div>
        <div className="o-half">
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Waiting for you</h2>
              <Link className="o-btn small" href="/procurement/queue">
                Open queue
              </Link>
            </div>
            <RequestTable rows={d.queue} currency={cur} showOwner={false} empty="Nothing waiting for you." />
          </div>
          <div className="o-stack">
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>My requests</h2>
              </div>
              <RequestTable rows={d.myRequests} currency={cur} empty="You have not raised a request yet." />
            </div>
            <div className="o-panel flush">
              <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
                <h2>Stock to reorder</h2>
                <span className="muted" style={{ fontSize: 12, marginLeft: 'auto', marginRight: 8 }}>
                  Stock value {fmtK(cur, d.kpis.stockValue)}
                </span>
                <Link className="o-btn small" href="/procurement/stock?low=1">
                  Stock register
                </Link>
              </div>
              <DataTable
                rows={d.low}
                rowKey={(r) => r.id}
                empty={<span className="faint">Stock is healthy.</span>}
                columns={[
                  { key: 'c', header: 'Item', render: (r) => <><strong>{r.code}</strong> {r.name}</> },
                  { key: 'a', header: 'Available', num: true, render: (r) => `${fmtQty(r.available)} ${r.unit}` },
                  { key: 'm', header: 'Reorder at', num: true, render: (r) => fmtQty(r.reorderLevel) },
                  { key: 's', header: '', render: (r) => <Chip tone={r.state === 'out' ? 'bad' : 'warn'}>{r.state === 'out' ? 'Out' : 'Low'}</Chip> },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const Queue: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ rows: await requests.myQueue(tx, ctx), cfg: await loadConfig(tx, ctx.companyId), me: await myRole(tx, ctx) }));
  return (
    <>
      <TopBar crumbs={['Purchase', 'My queue']} />
      <div className="o-page">
        <PageHead title="My queue" lead={`Steps waiting for ${roleLabel(d.me).toLowerCase()}, oldest first.`} />
        <div className="o-panel flush">
          <RequestTable rows={d.rows} currency={d.cfg.money.currency} showOwner={false} empty="Nothing waiting for you. You are up to date." />
        </div>
      </div>
    </>
  );
};

const FILTERS: { id: RequestFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'action', label: 'Waiting for me' },
  { id: 'mine', label: 'Raised by me' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

const Requests: Screen = async ({ searchParams }) => {
  const filter = (FILTERS.find((f) => f.id === one(searchParams.f))?.id ?? 'open') as RequestFilter;
  const q = one(searchParams.q) ?? '';
  const stage = one(searchParams.stage) as Stage | undefined;
  const d = await query(async (tx, ctx) => ({ rows: await requests.listRequests(tx, ctx, { filter: stage ? 'all' : filter, q }), cfg: await loadConfig(tx, ctx.companyId) }));
  const rows = stage ? d.rows.filter((r) => r.stage === stage) : d.rows;
  return (
    <>
      <TopBar crumbs={['Purchase', 'Requests']} />
      <div className="o-page">
        <PageHead title="Requests" lead={stage ? `Stage: ${rows[0]?.stageLabel ?? stage}` : 'Every material request and where it is.'}>
          <Link className="o-btn primary" href="/procurement/new">
            New requisition
          </Link>
        </PageHead>
        <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <nav className="o-tabs" aria-label="Filter">
            {FILTERS.map((f) => (
              <Link key={f.id} href={`?f=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`} aria-current={!stage && f.id === filter ? 'page' : undefined}>
                {f.label}
              </Link>
            ))}
          </nav>
          <form className="o-row" style={{ gap: 6 }}>
            <input type="hidden" name="f" value={filter} />
            <input className="o-input" name="q" defaultValue={q} placeholder="Search number, title, supplier" style={{ width: 260 }} aria-label="Search" />
            <button className="o-btn small" type="submit">
              Search
            </button>
          </form>
        </div>
        <div className="o-panel flush">
          <RequestTable rows={rows} currency={d.cfg.money.currency} />
        </div>
      </div>
    </>
  );
};

const NewRequest: Screen = async () => {
  const d = await query(async (tx, ctx) => ({
    cfg: await loadConfig(tx, ctx.companyId),
    projects: await projectNames(tx, ctx.companyId),
    items: await stock.listItems(tx, ctx),
    me: await myRole(tx, ctx),
  }));
  if (!['requester', 'buyer', 'store', 'manager', 'admin'].includes(d.me))
    return (
      <div className="o-page">
        <EmptyState title="Your purchase role does not raise requisitions." />
      </div>
    );
  return <NewRequestClient form={d.cfg.form} currency={d.cfg.money.currency} projects={d.projects} items={d.items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, available: i.available, avgCost: i.avgCost }))} />;
};

const Request: Screen = async ({ searchParams }) => {
  const id = one(searchParams.id) ?? '';
  const d = /^[0-9a-f-]{36}$/.test(id)
    ? await query(async (tx, ctx) => ({ detail: await requests.requestDetail(tx, ctx, id), suppliers: await suppliers.listSuppliers(tx, ctx) }))
    : { detail: null, suppliers: [] };
  if (!d.detail)
    return (
      <div className="o-page">
        <EmptyState title="Request not found." />
      </div>
    );
  return <RequestView d={d.detail} suppliers={d.suppliers} />;
};

const Orders: Screen = async ({ searchParams }) => {
  const q = one(searchParams.q) ?? '';
  const d = await query(async (tx, ctx) => ({ rows: await requests.listRequests(tx, ctx, { filter: 'all', poOnly: true, q }), cfg: await loadConfig(tx, ctx.companyId) }));
  const cur = d.cfg.money.currency;
  return (
    <>
      <TopBar crumbs={['Purchase', 'Purchase orders']} />
      <div className="o-page">
        <PageHead title="Purchase orders" lead={`${d.rows.length} orders, ${fmtMoney(cur, d.rows.reduce((t, r) => t + r.value, 0))} before ${d.cfg.money.taxName}.`} />
        <div className="o-panel flush">
          <DataTable
            rows={d.rows}
            rowKey={(r) => r.id}
            empty={<EmptyState title="No purchase orders yet." />}
            columns={[
              { key: 'p', header: 'PO', render: (r) => <Link href={`/procurement/request?id=${r.id}`}><strong>{r.poNo}</strong></Link> },
              { key: 'd', header: 'Issued', render: (r) => fmtDate(r.poDate) },
              { key: 's', header: 'Supplier', render: (r) => r.supplier ?? '-' },
              { key: 'r', header: 'Request', render: (r) => <span className="muted">{r.number} {r.title}</span> },
              { key: 'v', header: 'Value', num: true, render: (r) => fmtMoney(cur, r.value) },
              { key: 'st', header: 'Stage', render: (r) => <StageChip stage={r.stage} label={r.stageLabel} /> },
            ]}
          />
        </div>
      </div>
    </>
  );
};

const Stock: Screen = async ({ searchParams }) => {
  const lowOnly = one(searchParams.low) === '1';
  const q = (one(searchParams.q) ?? '').toLowerCase();
  const d = await query(async (tx, ctx) => ({ items: await stock.listItems(tx, ctx), cfg: await loadConfig(tx, ctx.companyId), me: await myRole(tx, ctx) }));
  const rows = d.items.filter((i) => (!lowOnly || i.state !== 'ok') && (!q || `${i.code} ${i.name} ${i.category}`.toLowerCase().includes(q)));
  const cur = d.cfg.money.currency;
  return (
    <>
      <TopBar crumbs={['Purchase', 'Stock register']} />
      <div className="o-page">
        <PageHead title="Stock register" lead="Available = on hand minus what is reserved for requests.">
          {(d.me === 'store' || d.me === 'manager' || d.me === 'admin') && <AddItemClient defaultUnit={d.cfg.form.unit} />}
        </PageHead>
        <KpiStrip
          items={[
            { value: String(d.items.length), label: 'Items' },
            { value: fmtK(cur, d.items.reduce((t, i) => t + i.value, 0)), label: 'Stock value' },
            { value: String(d.items.filter((i) => i.state === 'low').length), label: 'Below reorder', tone: 'hivis' },
            { value: String(d.items.filter((i) => i.state === 'out').length), label: 'Out of stock' },
          ]}
        />
        <div className="o-row" style={{ gap: 8 }}>
          <nav className="o-tabs">
            <Link href="?" aria-current={!lowOnly ? 'page' : undefined}>
              All items
            </Link>
            <Link href="?low=1" aria-current={lowOnly ? 'page' : undefined}>
              Low and out
            </Link>
          </nav>
          <form className="o-row" style={{ gap: 6, marginLeft: 'auto' }}>
            {lowOnly && <input type="hidden" name="low" value="1" />}
            <input className="o-input" name="q" defaultValue={q} placeholder="Search code or name" style={{ width: 220 }} aria-label="Search stock" />
          </form>
        </div>
        <div className="o-panel flush">
          <div className="o-scroll">
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              empty={<EmptyState title={d.items.length ? 'No items match.' : 'No stock items yet. Add your first item.'} />}
              columns={[
                { key: 'c', header: 'Code', render: (r) => <strong>{r.code}</strong> },
                { key: 'n', header: 'Item', render: (r) => <>{r.name}<div className="faint" style={{ fontSize: 11 }}>{r.category}{r.location ? ` · ${r.location}` : ''}</div></> },
                { key: 'h', header: 'On hand', num: true, render: (r) => `${fmtQty(r.onHand)} ${r.unit}` },
                { key: 'rs', header: 'Reserved', num: true, render: (r) => (r.reserved ? fmtQty(r.reserved) : '-') },
                { key: 'a', header: 'Available', num: true, render: (r) => <strong>{fmtQty(r.available)}</strong> },
                { key: 'm', header: 'Reorder at', num: true, render: (r) => fmtQty(r.reorderLevel) },
                { key: 'v', header: 'Value', num: true, render: (r) => fmtMoney(cur, r.value) },
                { key: 's', header: '', render: (r) => <Chip tone={r.state === 'ok' ? 'ok' : r.state === 'low' ? 'warn' : 'bad'}>{r.state === 'ok' ? 'In stock' : r.state === 'low' ? 'Below reorder' : 'Out of stock'}</Chip> },
              ]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

const StockEntry: Screen = async () => {
  const items = await query((tx, ctx) => stock.listItems(tx, ctx));
  return <StockEntryClient items={items.map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, onHand: i.onHand, available: i.available }))} />;
};

const Ledger: Screen = async () => {
  const rows = await query((tx, ctx) => stock.ledger(tx, ctx));
  const TYPE: Record<string, string> = { IN: 'Receipt', OUT: 'Issue', RET: 'Return', ADJ: 'Adjustment' };
  return (
    <>
      <TopBar crumbs={['Purchase', 'Stock ledger']} />
      <div className="o-page">
        <PageHead title="Stock ledger" lead="Every stock movement, newest first." />
        <div className="o-panel flush">
          <div className="o-scroll">
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No stock movements yet." />}
              columns={[
                { key: 'd', header: 'Date', render: (r) => fmtDate(r.at) },
                { key: 'i', header: 'Item', render: (r) => <><strong>{r.code}</strong> {r.name}</> },
                { key: 't', header: 'Type', render: (r) => <Chip tone={r.qty >= 0 ? 'ok' : 'steel'}>{TYPE[r.type]}</Chip> },
                { key: 'q', header: 'Qty', num: true, render: (r) => `${r.qty > 0 ? '+' : ''}${fmtQty(r.qty)} ${r.unit}` },
                { key: 'b', header: 'Balance', num: true, render: (r) => fmtQty(r.balance) },
                { key: 'r', header: 'Reference', render: (r) => <>{r.reference}<div className="faint" style={{ fontSize: 11 }}>{r.note}</div></> },
                { key: 'by', header: 'By', render: (r) => <span className="muted">{r.by}</span> },
              ]}
            />
          </div>
        </div>
      </div>
    </>
  );
};

const Suppliers: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ rows: await suppliers.listSuppliers(tx, ctx), me: await myRole(tx, ctx) }));
  return <SuppliersClient rows={d.rows} canAdd={['buyer', 'manager', 'admin'].includes(d.me)} />;
};

const AdminWorkflow: Screen = async () => {
  const d = await query((tx, ctx) => admin.adminConfig(tx, ctx));
  return <WorkflowClient config={d.config} templates={d.templates} />;
};
const AdminForm: Screen = async () => {
  const d = await query((tx, ctx) => admin.adminConfig(tx, ctx));
  return <FormClient form={d.config.form} />;
};
const AdminApprovals: Screen = async () => {
  const d = await query((tx, ctx) => admin.adminConfig(tx, ctx));
  return <ApprovalsClient levels={d.config.levels} currency={d.config.money.currency} />;
};
const AdminRoles: Screen = async () => {
  const d = await query((tx, ctx) => admin.rolesOverview(tx, ctx));
  return <RolesClient team={d.team} needed={d.needed} />;
};
const AdminMoney: Screen = async () => {
  const d = await query((tx, ctx) => admin.adminConfig(tx, ctx));
  return <MoneyClient money={d.config.money} numbering={d.config.numbering} />;
};

export const procurementRoutes: Record<string, Screen> = Object.fromEntries(
  Object.entries({
    '': Dashboard,
    queue: Queue,
    new: NewRequest,
    requests: Requests,
    request: Request,
    orders: Orders,
    stock: Stock,
    'stock/entry': StockEntry,
    'stock/ledger': Ledger,
    suppliers: Suppliers,
    'admin/workflow': AdminWorkflow,
    'admin/form': AdminForm,
    'admin/approvals': AdminApprovals,
    'admin/roles': AdminRoles,
    'admin/settings': AdminMoney,
  }).map(([k, s]) => [k, guard(s)]),
);
