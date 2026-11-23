'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Chip } from '@orbit/ui';
import { fmtQty, MR_STATUS, RECEIPT_DOCS } from '../config';
import {
  adjustStockAction,
  askPurchaseAction,
  cancelMrAction,
  confirmStoreDocUploadAction,
  createMrAction,
  decideMrAction,
  issueMrAction,
  receiveDirectAction,
  recordDeliveryAction,
  startStoreDocUploadAction,
} from '../actions';
import type { MrDetail, MrRow } from '../server';
import { mrHref } from './ui';
import { useRun } from './useRun';

// Production store and material requests: the client parts (forms and buttons).

export const MrChip = ({ status }: { status: MrRow['status'] }) => <Chip tone={MR_STATUS[status].tone}>{MR_STATUS[status].label}</Chip>;

type Line = { materialId: string | null; item: string; unit: string; qty: string };

/** Work order page: its material requests and "Request material" for the supervisor. */
export function WoMaterialRequests({
  workOrderId,
  materials,
  mrs,
  canRequest,
}: {
  workOrderId: string;
  materials: { id: string; item: string; unit: string; qty: number; issuedQty: number }[];
  mrs: MrRow[];
  canRequest: boolean;
}) {
  const { busy, run, router } = useRun();
  const [open, setOpen] = useState(false);
  const start = (): Line[] =>
    materials.length ? materials.filter((m) => m.qty - m.issuedQty > 1e-9).map((m) => ({ materialId: m.id, item: m.item, unit: m.unit, qty: String(Math.round((m.qty - m.issuedQty) * 1000) / 1000) })) : [{ materialId: null, item: '', unit: 'nos', qty: '' }];
  const [lines, setLines] = useState<Line[]>(start);
  const [note, setNote] = useState('');
  if (!mrs.length && !canRequest) return null;
  const set = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const ready = lines.filter((l) => l.item.trim() && Number(l.qty) > 0);
  return (
    <div className="o-panel flush">
      <div className="o-panel-head" style={{ padding: '12px 16px 0' }}>
        <h2>Material requests</h2>
        {canRequest && !open && (
          <Button size="small" variant="primary" onClick={() => (setLines(start()), setOpen(true))}>
            Request material
          </Button>
        )}
      </div>
      {mrs.length > 0 && (
        <table className="o-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Items</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mrs.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={mrHref(m.id)}>
                    <strong>{m.number}</strong>
                  </Link>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {m.by}
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>{m.items}</td>
                <td>
                  <MrChip status={m.status} />
                  {m.purchaseRef && <div className="faint" style={{ fontSize: 11 }}>Purchase {m.purchaseRef}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <div className="o-stack" style={{ padding: 12, gap: 8, borderTop: '1px solid var(--line)' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            The production store keeper issues what is in the production store and asks Purchase for the rest.
          </span>
          {lines.map((l, i) => (
            <div key={i} className="o-row" style={{ gap: 6, alignItems: 'flex-end' }}>
              <label className="o-field" style={{ flex: 3 }}>
                Item
                <input className="o-input" value={l.item} disabled={!!l.materialId} onChange={(e) => set(i, { item: e.target.value })} />
              </label>
              <label className="o-field" style={{ flex: 1 }}>
                Qty
                <input className="o-input num" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
              </label>
              <label className="o-field" style={{ flex: 1 }}>
                Unit
                <input className="o-input" value={l.unit} disabled={!!l.materialId} onChange={(e) => set(i, { unit: e.target.value })} />
              </label>
              <Button size="small" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          <div className="o-row" style={{ gap: 8 }}>
            <Button size="small" onClick={() => setLines([...lines, { materialId: null, item: '', unit: 'nos', qty: '' }])}>
              Add item
            </Button>
          </div>
          <label className="o-field">
            Note for the store (optional)
            <input className="o-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="o-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={busy || !ready.length}
              onClick={async () => {
                const res = await run(() => createMrAction({ workOrderId, note, lines: ready.map((l) => ({ materialId: l.materialId, item: l.item, unit: l.unit, qty: Number(l.qty) })) }), 'Material request sent to the production store.');
                if (res) {
                  setOpen(false);
                  router.push(mrHref(res.id));
                }
              }}
            >
              Send to production store
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The action panel on a material request, by status and role. */
export function MrActions({ d }: { d: MrDetail }) {
  const { busy, run } = useRun();
  const [qty, setQty] = useState<string[]>(d.lines.map((l) => String(Math.max(0, Math.min(l.left, l.available)))));
  const [note, setNote] = useState('');
  const [dn, setDn] = useState('');
  const [supplier, setSupplier] = useState('');
  const [condition, setCondition] = useState<'Good' | 'Damaged' | 'Short'>('Good');
  const [docsOk, setDocsOk] = useState(true);
  const [dq, setDq] = useState<string[]>(d.buyLines.map((l) => String(Math.max(0, l.toBuy - l.received))));
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const c = d.can;
  const any = c.issue || c.ask || c.approve || c.deliver || c.cancel;
  const shortfall = d.lines.some((l) => l.left > l.available + 1e-9);
  if (!any && !receiptId)
    return (
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {MR_STATUS[d.mr.status].who
          ? `Waiting for the ${MR_STATUS[d.mr.status].who.toLowerCase()}.`
          : d.mr.status === 'issued'
            ? `Complete: everything was issued to ${d.wo.number}.`
            : `This request was ${d.mr.status}.`}
        {d.mr.status === 'purchase' && d.purchase ? ` Purchase ${d.purchase.number} is at ${d.purchase.stageLabel.toLowerCase()}${d.purchase.poNo ? ` (PO ${d.purchase.poNo})` : ''}.` : ''}
      </p>
    );
  return (
    <div className="o-stack" style={{ gap: 12 }}>
      {c.issue && (
        <div className="o-stack" style={{ gap: 6 }}>
          <strong style={{ fontSize: 13 }}>Issue from the production store</strong>
          {d.lines.map((l, i) =>
            l.left > 0 ? (
              <label key={i} className="o-field">
                {l.item}
                <span className="faint" style={{ fontSize: 11 }}>
                  To issue {fmtQty(l.left)} {l.unit} · in stock {fmtQty(l.available)}
                </span>
                <input className="o-input num" type="number" min={0} step="any" value={qty[i]} onChange={(e) => setQty(qty.map((v, j) => (j === i ? e.target.value : v)))} />
              </label>
            ) : null,
          )}
          <Button variant="primary" disabled={busy || !qty.some((q) => Number(q) > 0)} onClick={() => run(() => issueMrAction({ id: d.mr.id, qty: qty.map((q) => Number(q) || 0) }), 'Issued to the work order.')}>
            Issue to {d.wo.number}
          </Button>
        </div>
      )}
      {c.ask && shortfall && (
        <div className="o-stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <strong style={{ fontSize: 13 }}>Not enough in the production store</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Ask for the balance. The production engineer and the production manager approve, then it goes to Purchase (main store or buying).
          </span>
          <input className="o-input" placeholder="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <Button disabled={busy} onClick={() => run(() => askPurchaseAction({ id: d.mr.id, note }), 'Sent to the production engineer for approval.')}>
            Request balance from Purchase
          </Button>
        </div>
      )}
      {c.approve && (
        <div className="o-stack" style={{ gap: 6 }}>
          <strong style={{ fontSize: 13 }}>{d.mr.status === 'engineer' ? 'Production engineer approval' : 'Production manager approval'}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {d.mr.status === 'engineer' ? 'Approve to send it to the production manager.' : 'Approve to send it to Purchase: the purchase store keeper issues it from the main store, or Purchase buys it.'}
          </span>
          <textarea className="o-input" rows={2} placeholder="Comment (needed to send back)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <div className="o-row" style={{ gap: 8 }}>
            <Button variant="primary" disabled={busy} onClick={() => run(() => decideMrAction({ id: d.mr.id, approve: true, note }), d.mr.status === 'engineer' ? 'Approved. Sent to the production manager.' : 'Approved and sent to Purchase.')}>
              Approve
            </Button>
            <Button disabled={busy || !note.trim()} onClick={() => run(() => decideMrAction({ id: d.mr.id, approve: false, note }), 'Sent back to the production store.')}>
              Send back
            </Button>
          </div>
        </div>
      )}
      {c.deliver && !receiptId && (
        <div className="o-stack" style={{ gap: 6 }}>
          <strong style={{ fontSize: 13 }}>Material received at the production store</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Against Purchase {d.purchase?.number}
            {d.purchase?.poNo ? ` / PO ${d.purchase.poNo}` : ''}. QC inspects it with the MTC you upload next; then it goes into the production store stock.
          </span>
          <input className="o-input" placeholder="Delivery note / challan no. *" value={dn} maxLength={80} onChange={(e) => setDn(e.target.value)} />
          <input className="o-input" placeholder="Supplier (optional)" value={supplier} maxLength={200} onChange={(e) => setSupplier(e.target.value)} />
          {d.buyLines.map((l, i) => (
            <label key={i} className="o-field">
              {l.item}
              <span className="faint" style={{ fontSize: 11 }}>
                Ordered {fmtQty(l.toBuy)} {l.unit}
              </span>
              <input className="o-input num" type="number" min={0} step="any" value={dq[i]} onChange={(e) => setDq(dq.map((v, j) => (j === i ? e.target.value : v)))} />
            </label>
          ))}
          <select className="o-select" value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} aria-label="Condition">
            <option>Good</option>
            <option>Damaged</option>
            <option>Short</option>
          </select>
          <label className="o-row" style={{ gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={docsOk} onChange={(e) => setDocsOk(e.target.checked)} />
            MTC / test certificates received with the material
          </label>
          <Button
            variant="primary"
            disabled={busy || !dn.trim()}
            onClick={async () => {
              const res = await run(() => recordDeliveryAction({ id: d.mr.id, deliveryNote: dn, supplier, condition, docsOk, qty: dq.map((q) => Number(q) || 0) }), 'Delivery recorded. Upload the MTC for QC.');
              if (res) setReceiptId(res.receiptId);
            }}
          >
            Save material received
          </Button>
        </div>
      )}
      {receiptId && <StoreDocsUpload receiptId={receiptId} label="Upload MTC / test certificates for QC" />}
      {c.cancel && (
        <details style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 12 }}>
            Cancel this request
          </summary>
          <div className="o-row" style={{ gap: 6, marginTop: 6 }}>
            <input className="o-input" placeholder="Why?" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button disabled={busy || note.trim().length < 2} onClick={() => run(() => cancelMrAction({ id: d.mr.id, note }), 'Request cancelled.')}>
              Cancel request
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}

function put(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<boolean>((resolve) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', file.type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => resolve(x.status >= 200 && x.status < 300);
    x.onerror = () => resolve(false);
    x.send(file);
  });
}

/** Uploads MTC / test certificates to a production store receipt (QC gets them). */
export function StoreDocsUpload({ receiptId, label = 'Upload MTC' }: { receiptId: string; label?: string }) {
  const { toast, router } = useRun();
  const [progress, setProgress] = useState<string | null>(null);
  async function upload(files: File[]) {
    const failed: string[] = [];
    for (const f of files) {
      if (!RECEIPT_DOCS.types.includes(f.type) || f.size > RECEIPT_DOCS.maxBytes) {
        failed.push(f.name);
        continue;
      }
      const start = await startStoreDocUploadAction({ receiptId, fileName: f.name, contentType: f.type, size: f.size });
      if (!start.ok) {
        failed.push(`${f.name} (${start.error})`);
        continue;
      }
      const ok = await put(start.data.url, f, (p) => setProgress(`${f.name}: ${p}%`));
      if (!ok || !(await confirmStoreDocUploadAction({ fileId: start.data.fileId })).ok) failed.push(f.name);
    }
    setProgress(null);
    toast(failed.length ? `Not uploaded: ${failed.join(', ')}. PDF or image up to 25 MB.` : 'Documents uploaded. QC can open them.', failed.length ? 'bad' : undefined);
    router.refresh();
  }
  return (
    <label className="o-btn small" style={{ cursor: progress ? 'wait' : 'pointer', alignSelf: 'flex-start' }}>
      {progress ?? label}
      <input
        type="file"
        multiple
        accept={RECEIPT_DOCS.accept}
        disabled={!!progress}
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void upload(files);
        }}
      />
    </label>
  );
}

/** "Material received" at the production store (not through a material request). */
export function ReceiveDirectForm({ qc }: { qc: boolean }) {
  const { busy, run } = useRun();
  const blank = { item: '', qty: '', unit: 'nos' };
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([blank]);
  const [reference, setReference] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<{ id: string; number: string } | null>(null);
  const ready = lines.filter((l) => l.item.trim() && Number(l.qty) > 0);
  if (saved)
    return (
      <div className="o-panel" style={{ borderLeft: '3px solid var(--ok)' }}>
        <strong>{saved.number} saved.</strong>{' '}
        <span className="muted" style={{ fontSize: 13 }}>
          {qc ? 'Upload the MTC / test certificates now: QC inspects it, then it goes into stock.' : 'It is in the production store stock.'}
        </span>
        <div className="o-row" style={{ gap: 8, marginTop: 8 }}>
          <StoreDocsUpload receiptId={saved.id} label="Upload MTC / documents" />
          <Button size="small" onClick={() => (setSaved(null), setLines([blank]), setReference(''), setSupplier(''), setNote(''))}>
            Record another
          </Button>
        </div>
      </div>
    );
  if (!open)
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Material received
      </Button>
    );
  return (
    <div className="o-panel o-stack" style={{ gap: 8 }}>
      <h2>Material received at the production store</h2>
      <div className="o-row" style={{ gap: 8 }}>
        <input className="o-input" placeholder="Delivery note / challan no. *" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
        <input className="o-input" placeholder="Supplier (optional)" value={supplier} maxLength={200} onChange={(e) => setSupplier(e.target.value)} />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="o-row" style={{ gap: 6 }}>
          <input className="o-input" style={{ flex: 3 }} placeholder="Item" value={l.item} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
          <input className="o-input num" style={{ flex: 1 }} type="number" min={0} step="any" placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <input className="o-input" style={{ flex: 1 }} placeholder="Unit" value={l.unit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
        </div>
      ))}
      <Button size="small" onClick={() => setLines([...lines, blank])}>
        Add item
      </Button>
      <input className="o-input" placeholder="Note (heat no., vehicle…) optional" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="o-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          variant="primary"
          disabled={busy || !reference.trim() || !ready.length}
          onClick={async () => {
            const res = await run(() => receiveDirectAction({ reference, supplier, note, lines: ready.map((l) => ({ item: l.item, qty: Number(l.qty), unit: l.unit })) }), qc ? 'Saved. Sent to QC.' : 'Saved into stock.');
            if (res) setSaved(res);
          }}
        >
          Save {qc ? 'and send to QC' : 'into stock'}
        </Button>
      </div>
    </div>
  );
}

/** Opening stock and stock-count corrections. */
export function StockAdjustForm() {
  const { busy, run } = useRun();
  const [f, setF] = useState({ item: '', unit: 'nos', qty: '', note: 'Opening stock' });
  return (
    <details className="o-panel">
      <summary style={{ cursor: 'pointer' }}>
        <strong>Add opening stock or correct a count</strong>
      </summary>
      <div className="o-row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input className="o-input" style={{ flex: 3, minWidth: 160 }} placeholder="Item" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />
        <input className="o-input num" style={{ flex: 1, minWidth: 80 }} type="number" step="any" placeholder="+ / − qty" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        <input className="o-input" style={{ flex: 1, minWidth: 70 }} placeholder="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        <input className="o-input" style={{ flex: 3, minWidth: 160 }} placeholder="Why" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <Button
          variant="primary"
          disabled={busy || !f.item.trim() || !Number(f.qty)}
          onClick={async () => (await run(() => adjustStockAction({ item: f.item, unit: f.unit, qty: Number(f.qty), note: f.note }), 'Stock updated.')) && setF({ ...f, item: '', qty: '' })}
        >
          Save
        </Button>
      </div>
    </details>
  );
}
