import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { salesCustomers, salesEnquiries, salesEvents, salesLines, salesOrders, type Tx } from '@orbit/db';
import { inApproval, needsGm, fmtMoney, LOST_REASONS, OPEN_STAGES, quoteTotals, SOURCES, stageLabel, suggestedRate, unitCost, type QuoteStatus, type Stage } from '../config';
import { addCustomer, customerInput } from './customers';
import { listDocs } from './doc-store';
import { addDays, hasRole, loadConfig, lockEnquiry, logEvent, myRole, nextNumber, peopleById, requireRole, today } from './shared';

// Enquiries: the project (details and documents, editable by sales until pricing is done),
// its quotation lines, costing, discount approval, sending, and won or lost.

const lineInput = z.object({
  item: z.string().trim().min(1, 'Describe each line').max(300),
  qty: z.number().min(0).max(1e9),
  unit: z.string().trim().min(1).max(20),
  rate: z.number().min(0).max(1e12).default(0),
  cost: z.number().min(0).max(1e12).default(0),
});

const createInput = z.object({
  customerId: z.uuid().optional(),
  newCustomer: customerInput.optional(),
  title: z.string().trim().min(4, 'Describe the requirement').max(200),
  details: z.string().trim().max(8000).optional(),
  source: z.enum(SOURCES as [string, ...string[]]).default('Phone'),
  probability: z.number().int().min(0).max(100).default(30),
  followUp: z.iso.date().optional(),
  lines: z.array(lineInput.pick({ item: true, qty: true, unit: true })).max(100).default([]),
});

export async function createEnquiry(tx: Tx, ctx: ActionContext, raw: z.input<typeof createInput>) {
  requireRole(await myRole(tx, ctx), 'exec', 'manager');
  const v = createInput.parse(raw);
  const customerId = v.customerId ?? (v.newCustomer ? (await addCustomer(tx, ctx, v.newCustomer)).id : null);
  if (!customerId) throw new Error('Choose a customer or add a new one');
  const [c] = await tx.select({ name: salesCustomers.name }).from(salesCustomers).where(and(eq(salesCustomers.id, customerId), eq(salesCustomers.companyId, ctx.companyId)));
  if (!c) throw new Error('Customer not found');
  const number = await nextNumber(tx, ctx.companyId, 'enq');
  const [e] = await tx
    .insert(salesEnquiries)
    .values({ companyId: ctx.companyId, number, customerId, title: v.title, details: v.details || null, source: v.source, ownerId: ctx.membershipId, probability: v.probability, followUp: v.followUp ?? addDays(today(), 2) })
    .returning({ id: salesEnquiries.id });
  if (v.lines.length) await tx.insert(salesLines).values(v.lines.map((l, i) => ({ companyId: ctx.companyId, enquiryId: e.id, position: i, item: l.item, qty: l.qty, unit: l.unit })));
  await logEvent(tx, ctx, e.id, `Enquiry ${number} created for ${c.name}`, 'sales.enquiry.create');
  return { id: e.id, number };
}

/** Sales may change the project until the estimator has finished pricing. */
const assertProjectOpen = (r: { pricingDoneAt: Date | null; stage: string }) => {
  if (r.pricingDoneAt || !['enquiry', 'costing'].includes(r.stage)) throw new Error('Pricing is done, so the project details and documents are locked. Ask the sales manager to reopen it.');
};
const assertMineOrManager = (me: string, ownerId: string | null, ctx: SessionContext) => {
  if (!(hasRole(me as never, 'manager') || ownerId === ctx.membershipId)) throw new Error('Only the enquiry owner or the sales manager can change this');
};

const projectInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(4).max(200),
  details: z.string().trim().max(8000).optional(),
  source: z.enum(SOURCES as [string, ...string[]]),
  probability: z.number().int().min(0).max(100),
  followUp: z.iso.date().nullable(),
});

