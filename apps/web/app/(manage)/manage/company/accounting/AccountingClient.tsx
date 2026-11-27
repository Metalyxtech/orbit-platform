'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Chip, ConfirmDialog, EmptyState, Field, Select, Toggle, useToast, type ChipTone } from '@orbit/ui';
import type { AccountingPage } from '@/accounting/admin';
import type { OptionField } from '@/accounting/types';
import { disconnectAction, resetDocAction, saveOnlineSettingsAction, saveTallySettingsAction, sendDocsAction } from './actions';

type Data = AccountingPage;
type Kind = 'sales_invoice' | 'purchase_bill';

const PROVIDERS = [
  { id: 'zoho', name: 'Zoho Books', blurb: 'India, UK, US, UAE and more. Invoices and bills arrive as drafts with your numbers, GST and place of supply.' },
  { id: 'quickbooks', name: 'QuickBooks Online', blurb: 'US, UK, Canada, Australia and India. Customers and suppliers are created when new.' },
  { id: 'xero', name: 'Xero', blurb: 'UK, Australia, New Zealand, US. Sales invoices and bills arrive as drafts or approved, your choice.' },
  { id: 'tally', name: 'Tally', blurb: 'TallyPrime and Tally.ERP 9. Download a file and import it in Tally: CGST, SGST and IGST split for you.' },
] as const;

const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  new: { label: 'Not sent', tone: 'grey' },
  sent: { label: 'Sent', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
  exported: { label: 'Exported', tone: 'ok' },
};

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AccountingClient({ data, fields, optionsError }: { data: Data; fields: OptionField[]; optionsError: string | null }) {
  const active = data.active;
  const [tallySetup, setTallySetup] = useState(false);
  if (!active || active.status !== 'connected' || tallySetup) {
    return (
      <>
        {active && active.status !== 'connected' && active.lastError !== 'Disconnected' && (
          <div className="o-banner bad">
            {active.name}: {active.lastError ?? 'needs reconnecting'}.{' '}
            {active.provider !== 'tally' && (
              <a className="o-btn small" href={`/api/accounting/${active.provider}/connect`}>
                Reconnect {active.name}
              </a>
            )}
          </div>
        )}
        {tallySetup ? <TallyForm data={data} onDone={() => setTallySetup(false)} /> : <Choose data={data} onTally={() => setTallySetup(true)} />}
      </>
    );
  }
  return (
    <>
      <Connected data={data} />
      {active.provider === 'tally' ? <TallyExport data={data} onEdit={() => setTallySetup(true)} /> : <OnlineSettings data={data} fields={fields} error={optionsError} />}
      {data.lists.length === 0 ? (
        <EmptyState title="No Sales or Purchase portal yet">Invoices and bills appear here once your company uses the Sales or Purchase portal.</EmptyState>
      ) : (
        data.lists.map((l) => <DocList key={l.kind} list={l} provider={active.provider} name={active.name} />)
      )}
    </>
  );
}

