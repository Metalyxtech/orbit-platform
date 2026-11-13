import Link from 'next/link';
import type { ReactNode } from 'react';
import { query } from '@orbit/core/next';
import { Chip, EmptyState, KpiStrip, TopBar } from '@orbit/ui';
import { fmtMoney, fmtShort, inApproval, OPEN_STAGES, roleLabel, STAGES, stageLabel, type Stage } from '../config';
import { admin, customers, dashboard, enquiries, loadConfig, myRole, NOT_READY, notReady, orders, queue } from '../server';
import { EnquiryView } from './EnquiryView';
import { CustomersClient, InvoicesTable, OrdersTable, TargetsClient } from './ListClients';
import { SettingsClient } from './SettingsClient';
import { NewEnquiryClient } from './NewEnquiryClient';
import { EnquiryTable, enquiryHref, NotReady, PageHead } from './ui';

type SearchParams = Record<string, string | string[] | undefined>;
type Screen = (props: { searchParams: SearchParams }) => Promise<ReactNode>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Shows a friendly page instead of an error before migration 0019 has run. */
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
  const cur = d.cfg.currency;
  const k = d.kpi;
  return (
    <>
      <TopBar crumbs={['Sales', 'Dashboard']} />
      <div className="o-page">
        <PageHead title="Sales dashboard" lead={`You sign in as ${roleLabel(d.me).toLowerCase()}${d.me === 'exec' ? '; numbers are your own' : ''}.`}>
          {['exec', 'manager', 'admin'].includes(d.me) && (
            <Link className="o-btn primary" href="/sales/new">
              New enquiry
            </Link>
          )}
        </PageHead>
        <KpiStrip
          items={[
            { value: String(k.openCount), label: 'Open enquiries' },
            { value: fmtShort(cur, k.pipeline), label: `Pipeline (weighted ${fmtShort(cur, k.weighted)})` },
            { value: fmtShort(cur, k.won), label: k.target ? `Orders this month of ${fmtShort(cur, k.target)} target` : 'Orders this month', tone: k.target && k.won >= k.target ? 'hivis' : undefined },
            ...(['accounts', 'manager', 'gm', 'admin'].includes(d.me) ? [{ value: fmtShort(cur, k.outstanding), label: `To collect (${fmtShort(cur, k.overdue)} overdue)` }] : [{ value: k.winRate === null ? '-' : `${k.winRate}%`, label: 'Win rate' }]),
          ]}
        />
        <div className="o-panel">
          <div className="o-panel-head">
            <h2>Pipeline</h2>
            <Link className="o-btn small" href="/sales/pipeline">
              Open board
            </Link>
          </div>
          <div className="p-pipe">
            {d.byStage.map((s) => (
              <Link key={s.id} href={`/sales/enquiries?stage=${s.id}`} className={`p-pipe-step${s.count ? ' on' : ''}`}>
                <span className="p-pipe-n">{s.count}</span>
                <span className="p-pipe-l">{s.label}</span>
                <span className="p-pipe-v">{s.count ? fmtShort(cur, s.value) : ''}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="o-half">
          <div className="o-panel flush">
            <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
              <h2>Needs attention</h2>
              <Link className="o-btn small" href="/sales/queue">
                Approvals and tasks
              </Link>
            </div>
            <EnquiryTable rows={d.attention} currency={cur} empty="Nothing late or waiting." />
          </div>
          <div className="o-panel">
            <h2>Recent activity</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.recent.length === 0 && <li className="faint">No activity yet.</li>}
              {d.recent.map((x) => (
                <li key={x.id} style={{ fontSize: 13 }}>
                  <Link href={enquiryHref(x.enquiryId)}>{x.number}</Link> {x.text}
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
      <TopBar crumbs={['Sales', 'Approvals and tasks']} />
      <div className="o-page">
        <PageHead title="Approvals and tasks" lead={`Waiting for you as ${roleLabel(d.me).toLowerCase()}.`} />
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

const Pipeline: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ rows: await enquiries.listEnquiries(tx, ctx), cfg: await loadConfig(tx, ctx.companyId) }));
  const cur = d.cfg.currency;
  return (
    <>
      <TopBar crumbs={['Sales', 'Pipeline']} />
      <div className="o-page">
        <PageHead title="Pipeline" lead="Open enquiries by stage. Open a card to work on it." />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${OPEN_STAGES.length}, minmax(220px, 1fr))`, gap: 12, overflowX: 'auto', alignItems: 'start' }}>
          {OPEN_STAGES.map((s) => {
            const list = d.rows.filter((r) => r.stage === s);
            return (
              <div key={s} className="o-panel" style={{ padding: 10, background: 'var(--paper)' }}>
                <div className="o-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{stageLabel(s)}</strong>
                  <span className="faint" style={{ fontSize: 11 }}>
                    {list.length} · {fmtShort(cur, list.reduce((n, r) => n + r.net, 0))}
                  </span>
                </div>
                <div className="o-stack" style={{ gap: 8 }}>
                  {list.length === 0 && <span className="faint" style={{ fontSize: 12 }}>Empty</span>}
                  {list.map((r) => (
                    <Link key={r.id} href={enquiryHref(r.id)} className="o-panel" style={{ padding: 10, textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <div style={{ fontSize: 11 }} className="faint">
                        {r.number} · {r.customer}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, margin: '2px 0 4px' }}>{r.title}</div>
                      <div className="o-row" style={{ fontSize: 11, justifyContent: 'space-between' }}>
                        <span>{r.net ? fmtShort(cur, r.net) : '-'}</span>
                        <span className="muted">{r.owner}</span>
                      </div>
                      {(r.late || inApproval(r.quoteStatus)) && <div style={{ marginTop: 4 }}>{r.late ? <Chip tone="bad">Follow-up late</Chip> : <Chip tone="hivis">With sales manager</Chip>}</div>}
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

const Enquiries: Screen = async ({ searchParams }) => {
  const stage = STAGES.find((s) => s.id === one(searchParams.stage))?.id as Stage | undefined;
  const mine = one(searchParams.mine) === '1';
  const q = (one(searchParams.q) ?? '').toLowerCase();
  const d = await query(async (tx, ctx) => ({ rows: await enquiries.listEnquiries(tx, ctx, { stage, mine }), cfg: await loadConfig(tx, ctx.companyId) }));
  const rows = q ? d.rows.filter((r) => `${r.number} ${r.title} ${r.customer} ${r.quoteNo ?? ''}`.toLowerCase().includes(q)) : d.rows;
  return (
    <>
      <TopBar crumbs={['Sales', 'Enquiries']} />
      <div className="o-page">
        <PageHead title="Enquiries" lead={stage ? `Stage: ${stageLabel(stage)}` : 'Every enquiry and where it is.'}>
          <Link className="o-btn primary" href="/sales/new">
            New enquiry
          </Link>
        </PageHead>
        <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <nav className="o-tabs" aria-label="Filter">
            <Link href="?" aria-current={!stage && !mine ? 'page' : undefined}>
              All
            </Link>
            <Link href="?mine=1" aria-current={mine ? 'page' : undefined}>
              Mine
            </Link>
            {STAGES.map((s) => (
              <Link key={s.id} href={`?stage=${s.id}`} aria-current={stage === s.id ? 'page' : undefined}>
                {s.label}
              </Link>
            ))}
          </nav>
          <form className="o-row" style={{ gap: 6 }}>
            {stage && <input type="hidden" name="stage" value={stage} />}
            <input className="o-input" name="q" defaultValue={q} placeholder="Search number, customer, title" style={{ width: 240 }} aria-label="Search" />
          </form>
        </div>
        <div className="o-panel flush">
          <EnquiryTable rows={rows} currency={d.cfg.currency} />
        </div>
      </div>
    </>
  );
};

const Quotations: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ rows: await enquiries.listEnquiries(tx, ctx, { quotes: true }), cfg: await loadConfig(tx, ctx.companyId) }));
  return (
    <>
      <TopBar crumbs={['Sales', 'Quotations']} />
      <div className="o-page">
        <PageHead title="Quotations" lead={`${d.rows.length} quotations, ${fmtMoney(d.cfg.currency, d.rows.filter((r) => OPEN_STAGES.includes(r.stage)).reduce((n, r) => n + r.net, 0))} open before GST.`} />
        <div className="o-panel flush">
          <EnquiryTable rows={d.rows} currency={d.cfg.currency} quotes empty="No quotations yet. A quotation number is given when the estimator finishes pricing." />
        </div>
      </div>
    </>
  );
};

const NewEnquiry: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ me: await myRole(tx, ctx), customers: await customers.listCustomers(tx, ctx) }));
  if (!['exec', 'manager', 'admin'].includes(d.me))
    return (
      <div className="o-page">
        <EmptyState title="Your sales role does not create enquiries." />
      </div>
    );
  return <NewEnquiryClient customers={d.customers.map((c) => ({ id: c.id, name: c.name, city: c.city }))} />;
};

const Enquiry: Screen = async ({ searchParams }) => {
  const id = one(searchParams.id) ?? '';
  const d = /^[0-9a-f-]{36}$/.test(id) ? await query((tx, ctx) => enquiries.enquiryDetail(tx, ctx, id)) : null;
  if (!d)
    return (
      <div className="o-page">
        <EmptyState title="Enquiry not found." />
      </div>
    );
  return <EnquiryView d={d} />;
};

const Orders: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ o: await orders.listOrders(tx, ctx), cfg: await loadConfig(tx, ctx.companyId) }));
  return (
    <>
      <TopBar crumbs={['Sales', 'Sales orders']} />
      <div className="o-page">
        <PageHead title="Sales orders" lead="Won enquiries: the sales manager confirms, then production, dispatch and invoice." />
        <div className="o-panel flush">
          <div className="o-scroll">
            <OrdersTable rows={d.o.rows} currency={d.cfg.currency} can={d.o.can} />
          </div>
        </div>
      </div>
    </>
  );
};

const Invoices: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ i: await orders.listInvoices(tx, ctx), cfg: await loadConfig(tx, ctx.companyId) }));
  const cur = d.cfg.currency;
  const a = d.i.ageing;
  return (
    <>
      <TopBar crumbs={['Sales', 'Invoices and collections']} />
      <div className="o-page">
        <PageHead title="Invoices and collections" lead="GST invoices, money received and what is overdue." />
        <KpiStrip
          items={[
            { value: fmtShort(cur, a.current), label: 'Not yet due' },
            { value: fmtShort(cur, a.d30), label: '1-30 days late' },
            { value: fmtShort(cur, a.d60), label: '31-60 days late', tone: a.d60 ? 'hivis' : undefined },
            { value: fmtShort(cur, a.d90), label: 'Over 60 days late', tone: a.d90 ? 'hivis' : undefined },
          ]}
        />
        <div className="o-panel flush">
          <div className="o-scroll">
            <InvoicesTable rows={d.i.rows} currency={cur} canRecord={d.i.canRecord} />
          </div>
        </div>
      </div>
    </>
  );
};

const Customers: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ rows: await customers.listCustomers(tx, ctx), me: await myRole(tx, ctx), cfg: await loadConfig(tx, ctx.companyId) }));
  return (
    <>
      <TopBar crumbs={['Sales', 'Customers']} />
      <div className="o-page">
        <PageHead title="Customers" lead={`${d.rows.length} customers.`} />
        <CustomersClient rows={d.rows} currency={d.cfg.currency} canAdd={['exec', 'manager', 'accounts', 'admin'].includes(d.me)} />
      </div>
    </>
  );
};

const Targets: Screen = async () => {
  const d = await query((tx, ctx) => dashboard.targets(tx, ctx));
  return (
    <>
      <TopBar crumbs={['Sales', 'Targets']} />
      <div className="o-page">
        <PageHead title="Targets" lead="Orders booked this month against each salesperson's monthly target (before GST)." />
        <TargetsClient rows={d.rows} people={d.people} currency={d.cfg.currency} canEdit={d.canEdit} />
      </div>
    </>
  );
};

const Settings: Screen = async () => {
  const d = await query(async (tx, ctx) => ({ cfg: await loadConfig(tx, ctx.companyId), team: await admin.salesTeam(tx, ctx), admin: ctx.role === 'company_admin' }));
  if (!d.admin)
    return (
      <div className="o-page">
        <EmptyState title="Only a company admin can change sales settings." />
      </div>
    );
  return (
    <>
      <TopBar crumbs={['Sales', 'Sales settings']} />
      <div className="o-page">
        <PageHead title="Sales settings" lead="Approval limits, GST, quotation terms and who does what." />
        <SettingsClient cfg={d.cfg} team={d.team} />
      </div>
    </>
  );
};

export const salesRoutes: Record<string, Screen> = Object.fromEntries(
  Object.entries({
    '': Dashboard,
    queue: Queue,
    pipeline: Pipeline,
    new: NewEnquiry,
    enquiries: Enquiries,
    enquiry: Enquiry,
    quotations: Quotations,
    orders: Orders,
    invoices: Invoices,
    customers: Customers,
    targets: Targets,
    'admin/settings': Settings,
  }).map(([k, s]) => [k, guard(s)]),
);