/** Edit the project (requirement, notes, source, chance, follow-up) until pricing is done. */
export async function updateProject(tx: Tx, ctx: ActionContext, raw: z.input<typeof projectInput>) {
  const v = projectInput.parse(raw);
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, v.id);
  assertMineOrManager(me, r.ownerId, ctx);
  assertProjectOpen(r);
  await tx.update(salesEnquiries).set({ title: v.title, details: v.details || null, source: v.source, probability: v.probability, followUp: v.followUp, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, 'Project details updated');
  return { ok: true as const };
}

/** Follow-up date and chance of winning can change at any open stage. */
export async function setFollowUp(tx: Tx, ctx: ActionContext, raw: { id: string; followUp: string | null; probability: number; note?: string }) {
  const v = z.object({ id: z.uuid(), followUp: z.iso.date().nullable(), probability: z.number().int().min(0).max(100), note: z.string().trim().max(500).optional() }).parse(raw);
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, v.id);
  assertMineOrManager(me, r.ownerId, ctx);
  if (!OPEN_STAGES.includes(r.stage as Stage)) throw new Error('This enquiry is closed');
  await tx.update(salesEnquiries).set({ followUp: v.followUp, probability: v.probability, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, `Follow-up ${v.followUp ?? 'cleared'} · chance ${v.probability}%${v.note ? `: ${v.note}` : ''}`);
  return { ok: true as const };
}

const linesInput = z.object({ id: z.uuid(), lines: z.array(lineInput).max(100) });

/**
 * Saves quotation lines (sales). Before pricing is done sales edits items, quantities and rates;
 * after pricing only rates change. Costs stay as the estimator left them (see saveCosting).
 */