function Choose({ data, onTally }: { data: Data; onTally: () => void }) {
  return (
    <div className="o-panel">
      <h2 style={{ marginTop: 0 }}>Choose your accounts software</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        One at a time. You can switch later; what was already sent stays recorded.
      </p>
      <div className="o-form-gallery">
        {PROVIDERS.map((p) => {
          const online = p.id !== 'tally';
          const ready = !online || data.configured[p.id];
          return (
            <article key={p.id} className="o-panel o-form-card">
              <h3 style={{ margin: 0 }}>{p.name}</h3>
              <p style={{ fontSize: 13, margin: '8px 0 0' }}>{p.blurb}</p>
              <div className="o-row" style={{ marginTop: 'auto', paddingTop: 12 }}>
                {!online ? (
                  <Button variant="primary" onClick={onTally}>
                    Set up Tally
                  </Button>
                ) : ready ? (
                  <a className="o-btn primary" href={`/api/accounting/${p.id}/connect`}>
                    Connect {p.name}
                  </a>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Coming soon on SteelConnect360. Ask support to switch it on.
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Connected({ data }: { data: Data }) {
  const a = data.active!;
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  return (
    <div className="o-panel">
      <div className="o-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="o-row" style={{ gap: 8 }}>
            <h2 style={{ margin: 0 }}>{a.name}</h2>
            <Chip tone="ok">Connected</Chip>
          </div>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            {a.orgName}
            {a.provider !== 'tally' && ` · connected ${new Date(a.connectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        <div className="o-row" style={{ gap: 8 }}>
          {a.provider !== 'tally' && (
            <a className="o-btn small" href={`/api/accounting/${a.provider}/connect`}>
              Reconnect
            </a>
          )}
          <Button size="small" variant="danger" onClick={() => setAsking(true)}>
            Disconnect
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={asking}
        title={`Disconnect ${a.name}?`}
        confirmLabel="Disconnect"
        variant="danger"
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          setAsking(false);
          const res = await disconnectAction({ provider: a.provider });
          if (!res.ok) return toast(res.error, 'bad');
          toast(`${a.name} disconnected`);
          router.refresh();
        }}
      >
        <p style={{ margin: 0 }}>SteelConnect360 stops sending invoices and bills and forgets the sign-in. Nothing already sent is changed in your accounts.</p>
      </ConfirmDialog>
    </div>
  );
}

function OnlineSettings({ data, fields, error }: { data: Data; fields: OptionField[]; error: string | null }) {
  const a = data.active!;
  const s = a.settings as Record<string, unknown>;
  const router = useRouter();
  const toast = useToast();
  const orgs = (Array.isArray(s.orgs) ? s.orgs : []) as { id: string; name: string }[];
  const [v, setV] = useState(() => ({
    autoSend: s.autoSend === true,
    sendSales: s.sendSales !== false,
    sendPurchase: s.sendPurchase !== false,
    approve: s.approve === true,
    orgId: a.orgId ?? '',
    ...Object.fromEntries(fields.map((f) => [f.key, typeof s[f.key] === 'string' ? (s[f.key] as string) : ''])),
  }));
  const set = (k: string, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  const missing = fields.filter((f) => f.required && !(v as Record<string, unknown>)[f.key] && ((f.for === 'sales' && v.sendSales) || (f.for === 'purchase' && v.sendPurchase)));
  async function save() {
    const res = await saveOnlineSettingsAction(v);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Saved');
    router.refresh();
  }
  const group = (which: 'sales' | 'purchase', title: string) => {
    const list = fields.filter((f) => f.for === which);
    if (!list.length) return null;
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {list.map((f) => (
          <Field key={f.key} label={`${f.label}${f.required ? '' : ' (optional)'}`} help={f.help}>
            <Select value={String((v as Record<string, unknown>)[f.key] ?? '')} options={[{ value: '', label: f.required ? 'Choose…' : 'Default' }, ...f.choices]} onChange={(x) => set(f.key, x)} aria-label={f.label} />
          </Field>
        ))}
      </div>
    );
  };
  return (
    <div className="o-panel" style={{ display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0 }}>Settings</h2>
      {error && <div className="o-banner bad">{error}</div>}
      {orgs.length > 1 && (
        <Field label="Organisation" help="This login can reach more than one organisation. Changing it clears the account choices below.">
          <Select value={v.orgId} options={orgs.map((o) => ({ value: o.id, label: o.name }))} onChange={(x) => set('orgId', x)} aria-label="Organisation" />
        </Field>
      )}
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {group('sales', 'Sales invoices')}
        {group('purchase', 'Purchase bills')}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <Toggle checked={v.sendSales} onChange={(x) => set('sendSales', x)} label="Send Sales invoices" />
        <Toggle checked={v.sendPurchase} onChange={(x) => set('sendPurchase', x)} label="Send Purchase bills (once the supplier invoice is matched to the PO)" />
        <Toggle checked={v.autoSend} onChange={(x) => set('autoSend', x)} label="Send automatically as soon as an invoice is raised or a bill is matched" />
        {a.provider === 'xero' && <Toggle checked={v.approve} onChange={(x) => set('approve', x)} label="Approve in Xero straight away (otherwise they arrive as drafts to review)" />}
      </div>
      {missing.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Still to choose: {missing.map((f) => f.label).join(', ')}.</p>}
      <div>
        <Button variant="primary" onClick={save}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

type TallyKey = keyof Data['tallyDefaults'];
const TALLY_FIELDS: { key: TallyKey; label: string; help?: string; when?: 'split' | 'single' }[] = [
  { key: 'companyName', label: 'Company name in Tally (optional)', help: 'Exactly as in Tally. Empty: imports into the company open in Tally.' },
  { key: 'companyGstin', label: 'Your company GSTIN', help: 'Decides CGST + SGST (same state) or IGST (other state) from the party’s GSTIN.', when: 'split' },
  { key: 'salesVoucherType', label: 'Sales voucher type' },
  { key: 'purchaseVoucherType', label: 'Purchase voucher type' },
  { key: 'salesLedger', label: 'Sales ledger' },
  { key: 'purchaseLedger', label: 'Purchase ledger' },
  { key: 'outputCgst', label: 'Output CGST ledger', when: 'split' },
  { key: 'outputSgst', label: 'Output SGST ledger', when: 'split' },
  { key: 'outputIgst', label: 'Output IGST ledger', when: 'split' },
  { key: 'inputCgst', label: 'Input CGST ledger', when: 'split' },
  { key: 'inputSgst', label: 'Input SGST ledger', when: 'split' },
  { key: 'inputIgst', label: 'Input IGST ledger', when: 'split' },
  { key: 'outputTax', label: 'Output tax ledger', when: 'single' },
  { key: 'inputTax', label: 'Input tax ledger', when: 'single' },
  { key: 'debtorsGroup', label: 'Group for customers' },
  { key: 'creditorsGroup', label: 'Group for suppliers' },
];

function TallyForm({ data, onDone }: { data: Data; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const start = (data.active?.provider === 'tally' ? data.active.settings : data.tallyDefaults) as unknown as Data['tallyDefaults'];
  const [v, setV] = useState<Data['tallyDefaults']>({ ...data.tallyDefaults, ...start });
  async function save() {
    const res = await saveTallySettingsAction(v);
    if (!res.ok) return toast(res.error, 'bad');
    toast('Tally is set up');
    onDone();
    router.refresh();
  }
  return (
    <div className="o-panel" style={{ display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0 }}>Tally ledgers</h2>
      <p className="muted" style={{ margin: 0 }}>
        Use the ledger names exactly as they are in your Tally company. Customers and suppliers are created in Tally from the first file.
      </p>
      <Field label="GST">
        <Select
          value={v.gstMode}
          options={[
            { value: 'split', label: 'India GST: CGST + SGST or IGST' },
            { value: 'single', label: 'One tax ledger (VAT or other tax)' },
          ]}
          onChange={(x) => setV({ ...v, gstMode: x })}
          aria-label="GST"
        />
      </Field>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {TALLY_FIELDS.filter((f) => !f.when || f.when === v.gstMode).map((f) => (
          <Field key={f.key} label={f.label} help={f.help}>
            <input className="o-input" id={`tally-${f.key}`} value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="o-row" style={{ gap: 8 }}>
        <Button variant="primary" onClick={save}>
          Save and use Tally
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function TallyExport({ data, onEdit }: { data: Data; onEdit: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyNew, setOnlyNew] = useState(true);
  const q = (part: string) => `/api/accounting/tally?${new URLSearchParams({ part, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(onlyNew ? { only: 'new' } : {}) })}`;
  const s = data.active!.settings as unknown as Data['tallyDefaults'];
  return (
    <div className="o-panel" style={{ display: 'grid', gap: 12 }}>
      <div className="o-row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Export to Tally</h2>
        <Button size="small" onClick={onEdit}>
          Edit ledgers
        </Button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Sales to <strong>{s.salesLedger}</strong>, purchases to <strong>{s.purchaseLedger}</strong>, {s.gstMode === 'split' ? 'GST split into CGST + SGST or IGST' : `tax to ${s.outputTax} / ${s.inputTax}`}.
      </p>
      <div className="o-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <Field label="From">
          <input className="o-input" type="date" id="tally-from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="o-input" type="date" id="tally-to" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Toggle checked={onlyNew} onChange={setOnlyNew} label="Only invoices and bills not exported before" />
      </div>
      <div className="o-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <a className="o-btn" href={q('masters')}>
          1. Download customers and suppliers
        </a>
        <a className="o-btn primary" href={q('vouchers')} onClick={() => setTimeout(() => window.location.reload(), 1500)}>
          2. Download invoices and bills
        </a>
      </div>
      <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        <li>In TallyPrime open your company, then Gateway of Tally &gt; Import &gt; Masters, and choose file 1.</li>
        <li>Then Import &gt; Transactions and choose file 2. Tally shows how many vouchers it imported.</li>
        <li>Make sure the sales, purchase and GST ledgers above exist in Tally before importing.</li>
      </ol>
    </div>
  );
}

function DocList({ list, provider, name }: { list: Data['lists'][number]; provider: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const online = provider !== 'tally';
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const unsent = useMemo(() => list.docs.filter((d) => d.status === 'new' || d.status === 'failed').length, [list.docs]);
  async function send(ids: string[] | 'unsent') {
    setBusy(true);
    const res = await sendDocsAction({ kind: list.kind as Kind, ids });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'bad');
    const r = res.data;
    if (r.failed) toast(`${r.sent} sent, ${r.failed} failed. ${r.errors[0] ?? ''}`, 'bad');
    else toast(r.sent ? `${r.sent} sent to ${name}` : 'Nothing new to send');
    setPicked(new Set());
    router.refresh();
  }
  async function reset(id: string) {
    const res = await resetDocAction({ kind: list.kind, id });
    if (!res.ok) return toast(res.error, 'bad');
    router.refresh();
  }
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));
  return (
    <div className="o-panel flush">
      <div className="o-row" style={{ justifyContent: 'space-between', padding: '12px 14px', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          {list.label} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({unsent} not {online ? 'sent' : 'exported'})</span>
        </h2>
        {online && (
          <div className="o-row" style={{ gap: 8 }}>
            <Button size="small" disabled={busy || !picked.size} onClick={() => send([...picked])}>
              Send selected ({picked.size})
            </Button>
            <Button size="small" variant="primary" disabled={busy || !unsent} onClick={() => send('unsent')}>
              {busy ? 'Sending…' : `Send all not sent to ${name}`}
            </Button>
          </div>
        )}
      </div>
      {list.docs.length === 0 ? (
        <EmptyState title={list.kind === 'sales_invoice' ? 'No invoices raised yet' : 'No supplier invoices matched yet'} />
      ) : (
        <div className="o-scroll">
          <table className="o-table">
            <thead>
              <tr>
                {online && <th scope="col" aria-label="Select" />}
                <th scope="col">Number</th>
                <th scope="col">Date</th>
                <th scope="col">{list.kind === 'sales_invoice' ? 'Customer' : 'Supplier'}</th>
                <th scope="col">Order</th>
                <th scope="col" className="num">
                  Value
                </th>
                <th scope="col" className="num">
                  Tax
                </th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {list.docs.map((d) => (
                <tr key={d.id}>
                  {online && (
                    <td>
                      <input type="checkbox" aria-label={`Select ${d.number}`} disabled={d.status === 'sent'} checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                    </td>
                  )}
                  <td style={{ whiteSpace: 'nowrap' }}>{d.number}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.date}</td>
                  <td>{d.party}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.reference}</td>
                  <td className="num">{money(d.net)}</td>
                  <td className="num">{money(d.tax)}</td>
                  <td className="num">{money(d.total)}</td>
                  <td>
                    <Chip tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Chip>
                    {d.error && (
                      <div className="faint" style={{ fontSize: 11, maxWidth: 280, whiteSpace: 'normal' }}>
                        {d.error}
                      </div>
                    )}
                  </td>
                  <td>
                    {online && d.status === 'failed' && (
                      <Button size="small" disabled={busy} onClick={() => send([d.id])}>
                        Try again
                      </Button>
                    )}
                    {!online && d.status === 'exported' && (
                      <Button size="small" onClick={() => reset(d.id)}>
                        Export again
                      </Button>
                    )}
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