export async function saveLines(tx: Tx, ctx: ActionContext, raw: z.input<typeof linesInput>) {
  const v = linesInput.parse(raw);
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, v.id);
  if (!OPEN_STAGES.includes(r.stage as Stage)) throw new Error('This enquiry is closed');
  if (inApproval(r.quoteStatus)) throw new Error('The quotation is waiting for approval; it cannot change now');
  assertMineOrManager(me, r.ownerId, ctx);
  const old = await tx.select().from(salesLines).where(eq(salesLines.enquiryId, r.id)).orderBy(asc(salesLines.position));
  const keepCost = (i: number) => ({ cost: old[i]?.cost ?? 0, material: old[i]?.material ?? 0, labour: old[i]?.labour ?? 0, other: old[i]?.other ?? 0 });
  let next;
  if (r.pricingDoneAt) {
    if (v.lines.length !== old.length) throw new Error('Lines cannot be added or removed after pricing; ask the sales manager to reopen it for the estimator');
    next = old.map((o, i) => ({ item: o.item, qty: o.qty, unit: o.unit, rate: v.lines[i].rate, ...keepCost(i) }));
  } else {
    next = v.lines.map((l, i) => ({ item: l.item, qty: l.qty, unit: l.unit, rate: l.rate, ...keepCost(i) }));
  }
  await tx.delete(salesLines).where(eq(salesLines.enquiryId, r.id));
  if (next.length) await tx.insert(salesLines).values(next.map((l, i) => ({ companyId: ctx.companyId, enquiryId: r.id, position: i, ...l })));
  // Changed lines are a new offer: it needs approval again (if the rule asks) and a new send.
  await tx.update(salesEnquiries).set({ quoteStatus: 'draft', updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  // Record the new value so approvers (and everyone on the enquiry) see what changed.
  const cfg = await loadConfig(tx, ctx.companyId);
  const before = quoteTotals(old, r.discount, cfg.gst).net;
  const after = quoteTotals(next, r.discount, cfg.gst).net;
  if (Math.round(before) !== Math.round(after)) await logEvent(tx, ctx, r.id, `Rates updated: value ${fmtMoney(cfg.currency, before)} → ${fmtMoney(cfg.currency, after)} (before GST)`);
  return { ok: true as const };
}

const costingInput = z.object({
  id: z.uuid(),
  lines: z
    .array(
      z.object({
        item: z.string().trim().min(1, 'Describe each line').max(300),
        qty: z.number().min(0).max(1e9),
        unit: z.string().trim().min(1).max(20),
        material: z.number().min(0).max(1e12),
        labour: z.number().min(0).max(1e12),
        other: z.number().min(0).max(1e12),
      }),
    )
    .max(200),
  markup: z.number().min(0).max(500),
  notes: z.string().trim().max(8000).optional(),
});

/**
 * The estimator's costing sheet: lines with unit cost broken into material, labour and other,
 * the markup for suggested selling rates, and the costing basis (assumptions, exclusions).
 */
export async function saveCosting(tx: Tx, ctx: ActionContext, raw: z.input<typeof costingInput>) {
  const v = costingInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'estimator');
  const r = await lockEnquiry(tx, ctx, v.id);
  if (r.stage !== 'costing' || r.pricingDoneAt) throw new Error('This enquiry is not with the estimator');
  const old = await tx.select().from(salesLines).where(eq(salesLines.enquiryId, r.id)).orderBy(asc(salesLines.position));
  await tx.delete(salesLines).where(eq(salesLines.enquiryId, r.id));
  if (v.lines.length)
    await tx.insert(salesLines).values(
      v.lines.map((l, i) => ({ companyId: ctx.companyId, enquiryId: r.id, position: i, item: l.item, qty: l.qty, unit: l.unit, material: l.material, labour: l.labour, other: l.other, cost: unitCost(l), rate: old[i]?.rate ?? 0 })),
    );
  await tx.update(salesEnquiries).set({ markup: v.markup, costingNotes: v.notes || null, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  return { ok: true as const };
}

export async function setDiscount(tx: Tx, ctx: ActionContext, raw: { id: string; discount: number }) {
  const v = z.object({ id: z.uuid(), discount: z.number().min(0).max(50) }).parse(raw);
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, v.id);
  assertMineOrManager(me, r.ownerId, ctx);
  if (!OPEN_STAGES.includes(r.stage as Stage) || inApproval(r.quoteStatus)) throw new Error('The discount cannot change now');
  await tx.update(salesEnquiries).set({ discount: v.discount, quoteStatus: 'draft', updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  if (v.discount !== r.discount) await logEvent(tx, ctx, r.id, `Discount ${r.discount}% → ${v.discount}%`);
  return { ok: true as const };
}

/** Sales hands the project to the estimator. */
export async function sendToCosting(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, z.uuid().parse(raw.id));
  assertMineOrManager(me, r.ownerId, ctx);
  if (r.stage !== 'enquiry') throw new Error('Only a new enquiry goes to costing');
  await tx.update(salesEnquiries).set({ stage: 'costing', updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, 'Sent to the estimator for costing', 'sales.enquiry.costing');
  return { ok: true as const };
}

/** The estimator finishes pricing: costs are in, the project locks, the quotation gets its number. */
export async function pricingDone(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireRole(await myRole(tx, ctx), 'estimator');
  const r = await lockEnquiry(tx, ctx, z.uuid().parse(raw.id));
  if (r.stage !== 'costing') throw new Error('This enquiry is not waiting for costing');
  const lines = await tx.select().from(salesLines).where(eq(salesLines.enquiryId, r.id));
  if (!lines.length) throw new Error('Add the quotation lines first');
  if (lines.some((l) => l.qty > 0 && !(l.cost > 0))) throw new Error('Enter a cost for every line');
  // Lines without a selling rate get the estimator's suggested rate (cost plus markup); sales can change them.
  let suggested = 0;
  for (const l of lines) {
    if (l.rate > 0 || !(r.markup > 0)) continue;
    await tx.update(salesLines).set({ rate: suggestedRate(l.cost, r.markup) }).where(eq(salesLines.id, l.id));
    suggested++;
  }
  const quoteNo = r.quoteNo ?? (await nextNumber(tx, ctx.companyId, 'qt'));
  await tx.update(salesEnquiries).set({ stage: 'quoted', pricingDoneAt: new Date(), quoteNo, quoteStatus: 'draft', ...clearReturn, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  const cost = lines.reduce((n, l) => n + l.qty * l.cost, 0);
  const cfg = await loadConfig(tx, ctx.companyId);
  await logEvent(tx, ctx, r.id, `Pricing done: cost ${fmtMoney(cfg.currency, cost)}${suggested ? `, suggested rates at ${r.markup}% markup` : ''}. Quotation ${quoteNo} ready for sales.`, 'sales.enquiry.priced');
  return { ok: true as const };
}

/** The sales manager reopens a priced project (for example, new drawings came in). */
export async function reopenProject(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireRole(await myRole(tx, ctx), 'manager');
  const r = await lockEnquiry(tx, ctx, z.uuid().parse(raw.id));
  if (!['quoted', 'negotiation'].includes(r.stage) || inApproval(r.quoteStatus)) throw new Error('Only a priced, open enquiry can be reopened');
  await tx.update(salesEnquiries).set({ stage: 'costing', pricingDoneAt: null, quoteStatus: 'draft', updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, 'Reopened for changes and repricing', 'sales.enquiry.reopen');
  return { ok: true as const };
}

async function quoteState(tx: Tx, r: typeof salesEnquiries.$inferSelect, companyId: string) {
  const cfg = await loadConfig(tx, companyId);
  const lines = await tx.select().from(salesLines).where(eq(salesLines.enquiryId, r.id));
  const t = quoteTotals(lines, r.discount, cfg.gst);
  return { cfg, lines, t, gm: needsGm(r.discount, t.margin, t.cost > 0, cfg) };
}

/** Sales sends the priced quotation for approval: the sales manager first, then (if needed) the GM. */
const askInput = z.object({
  id: z.uuid(),
  /** Rates on screen (one per line) and the discount: saved first, so approvers see exactly what was sent. */
  rates: z.array(z.number().min(0).max(1e12)).max(200).optional(),
  discount: z.number().min(0).max(50).optional(),
});

export async function askApproval(tx: Tx, ctx: ActionContext, raw: z.input<typeof askInput>) {
  const v = askInput.parse(raw);
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  if (v.rates) {
    const cur = await tx.select().from(salesLines).where(eq(salesLines.enquiryId, v.id)).orderBy(asc(salesLines.position));
    if (v.rates.length !== cur.length) throw new Error('The lines changed meanwhile. Reload the page.');
    if (cur.some((l, i) => l.rate !== v.rates![i])) await saveLines(tx, ctx, { id: v.id, lines: cur.map((l, i) => ({ item: l.item, qty: l.qty, unit: l.unit, rate: v.rates![i] })) });
  }
  if (v.discount !== undefined) {
    const [cur] = await tx.select({ discount: salesEnquiries.discount }).from(salesEnquiries).where(eq(salesEnquiries.id, v.id));
    if (cur && cur.discount !== v.discount) await setDiscount(tx, ctx, { id: v.id, discount: v.discount });
  }
  const r = await lockEnquiry(tx, ctx, v.id);
  assertMineOrManager(me, r.ownerId, ctx);
  if (!r.pricingDoneAt || !['quoted', 'negotiation'].includes(r.stage)) throw new Error('The quotation is not ready');
  if (!['draft', 'rejected'].includes(r.quoteStatus)) throw new Error('This quotation is already in approval or approved');
  const q = await quoteState(tx, r, ctx.companyId);
  if (!q.lines.length || q.lines.some((l) => l.qty > 0 && !(l.rate > 0))) throw new Error('Enter a rate for every line');
  await tx.update(salesEnquiries).set({ quoteStatus: 'pending', ...clearReturn, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, `${r.quoteNo} with ${r.discount}% discount sent to the sales manager for approval${q.gm ? ', then the GM' : ''}`, 'sales.quote.ask');
  return { gm: q.gm };
}

const decideInput = z.object({
  id: z.uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(1000).optional(),
  /** The sales manager may change the discount while approving. */
  discount: z.number().min(0).max(50).optional(),
  /** On send-back: who fixes it. The sales manager can send to sales or the estimator; the GM also to the sales manager. */
  sendTo: z.enum(['exec', 'estimator', 'manager']).optional(),
});

const RETURN_LABEL = { exec: 'the sales executive', estimator: 'the estimator', manager: 'the sales manager' } as const;
const clearReturn = { returnedTo: null, returnedNote: null, returnedBy: null };

/**
 * Approval chain. Step 1, the sales manager: approve (optionally with a new discount) or send
 * back, with a comment. Step 2, the GM: final approval. A send-back needs a comment.
 */
export async function decideQuote(tx: Tx, ctx: ActionContext, raw: z.input<typeof decideInput>) {
  const v = decideInput.parse(raw);
  const me = await myRole(tx, ctx);
  const r = await lockEnquiry(tx, ctx, v.id);
  if (!inApproval(r.quoteStatus)) throw new Error('Nothing is waiting for approval on this quotation');
  if (!v.approve && !v.note) throw new Error('Add a comment to say why it goes back');
  const step = r.quoteStatus === 'pending' ? 'manager' : 'gm';
  if (step === 'manager') requireRole(me, 'manager', 'gm');
  else requireRole(me, 'gm');
  const who = step === 'manager' ? 'Sales manager' : 'GM';
  if (!v.approve) {
    const to = v.sendTo ?? 'exec';
    if (to === 'manager' && step !== 'gm') throw new Error('Only the GM can send it back to the sales manager');
    const note = v.note!.slice(0, 1000);
    const back = { returnedTo: to, returnedNote: note, returnedBy: who, updatedAt: new Date() };
    if (to === 'estimator') {
      // Back to costing: the estimator reprices; sales can change the project again until pricing is done.
      await tx.update(salesEnquiries).set({ ...back, stage: 'costing', pricingDoneAt: null, quoteStatus: 'draft' }).where(eq(salesEnquiries.id, r.id));
    } else if (to === 'manager') {
      await tx.update(salesEnquiries).set({ ...back, quoteStatus: 'pending' }).where(eq(salesEnquiries.id, r.id));
    } else {
      await tx.update(salesEnquiries).set({ ...back, quoteStatus: 'rejected' }).where(eq(salesEnquiries.id, r.id));
    }
    await logEvent(tx, ctx, r.id, `${who} sent ${r.quoteNo} back to ${RETURN_LABEL[to]}. Comment: ${note}`, 'sales.quote.reject');
    return { status: to === 'estimator' ? 'costing' : to === 'manager' ? 'pending' : 'rejected' };
  }
  let discount = r.discount;
  if (step === 'manager' && v.discount !== undefined && v.discount !== r.discount) {
    discount = v.discount;
    await logEvent(tx, ctx, r.id, `Discount changed by the sales manager: ${r.discount}% → ${discount}%`);
  }
  const q = await quoteState(tx, { ...r, discount }, ctx.companyId);
  // The GM approving at step 1 is final; otherwise the GM step follows when the rule asks for it.
  const next = step === 'manager' && q.gm && me !== 'gm' ? 'pending_gm' : 'approved';
  await tx.update(salesEnquiries).set({ quoteStatus: next, discount, ...clearReturn, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  const what = next === 'pending_gm' ? 'approved; now with the GM for final approval' : step === 'gm' ? 'gave final approval' : 'approved';
  await logEvent(tx, ctx, r.id, `${who} ${what}: ${r.quoteNo} at ${discount}% discount${v.note ? `. Comment: ${v.note.slice(0, 500)}` : ''}`, 'sales.quote.approve');
  return { status: next };
}

/** Sends the quotation to the customer (a new revision each time it goes out again). */
export async function sendQuote(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, z.uuid().parse(raw.id));
  assertMineOrManager(me, r.ownerId, ctx);
  if (!r.pricingDoneAt || !['quoted', 'negotiation'].includes(r.stage)) throw new Error('The quotation is not ready');
  const q = await quoteState(tx, r, ctx.companyId);
  if (q.lines.some((l) => l.qty > 0 && !(l.rate > 0))) throw new Error('Enter a rate for every line');
  if (r.quoteStatus !== 'approved' && r.quoteStatus !== 'sent') throw new Error('The quotation needs approval first (sales manager, then GM)');
  const rev = r.quoteStatus === 'sent' || (await wasSent(tx, r.id, r.quoteNo)) ? r.rev + 1 : r.rev;
  await tx.update(salesEnquiries).set({ quoteStatus: 'sent', rev, followUp: addDays(today(), 3), updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, `Sent ${r.quoteNo} Rev ${rev} for ${fmtMoney(q.cfg.currency, q.t.total)} incl. GST`, 'sales.quote.send');
  return { rev };
}
async function wasSent(tx: Tx, id: string, quoteNo: string | null) {
  const rows = await tx.select({ text: salesEvents.text }).from(salesEvents).where(eq(salesEvents.enquiryId, id));
  return rows.some((e) => e.text.startsWith(`Sent ${quoteNo} Rev `));
}

export async function toNegotiation(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, z.uuid().parse(raw.id));
  assertMineOrManager(me, r.ownerId, ctx);
  if (r.stage !== 'quoted' || r.quoteStatus !== 'sent') throw new Error('Send the quotation first');
  await tx.update(salesEnquiries).set({ stage: 'negotiation', updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, 'Customer is negotiating');
  return { ok: true as const };
}

/** Won: a sales order is created and waits for the sales manager to confirm it. */
export async function markWon(tx: Tx, ctx: ActionContext, raw: { id: string; advancePct?: number }) {
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, z.uuid().parse(raw.id));
  assertMineOrManager(me, r.ownerId, ctx);
  if (!['quoted', 'negotiation'].includes(r.stage) || r.quoteStatus !== 'sent') throw new Error('Send the quotation before marking it won');
  const q = await quoteState(tx, r, ctx.companyId);
  const number = await nextNumber(tx, ctx.companyId, 'so');
  const advance = Math.max(0, Math.min(100, Math.round(raw.advancePct ?? q.cfg.defaultAdvance)));
  await tx.insert(salesOrders).values({ companyId: ctx.companyId, number, enquiryId: r.id, customerId: r.customerId, title: r.title, value: Math.round(q.t.net * 100) / 100, advancePct: advance, ownerId: r.ownerId });
  await tx.update(salesEnquiries).set({ stage: 'won', probability: 100, followUp: null, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, `Won: sales order ${number} for ${fmtMoney(q.cfg.currency, q.t.net)} (before GST)`, 'sales.enquiry.won');
  return { order: number };
}

export async function markLost(tx: Tx, ctx: ActionContext, raw: { id: string; reason: string }) {
  const v = z.object({ id: z.uuid(), reason: z.enum(LOST_REASONS as [string, ...string[]]) }).parse(raw);
  const me = await myRole(tx, ctx);
  requireRole(me, 'exec', 'manager');
  const r = await lockEnquiry(tx, ctx, v.id);
  assertMineOrManager(me, r.ownerId, ctx);
  if (!OPEN_STAGES.includes(r.stage as Stage) || inApproval(r.quoteStatus)) throw new Error('This enquiry cannot be closed now');
  await tx.update(salesEnquiries).set({ stage: 'lost', probability: 0, followUp: null, lostReason: v.reason, updatedAt: new Date() }).where(eq(salesEnquiries.id, r.id));
  await logEvent(tx, ctx, r.id, `Lost: ${v.reason}`, 'sales.enquiry.lost');
  return { ok: true as const };
}

export interface EnquiryFilter {
  stage?: Stage;
  mine?: boolean;
  quotes?: boolean;
}

/** Enquiries with totals, newest first. Sales executives see their own. */
export async function listEnquiries(tx: Tx, ctx: SessionContext, f: EnquiryFilter = {}) {
  const me = await myRole(tx, ctx);
  const seeCost = hasRole(me, 'estimator', 'manager', 'gm');
  const cfg = await loadConfig(tx, ctx.companyId);
  const conds = [eq(salesEnquiries.companyId, ctx.companyId)];
  if (f.stage) conds.push(eq(salesEnquiries.stage, f.stage));
  if (f.mine || me === 'exec') conds.push(eq(salesEnquiries.ownerId, ctx.membershipId));
  const rows = await tx
    .select({ e: salesEnquiries, customer: salesCustomers.name })
    .from(salesEnquiries)
    .innerJoin(salesCustomers, eq(salesCustomers.id, salesEnquiries.customerId))
    .where(and(...conds))
    .orderBy(desc(salesEnquiries.createdAt))
    .limit(500);
  const ids = rows.map((r) => r.e.id);
  const lines = ids.length ? await tx.select().from(salesLines).where(inArray(salesLines.enquiryId, ids)) : [];
  const people = await peopleById(tx, rows.map((r) => r.e.ownerId));
  const t0 = today();
  return rows
    .filter((r) => !f.quotes || r.e.quoteNo)
    .map(({ e, customer }) => {
      const t = quoteTotals(lines.filter((l) => l.enquiryId === e.id), e.discount, cfg.gst);
      return {
        id: e.id,
        number: e.number,
        title: e.title,
        customer,
        owner: e.ownerId ? (people.get(e.ownerId) ?? '') : '',
        ownerId: e.ownerId,
        stage: e.stage as Stage,
        stageLabel: stageLabel(e.stage),
        source: e.source ?? '',
        probability: e.probability,
        followUp: e.followUp,
        late: !!e.followUp && e.followUp < t0 && OPEN_STAGES.includes(e.stage as Stage),
        quoteNo: e.quoteNo,
        rev: e.rev,
        quoteStatus: e.quoteStatus as QuoteStatus,
        discount: e.discount,
        net: t.net,
        total: t.total,
        margin: seeCost ? t.margin : null,
        hasCost: t.cost > 0,
        gm: needsGm(e.discount, t.margin, t.cost > 0, cfg),
      };
    });
}
export type EnquiryRow = Awaited<ReturnType<typeof listEnquiries>>[number];

/** Everything on one enquiry, with what this person may do next. */
export async function enquiryDetail(tx: Tx, ctx: SessionContext, id: string) {
  const me = await myRole(tx, ctx);
  const cfg = await loadConfig(tx, ctx.companyId);
  const [row] = await tx
    .select({ e: salesEnquiries, c: salesCustomers })
    .from(salesEnquiries)
    .innerJoin(salesCustomers, eq(salesCustomers.id, salesEnquiries.customerId))
    .where(and(eq(salesEnquiries.id, id), eq(salesEnquiries.companyId, ctx.companyId)));
  if (!row) return null;
  const { e, c } = row;
  if (me === 'exec' && e.ownerId !== ctx.membershipId) return null;
  const [lines, events, docs, order] = await Promise.all([
    tx.select().from(salesLines).where(eq(salesLines.enquiryId, e.id)).orderBy(asc(salesLines.position)),
    tx.select().from(salesEvents).where(eq(salesEvents.enquiryId, e.id)).orderBy(desc(salesEvents.createdAt)),
    listDocs(tx, ctx.companyId, e.id),
    tx.select({ number: salesOrders.number, status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.enquiryId, e.id)),
  ]);
  const people = await peopleById(tx, [e.ownerId, ...events.map((x) => x.byId), ...docs.map((d) => d.byId)]);
  const t = quoteTotals(lines, e.discount, cfg.gst);
  const gm = needsGm(e.discount, t.margin, t.cost > 0, cfg);
  const seeCost = hasRole(me, 'estimator', 'manager', 'gm');
  const mineOrManager = hasRole(me, 'manager') || e.ownerId === ctx.membershipId;
  const sales = hasRole(me, 'exec', 'manager') && mineOrManager;
  const open = OPEN_STAGES.includes(e.stage as Stage);
  const projectOpen = !e.pricingDoneAt && ['enquiry', 'costing'].includes(e.stage);
  return {
    me,
    cfg,
    // Markup reveals cost: only for those who see costs. The costing basis (notes) is for everyone.
    enquiry: { ...e, markup: seeCost ? e.markup : 0, owner: e.ownerId ? (people.get(e.ownerId) ?? '') : '' },
    customer: c,
    // Costs and margin stay with the estimator and management.
    lines: seeCost ? lines : lines.map((l) => ({ ...l, cost: 0, material: 0, labour: 0, other: 0 })),
    totals: seeCost ? t : { ...t, cost: 0, margin: 0 },
    gm,
    order: order[0] ?? null,
    docs: docs.filter((d) => d.section === 'project').map((d) => ({ ...d, by: d.byId ? (people.get(d.byId) ?? '') : '' })),
    costingDocs: seeCost ? docs.filter((d) => d.section === 'costing').map((d) => ({ ...d, by: d.byId ? (people.get(d.byId) ?? '') : '' })) : [],
    /** The quotation already went to the customer once, so the next send is a revision. */
    sentBefore: !!e.quoteNo && events.some((x) => x.text.startsWith(`Sent ${e.quoteNo} Rev `)),
    events: events.map((x) => ({ id: x.id, text: x.text, at: x.createdAt.toISOString(), by: x.byId ? (people.get(x.byId) ?? '') : '' })),
    can: {
      editProject: sales && projectOpen,
      editDocs: sales && projectOpen,
      editLines: open && !inApproval(e.quoteStatus) && sales && (projectOpen || !!e.pricingDoneAt),
      editRatesOnly: !!e.pricingDoneAt,
      editCost: hasRole(me, 'estimator') && e.stage === 'costing' && !e.pricingDoneAt,
      seeCost,
      discount: sales && !!e.pricingDoneAt && open && !inApproval(e.quoteStatus),
      sendToCosting: sales && e.stage === 'enquiry',
      pricingDone: hasRole(me, 'estimator') && e.stage === 'costing',
      reopen: hasRole(me, 'manager') && ['quoted', 'negotiation'].includes(e.stage) && !inApproval(e.quoteStatus),
      askApproval: sales && !!e.pricingDoneAt && open && ['draft', 'rejected'].includes(e.quoteStatus),
      /** manager = step 1 (can change the discount), gm = final step. */
      approve: (e.quoteStatus === 'pending' && hasRole(me, 'manager', 'gm') ? 'manager' : e.quoteStatus === 'pending_gm' && hasRole(me, 'gm') ? 'gm' : null) as null | 'manager' | 'gm',
      send: sales && !!e.pricingDoneAt && open && (e.quoteStatus === 'approved' || e.quoteStatus === 'sent'),
      negotiate: sales && e.stage === 'quoted' && e.quoteStatus === 'sent',
      won: sales && ['quoted', 'negotiation'].includes(e.stage) && e.quoteStatus === 'sent',
      lost: sales && open && !inApproval(e.quoteStatus),
      followUp: sales && open,
    },
  };
}
export type EnquiryDetail = NonNullable<Awaited<ReturnType<typeof enquiryDetail>>>;
