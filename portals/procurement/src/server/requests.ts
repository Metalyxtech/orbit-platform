import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { procEvents, procItems, procLines, procMoves, procQuotes, procReceipts, procRequests, procSuppliers, type Tx } from '@orbit/db';
import { OPEN_STAGES, roleLabel, stageLabel, type ProcConfig, type ProcRole, type Stage } from '../config';
import {
  buyOf,
  canAct,
  chainFor,
  estValue,
  expectedInvoice,
  flowOf,
  fullyReceived,
  nextStage,
  ownerRole,
  pendingLevel,
  quoteValue,
  r2,
  r3,
  receivedQty,
  taxOf,
  variancePct,
  withinTolerance,
} from '../engine';
import { holdersOf } from './team';
import { loadConfig, moneyText, myRole, nextNumber, peopleById, requireRole, today } from './shared';

type Req = typeof procRequests.$inferSelect;
type Line = typeof procLines.$inferSelect;

// ---------- reading ----------

async function linesOf(tx: Tx, requestId: string) {
  return tx.select().from(procLines).where(eq(procLines.requestId, requestId)).orderBy(asc(procLines.sort));
}

async function lockRequest(tx: Tx, ctx: SessionContext, id: string) {
  const [r] = await tx
    .select()
    .from(procRequests)
    .where(and(eq(procRequests.id, id), eq(procRequests.companyId, ctx.companyId)))
    .for('update');
  if (!r) throw new Error('Request not found');
  return r;
}

async function approvedLevels(tx: Tx, requestId: string, stage: Stage) {
  const rows = await tx
    .select({ levelId: procEvents.levelId })
    .from(procEvents)
    .where(and(eq(procEvents.requestId, requestId), eq(procEvents.kind, 'approval'), eq(procEvents.stage, stage)));
  return rows.map((r) => r.levelId!).filter(Boolean);
}

async function awardedRates(tx: Tx, r: Req, lines: Line[]) {
  if (!r.awardQuoteId) return lines.map((l) => l.estRate);
  const [q] = await tx.select({ rates: procQuotes.rates }).from(procQuotes).where(eq(procQuotes.id, r.awardQuoteId));
  return q?.rates ?? lines.map((l) => l.estRate);
}

/** Value used for approvals: estimate at requisition approval, awarded value at PO approval. */
async function stageValue(tx: Tx, r: Req, lines: Line[], stage: Stage) {
  return stage === 'po_approval' ? quoteValue(lines, await awardedRates(tx, r, lines)) : estValue(lines);
}

export async function requestDetail(tx: Tx, ctx: SessionContext, id: string) {
  const cfg = await loadConfig(tx, ctx.companyId);
  const me = await myRole(tx, ctx);
  const [r] = await tx.select().from(procRequests).where(and(eq(procRequests.id, id), eq(procRequests.companyId, ctx.companyId)));
  if (!r) return null;
  const [lines, quotes, receipts, events] = await Promise.all([
    linesOf(tx, id),
    tx
      .select({ q: procQuotes, supplier: procSuppliers.name })
      .from(procQuotes)
      .innerJoin(procSuppliers, eq(procSuppliers.id, procQuotes.supplierId))
      .where(eq(procQuotes.requestId, id))
      .orderBy(asc(procQuotes.createdAt)),
    tx.select().from(procReceipts).where(eq(procReceipts.requestId, id)).orderBy(asc(procReceipts.createdAt)),
    tx.select().from(procEvents).where(eq(procEvents.requestId, id)).orderBy(asc(procEvents.createdAt)),
  ]);
  const itemIds = lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const items = itemIds.length ? await tx.select().from(procItems).where(inArray(procItems.id, itemIds)) : [];
  const people = await peopleById(tx, [r.requesterId, ...events.map((e) => e.byId), ...receipts.map((g) => g.byId)]);
  const rates = r.awardQuoteId ? (quotes.find((q) => q.q.id === r.awardQuoteId)?.q.rates ?? lines.map((l) => l.estRate)) : lines.map((l) => l.estRate);
  const received = receivedQty(lines.length, receipts);
  const value = quoteValue(lines, rates);
  const stage = r.stage as Stage;
  const approved = stage === 'pr_approval' || stage === 'po_approval' ? await approvedLevels(tx, id, stage) : [];
  const pending = pendingLevel(cfg, stage, stage === 'po_approval' ? value : estValue(lines), approved);
  const owner = ownerRole(cfg, stage, pending);
  const roleHolders: Record<string, string[]> = Object.fromEntries(
    await Promise.all([...new Set(cfg.levels.map((l) => l.role))].map(async (role) => [role, await holdersOf(tx, ctx, role)] as const)),
  );
  const chainKind = stage === 'po_approval' || (r.awardQuoteId && stage !== 'pr_approval') ? 'po' : 'pr';
  const chainValue = chainKind === 'po' ? value : estValue(lines);
  return {
    me,
    isAdmin: ctx.role === 'company_admin',
    cfg: { form: cfg.form, options: cfg.options.filter((o) => o.on), minQuotes: cfg.minQuotes, money: cfg.money, flow: cfg.flow },
    flowStages: flowOf(cfg)
      .filter((k) => k !== 'draft' && k !== 'closed')
      .map((k) => ({ key: k, label: stageLabel(cfg, k) })),
    request: {
      id: r.id,
      number: r.number,
      title: r.title,
      project: r.project,
      needBy: r.needBy,
      priority: r.priority,
      requester: people.get(r.requesterId)?.name ?? '',
      requesterId: r.requesterId,
      stage,
      stageLabel: stageLabel(cfg, stage),
      stageAt: r.stageAt.toISOString(),
      header: r.header as Record<string, unknown>,
      awardQuoteId: r.awardQuoteId,
      poNo: r.poNo,
      poDate: r.poDate,
      invoice: r.invoice as { no: string; amount: number; expected: number; variancePct: number; override: boolean } | null,
      createdAt: r.createdAt.toISOString(),
      late: OPEN_STAGES.slice(0, 6).includes(stage) && r.needBy < today(ctx),
    },
    lines: lines.map((l, i) => {
      const it = items.find((x) => x.id === l.itemId);
      return {
        id: l.id,
        description: l.description,
        qty: l.qty,
        buy: buyOf(l),
        checked: l.buyQty != null,
        unit: l.unit,
        estRate: l.estRate,
        rate: rates[i] ?? 0,
        values: l.values as Record<string, unknown>,
        item: it ? { id: it.id, code: it.code, name: it.name, available: r3(it.onHand - it.reserved), unit: it.unit } : null,
        reservedQty: l.reservedQty,
        reserveState: l.reserveState,
        received: received[i],
      };
    }),
    quotes: quotes.map(({ q, supplier }) => ({ id: q.id, supplier, rates: q.rates, leadDays: q.leadDays, terms: q.terms, total: quoteValue(lines, q.rates) })),
    receipts: receipts.map((g) => ({
      id: g.id,
      deliveryNote: g.deliveryNote,
      condition: g.condition,
      docsOk: g.docsOk,
      qty: g.qty,
      intoStock: g.intoStock,
      extra: g.extra as Record<string, unknown>,
      by: people.get(g.byId ?? '')?.name ?? '',
      at: g.createdAt.toISOString(),
    })),
    events: events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, note: e.note, by: e.byId ? (people.get(e.byId)?.name ?? '') : 'Orbit', at: e.createdAt.toISOString() })),
    money: {
      estimate: estValue(lines),
      value,
      tax: taxOf(cfg, value),
      total: r2(value + taxOf(cfg, value)),
      expectedInvoice: expectedInvoice(cfg, lines, rates, received),
    },
    approval: {
      kind: chainKind,
      chain: chainFor(cfg, chainKind, chainValue).map((l) => ({ id: l.id, name: l.name, role: roleLabel(l.role), done: approved.includes(l.id) })),
      pending: pending ? { id: pending.id, name: pending.name } : null,
    },
    /** Both approval stages as the company set them up: switched off, not needed, done, now or later. */
    approvals: (['pr', 'po'] as const).map((kind) => {
      const st: Stage = kind === 'pr' ? 'pr_approval' : 'po_approval';
      const enabled = cfg.flow[st];
      const v = kind === 'pr' ? estValue(lines) : value;
      const chain = chainFor(cfg, kind, v);
      const doneIds = events.filter((e) => e.kind === 'approval' && e.stage === st).map((e) => e.levelId);
      const order: Stage[] = ['draft', 'stock_check', 'pr_approval', 'rfq', 'po_approval', 'issue', 'receiving', 'inspection', 'invoice', 'closed'];
      const past = stage === 'closed' || order.indexOf(stage) > order.indexOf(st);
      const rejected = events.some((e) => e.kind === 'rejection' && e.stage === st);
      const state = !enabled ? 'off' : rejected ? 'rejected' : chain.length === 0 && (past || stage === st) ? 'none' : past ? 'done' : stage === st ? 'now' : 'later';
      return {
        kind,
        label: stageLabel(cfg, st),
        state,
        basis: kind === 'po' && !r.awardQuoteId ? 'estimate' : kind === 'po' ? 'awarded value' : 'estimate',
        chain: chain.map((l) => ({
          id: l.id,
          name: l.name,
          role: roleLabel(l.role),
          state: doneIds.includes(l.id) ? 'done' : stage === st && pending?.id === l.id ? 'now' : 'next',
          people: roleHolders[l.role] ?? [],
        })),
      };
    }),
    owner: owner ? { role: owner, label: roleLabel(owner), people: await holdersOf(tx, ctx, owner) } : null,
    canAct: canAct(me, owner),
    canIssueStock: (me === 'store' || me === 'admin') && lines.some((l) => l.reserveState === 'reserved') && stage !== 'rejected',
    fullyReceived: fullyReceived(lines, received),
  };
}

export type RequestDetail = NonNullable<Awaited<ReturnType<typeof requestDetail>>>;

export type RequestFilter = 'open' | 'mine' | 'action' | 'closed' | 'all';

/** Request list with stage, value, owner and age. */
export async function listRequests(tx: Tx, ctx: SessionContext, opts: { filter?: RequestFilter; q?: string; poOnly?: boolean } = {}) {
  const cfg = await loadConfig(tx, ctx.companyId);
  const me = await myRole(tx, ctx);
  const rows = await tx.select().from(procRequests).where(eq(procRequests.companyId, ctx.companyId)).orderBy(desc(procRequests.createdAt)).limit(500);
  const ids = rows.map((r) => r.id);
  const [lines, quotes, approvals] = ids.length
    ? await Promise.all([
        tx.select().from(procLines).where(inArray(procLines.requestId, ids)),
        tx.select({ id: procQuotes.id, rates: procQuotes.rates, supplier: procSuppliers.name }).from(procQuotes).innerJoin(procSuppliers, eq(procSuppliers.id, procQuotes.supplierId)).where(inArray(procQuotes.requestId, ids)),
        tx.select({ requestId: procEvents.requestId, stage: procEvents.stage, levelId: procEvents.levelId }).from(procEvents).where(and(inArray(procEvents.requestId, ids), eq(procEvents.kind, 'approval'))),
      ])
    : [[], [], []];
  const people = await peopleById(tx, rows.map((r) => r.requesterId));
  const t = today(ctx);
  const list = rows.map((r) => {
    const ls = lines.filter((l) => l.requestId === r.id).sort((a, b) => a.sort - b.sort);
    const aw = quotes.find((q) => q.id === r.awardQuoteId);
    const value = aw ? quoteValue(ls, aw.rates) : estValue(ls);
    const stage = r.stage as Stage;
    const done = approvals.filter((a) => a.requestId === r.id && a.stage === stage).map((a) => a.levelId!);
    const owner = ownerRole(cfg, stage, pendingLevel(cfg, stage, stage === 'po_approval' ? value : estValue(ls), done));
    return {
      id: r.id,
      number: r.number,
      title: r.title,
      project: r.project,
      requester: people.get(r.requesterId)?.name ?? '',
      mine: r.requesterId === ctx.membershipId,
      stage,
      stageLabel: stageLabel(cfg, stage),
      owner: owner ? roleLabel(owner) : null,
      ownerRole: owner,
      actionable: canAct(me, owner),
      value,
      supplier: aw?.supplier ?? null,
      poNo: r.poNo,
      poDate: r.poDate,
      needBy: r.needBy,
      priority: r.priority,
      late: OPEN_STAGES.slice(0, 6).includes(stage) && r.needBy < t,
      daysInStage: Math.max(0, Math.floor((Date.now() - r.stageAt.getTime()) / 864e5)),
      createdAt: r.createdAt.toISOString(),
    };
  });
  const q = opts.q?.trim().toLowerCase();
  return list.filter((r) => {
    if (opts.poOnly && !r.poNo) return false;
    if (q && !`${r.number} ${r.title} ${r.project} ${r.requester} ${r.supplier ?? ''} ${r.poNo ?? ''}`.toLowerCase().includes(q)) return false;
    switch (opts.filter ?? 'open') {
      case 'open':
        return OPEN_STAGES.includes(r.stage);
      case 'mine':
        return r.mine;
      case 'action':
        return r.actionable;
      case 'closed':
        return r.stage === 'closed' || r.stage === 'rejected';
      default:
        return true;
    }
  });
}
export type RequestRow = Awaited<ReturnType<typeof listRequests>>[number];

// ---------- writing ----------

async function log(tx: Tx, ctx: ActionContext, r: Req, text: string, extra: Partial<typeof procEvents.$inferInsert> = {}) {
  await tx.insert(procEvents).values({ companyId: ctx.companyId, requestId: r.id, kind: 'log', stage: r.stage, text, byId: ctx.membershipId, ...extra });
}

/** Moves the request on, skipping approval stages that no rule applies to. */
async function advance(tx: Tx, ctx: ActionContext, cfg: ProcConfig, r: Req) {
  const lines = await linesOf(tx, r.id);
  let stage = nextStage(cfg, r.stage as Stage, lines);
  for (let guard = 0; guard < 12; guard++) {
    if (stage !== 'pr_approval' && stage !== 'po_approval') break;
    const v = await stageValue(tx, r, lines, stage);
    if (chainFor(cfg, stage === 'pr_approval' ? 'pr' : 'po', v).length) break;
    await tx.insert(procEvents).values({ companyId: ctx.companyId, requestId: r.id, kind: 'log', stage, text: `No approval rule applies, ${stageLabel(cfg, stage).toLowerCase()} skipped` });
    stage = nextStage(cfg, stage, lines);
  }
  await tx.update(procRequests).set({ stage, stageAt: new Date() }).where(eq(procRequests.id, r.id));
  if (stage === 'closed') await tx.insert(procEvents).values({ companyId: ctx.companyId, requestId: r.id, kind: 'log', stage, text: 'Request closed' });
  if (stage === 'stock_issue') await tx.insert(procEvents).values({ companyId: ctx.companyId, requestId: r.id, kind: 'log', stage, text: 'Fully covered by stock, nothing to buy' });
  return stage;
}

/** Checks the stage and that this person's role owns it. */
async function begin(tx: Tx, ctx: ActionContext, id: string, stage: Stage) {
  const cfg = await loadConfig(tx, ctx.companyId);
  const me = await myRole(tx, ctx);
  const r = await lockRequest(tx, ctx, id);
  if (r.stage !== stage) throw new Error(`This request is at ${stageLabel(cfg, r.stage as Stage)} now. Refresh the page.`);
  const lines = await linesOf(tx, id);
  const pending =
    stage === 'pr_approval' || stage === 'po_approval'
      ? pendingLevel(cfg, stage, await stageValue(tx, r, lines, stage), await approvedLevels(tx, id, stage))
      : null;
  const owner = ownerRole(cfg, stage, pending);
  if (!canAct(me, owner)) throw new Error(`Only the ${owner ? roleLabel(owner).toLowerCase() : 'owner'} can do this step`);
  return { cfg, me, r, lines, pending };
}

const fieldValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const createInput = z.object({
  title: z.string().trim().min(3, 'Give the request a title').max(200),
  project: z.string().trim().min(1, 'Choose a project').max(200),
  needBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date you need it by'),
  priority: z.enum(['Normal', 'Urgent']),
  header: z.record(z.string(), fieldValue),
  lines: z
    .array(
      z.object({
        itemId: z.uuid().nullable(),
        description: z.string().trim().min(1, 'Describe every line').max(300),
        qty: z.number().positive('Every line needs a quantity'),
        unit: z.string().trim().min(1).max(20),
        estRate: z.number().min(0),
        values: z.record(z.string(), fieldValue),
      }),
    )
    .min(1, 'Add at least one line'),
});
export type CreateRequestInput = z.input<typeof createInput>;

const empty = (v: unknown) => v == null || v === '' || v === false;

export async function createRequest(tx: Tx, ctx: ActionContext, raw: CreateRequestInput) {
  const input = createInput.parse(raw);
  const cfg = await loadConfig(tx, ctx.companyId);
  const me = await myRole(tx, ctx);
  requireRole(me, 'requester', 'buyer', 'store', 'manager');
  for (const f of cfg.form.header) if (f.required && empty(input.header[f.id])) throw new Error(`${f.label} is required`);
  input.lines.forEach((l, i) => {
    for (const f of cfg.form.line) if (f.required && empty(l.values[f.id])) throw new Error(`Line ${i + 1}: ${f.label} is required`);
  });
  if (input.needBy < today(ctx)) throw new Error('The need-by date is in the past');
  const number = await nextNumber(tx, ctx.companyId, 'pr', cfg);
  const [r] = await tx
    .insert(procRequests)
    .values({ companyId: ctx.companyId, number, title: input.title, project: input.project, needBy: input.needBy, priority: input.priority, requesterId: ctx.membershipId, stage: 'draft', header: input.header })
    .returning();
  await tx.insert(procLines).values(input.lines.map((l, i) => ({ companyId: ctx.companyId, requestId: r.id, sort: i, ...l })));
  const lines = await linesOf(tx, r.id);
  await log(tx, ctx, r, `Requisition raised, ${moneyText(cfg, estValue(lines))} estimated`);
  await advance(tx, ctx, cfg, r);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'procurement.request.create', entity: 'proc_requests', entityId: r.id, data: { number }, requestId: ctx.requestId });
  return { id: r.id, number };
}

const idOnly = z.object({ id: z.uuid() });

/** Stock check: reserve what is available per line; the rest is bought. */
export async function stockCheck(tx: Tx, ctx: ActionContext, raw: { id: string; fromStock: number[] }) {
  const input = idOnly.extend({ fromStock: z.array(z.number().min(0)) }).parse(raw);
  const { cfg, r, lines } = await begin(tx, ctx, input.id, 'stock_check');
  let reserved = 0;
  for (const [i, l] of lines.entries()) {
    let take = 0;
    if (l.itemId && input.fromStock[i] > 0) {
      const [it] = await tx.select().from(procItems).where(eq(procItems.id, l.itemId)).for('update');
      take = r3(Math.max(0, Math.min(input.fromStock[i], it.onHand - it.reserved, l.qty)));
      if (take > 0) {
        await tx.update(procItems).set({ reserved: r3(it.reserved + take) }).where(eq(procItems.id, it.id));
        reserved++;
      }
    }
    await tx
      .update(procLines)
      .set({ buyQty: r3(l.qty - take), reservedQty: take, reserveState: take > 0 ? 'reserved' : 'none' })
      .where(eq(procLines.id, l.id));
  }
  const toBuy = (await linesOf(tx, r.id)).filter((l) => buyOf(l) > 0).length;
  await log(tx, ctx, r, reserved ? `Stock checked: ${reserved} line${reserved === 1 ? '' : 's'} reserved from stock, ${toBuy} to buy` : 'Stock checked: nothing in stock, all lines to buy');
  return { stage: await advance(tx, ctx, cfg, r) };
}

/** Storekeeper issues reserved stock to the project (closes the request at Issue from stock). */
export async function issueStock(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const { id } = idOnly.parse(raw);
  const cfg = await loadConfig(tx, ctx.companyId);
  requireRole(await myRole(tx, ctx), 'store');
  const r = await lockRequest(tx, ctx, id);
  const lines = (await linesOf(tx, id)).filter((l) => l.reserveState === 'reserved' && l.itemId);
  if (lines.length === 0) throw new Error('Nothing reserved to issue');
  for (const l of lines) {
    const [it] = await tx.select().from(procItems).where(eq(procItems.id, l.itemId!)).for('update');
    const onHand = r3(it.onHand - l.reservedQty);
    await tx.update(procItems).set({ onHand, reserved: r3(Math.max(0, it.reserved - l.reservedQty)) }).where(eq(procItems.id, it.id));
    await tx.insert(procMoves).values({ companyId: ctx.companyId, itemId: it.id, type: 'OUT', qty: -l.reservedQty, balanceAfter: onHand, reference: r.number, note: `Issued to ${r.project}`, byId: ctx.membershipId });
    await tx.update(procLines).set({ reserveState: 'issued' }).where(eq(procLines.id, l.id));
  }
  await log(tx, ctx, r, `Stock issued to ${r.project}`);
  return { stage: r.stage === 'stock_issue' ? await advance(tx, ctx, cfg, r) : r.stage };
}

const noteInput = idOnly.extend({ note: z.string().trim().max(1000).optional() });

export async function approve(tx: Tx, ctx: ActionContext, raw: z.input<typeof noteInput>) {
  const input = noteInput.parse(raw);
  const cur = await tx.select({ stage: procRequests.stage }).from(procRequests).where(eq(procRequests.id, input.id));
  const stage = cur[0]?.stage as Stage;
  if (stage !== 'pr_approval' && stage !== 'po_approval') throw new Error('This request is not waiting for approval');
  const { cfg, r, lines, pending } = await begin(tx, ctx, input.id, stage);
  if (!pending) throw new Error('Nothing left to approve');
  await log(tx, ctx, r, `${pending.name} approved (${stageLabel(cfg, stage)})`, { kind: 'approval', levelId: pending.id, note: input.note || null });
  const next = pendingLevel(cfg, stage, await stageValue(tx, r, lines, stage), await approvedLevels(tx, r.id, stage));
  return { stage: next ? stage : await advance(tx, ctx, cfg, r) };
}

export async function reject(tx: Tx, ctx: ActionContext, raw: z.input<typeof noteInput>) {
  const input = noteInput.parse(raw);
  if (!input.note) throw new Error('Give a reason for rejecting');
  const cur = await tx.select({ stage: procRequests.stage }).from(procRequests).where(eq(procRequests.id, input.id));
  const stage = cur[0]?.stage as Stage;
  if (stage !== 'pr_approval' && stage !== 'po_approval') throw new Error('This request is not waiting for approval');
  const { r, lines, pending } = await begin(tx, ctx, input.id, stage);
  await log(tx, ctx, r, `${pending?.name ?? 'Approver'} rejected`, { kind: 'rejection', levelId: pending?.id, note: input.note });
  await releaseReservations(tx, lines);
  await tx.update(procRequests).set({ stage: 'rejected', stageAt: new Date() }).where(eq(procRequests.id, r.id));
  return { stage: 'rejected' as const };
}

async function releaseReservations(tx: Tx, lines: Line[]) {
  for (const l of lines.filter((x) => x.reserveState === 'reserved' && x.itemId)) {
    await tx
      .update(procItems)
      .set({ reserved: sql`greatest(0, ${procItems.reserved} - ${l.reservedQty})` })
      .where(eq(procItems.id, l.itemId!));
    await tx.update(procLines).set({ reserveState: 'released' }).where(eq(procLines.id, l.id));
  }
}

const quoteInput = idOnly.extend({
  supplierId: z.uuid(),
  rates: z.array(z.number().min(0)),
  leadDays: z.number().int().min(0).max(365).nullable(),
  terms: z.string().trim().max(100).nullable(),
});

export async function addQuote(tx: Tx, ctx: ActionContext, raw: z.input<typeof quoteInput>) {
  const input = quoteInput.parse(raw);
  const { cfg, r, lines } = await begin(tx, ctx, input.id, 'rfq');
  if (input.rates.length !== lines.length) throw new Error('Enter a rate for every line');
  if (lines.some((l, i) => buyOf(l) > 0 && !(input.rates[i] > 0))) throw new Error('Enter a rate for every line being bought');
  const [s] = await tx.select({ name: procSuppliers.name }).from(procSuppliers).where(and(eq(procSuppliers.id, input.supplierId), eq(procSuppliers.companyId, ctx.companyId)));
  if (!s) throw new Error('Supplier not found');
  await tx.insert(procQuotes).values({ companyId: ctx.companyId, requestId: r.id, supplierId: input.supplierId, rates: input.rates, leadDays: input.leadDays, terms: input.terms, byId: ctx.membershipId });
  await log(tx, ctx, r, `Quote received from ${s.name}: ${moneyText(cfg, quoteValue(lines, input.rates))}`);
  return { ok: true as const };
}

export async function award(tx: Tx, ctx: ActionContext, raw: { id: string; quoteId: string }) {
  const input = idOnly.extend({ quoteId: z.uuid() }).parse(raw);
  const { cfg, r, lines } = await begin(tx, ctx, input.id, 'rfq');
  const quotes = await tx
    .select({ id: procQuotes.id, rates: procQuotes.rates, supplier: procSuppliers.name })
    .from(procQuotes)
    .innerJoin(procSuppliers, eq(procSuppliers.id, procQuotes.supplierId))
    .where(eq(procQuotes.requestId, r.id));
  if (quotes.length < cfg.minQuotes) throw new Error(`Collect at least ${cfg.minQuotes} quotes before awarding`);
  const q = quotes.find((x) => x.id === input.quoteId);
  if (!q) throw new Error('Quote not found');
  await tx.update(procRequests).set({ awardQuoteId: q.id }).where(eq(procRequests.id, r.id));
  await log(tx, ctx, r, `Awarded to ${q.supplier}: ${moneyText(cfg, quoteValue(lines, q.rates))} before ${cfg.money.taxName}`);
  return { stage: await advance(tx, ctx, cfg, { ...r, awardQuoteId: q.id }) };
}

export async function issuePo(tx: Tx, ctx: ActionContext, raw: { id: string; checks: string[] }) {
  const input = idOnly.extend({ checks: z.array(z.string()) }).parse(raw);
  const { cfg, r } = await begin(tx, ctx, input.id, 'issue');
  for (const o of cfg.options.filter((x) => x.on && x.issueCheck)) if (!input.checks.includes(o.id)) throw new Error(`Confirm: ${o.issueCheck}`);
  const poNo = await nextNumber(tx, ctx.companyId, 'po', cfg);
  await tx.update(procRequests).set({ poNo, poDate: today(ctx) }).where(eq(procRequests.id, r.id));
  const [q] = r.awardQuoteId
    ? await tx.select({ supplier: procSuppliers.name }).from(procQuotes).innerJoin(procSuppliers, eq(procSuppliers.id, procQuotes.supplierId)).where(eq(procQuotes.id, r.awardQuoteId))
    : [];
  await log(tx, ctx, r, `Purchase order ${poNo} issued to ${q?.supplier ?? 'supplier'}`);
  return { poNo, stage: await advance(tx, ctx, cfg, r) };
}

const receiveInput = idOnly.extend({
  deliveryNote: z.string().trim().min(1, 'Enter the delivery note number').max(80),
  condition: z.enum(['Good', 'Damaged', 'Short']),
  docsOk: z.boolean(),
  extra: z.record(z.string(), fieldValue),
  qty: z.array(z.number().min(0)),
  intoStock: z.boolean(),
});

export async function receive(tx: Tx, ctx: ActionContext, raw: z.input<typeof receiveInput>) {
  const input = receiveInput.parse(raw);
  const { cfg, r, lines } = await begin(tx, ctx, input.id, 'receiving');
  if (input.qty.length !== lines.length || input.qty.every((q) => q <= 0)) throw new Error('Enter the quantity received');
  if (cfg.options.some((o) => o.on && o.docsRequired) && !input.docsOk) throw new Error('Confirm the required documents were received');
  const rates = await awardedRates(tx, r, lines);
  await tx.insert(procReceipts).values({ companyId: ctx.companyId, requestId: r.id, deliveryNote: input.deliveryNote, condition: input.condition, docsOk: input.docsOk, extra: input.extra, qty: input.qty, intoStock: input.intoStock, byId: ctx.membershipId });
  let booked = 0;
  if (input.intoStock) {
    for (const [i, l] of lines.entries()) {
      if (!l.itemId || !(input.qty[i] > 0)) continue;
      const [it] = await tx.select().from(procItems).where(eq(procItems.id, l.itemId)).for('update');
      const onHand = r3(it.onHand + input.qty[i]);
      const avg = onHand > 0 ? r2((it.onHand * it.avgCost + input.qty[i] * (rates[i] ?? it.avgCost)) / onHand) : it.avgCost;
      await tx.update(procItems).set({ onHand, avgCost: avg }).where(eq(procItems.id, it.id));
      await tx.insert(procMoves).values({ companyId: ctx.companyId, itemId: it.id, type: 'IN', qty: input.qty[i], balanceAfter: onHand, reference: r.poNo ?? r.number, note: `GRN ${input.deliveryNote}`, byId: ctx.membershipId });
      booked++;
    }
  }
  await log(tx, ctx, r, `Goods received on ${input.deliveryNote} (${input.condition.toLowerCase()})${booked ? `, ${booked} line${booked === 1 ? '' : 's'} booked into stock` : ''}`);
  const all = await tx.select({ qty: procReceipts.qty }).from(procReceipts).where(eq(procReceipts.requestId, r.id));
  if (fullyReceived(lines, receivedQty(lines.length, all))) return { stage: await advance(tx, ctx, cfg, r) };
  await tx.insert(procEvents).values({ companyId: ctx.companyId, requestId: r.id, kind: 'log', stage: r.stage, text: 'Partial delivery, balance outstanding' });
  return { stage: r.stage };
}

const inspectInput = idOnly.extend({ result: z.enum(['Pass', 'Conditional', 'Fail']), note: z.string().trim().max(1000), checks: z.array(z.string()) });

export async function inspect(tx: Tx, ctx: ActionContext, raw: z.input<typeof inspectInput>) {
  const input = inspectInput.parse(raw);
  const { cfg, r } = await begin(tx, ctx, input.id, 'inspection');
  if (input.result !== 'Fail') for (const o of cfg.options.filter((x) => x.on && x.qcCheck)) if (!input.checks.includes(o.id)) throw new Error(`Confirm: ${o.qcCheck}`);
  if (input.result !== 'Pass' && !input.note) throw new Error('Add a note for a conditional or failed inspection');
  await log(tx, ctx, r, `Inspection ${input.result.toLowerCase()}`, { kind: 'inspection', result: input.result, note: input.note || null });
  if (input.result === 'Fail') {
    await tx.insert(procEvents).values({ companyId: ctx.companyId, requestId: r.id, kind: 'log', stage: r.stage, text: 'Non-conformance raised; supplier to rectify' });
    return { stage: r.stage };
  }
  return { stage: await advance(tx, ctx, cfg, r) };
}

const invoiceInput = idOnly.extend({ no: z.string().trim().min(1, 'Enter the invoice number').max(60), amount: z.number().positive('Enter the invoice amount'), override: z.boolean() });

export async function matchInvoice(tx: Tx, ctx: ActionContext, raw: z.input<typeof invoiceInput>) {
  const input = invoiceInput.parse(raw);
  const { cfg, r, lines } = await begin(tx, ctx, input.id, 'invoice');
  const all = await tx.select({ qty: procReceipts.qty }).from(procReceipts).where(eq(procReceipts.requestId, r.id));
  const expected = expectedInvoice(cfg, lines, await awardedRates(tx, r, lines), receivedQty(lines.length, all));
  const pct = variancePct(input.amount, expected);
  if (!withinTolerance(cfg, pct) && !input.override) throw new Error(`Invoice is ${pct.toFixed(1)}% off the expected ${moneyText(cfg, expected)}. Tick "approve the difference" to accept it.`);
  await tx.update(procRequests).set({ invoice: { no: input.no, amount: input.amount, expected, variancePct: pct, override: input.override && !withinTolerance(cfg, pct) } }).where(eq(procRequests.id, r.id));
  await log(tx, ctx, r, withinTolerance(cfg, pct) ? `Invoice ${input.no} matched to PO and receipt` : `Invoice ${input.no} approved with ${pct.toFixed(1)}% difference`);
  return { stage: await advance(tx, ctx, cfg, r) };
}

/** Requests waiting for this person's role, oldest first. */
export async function myQueue(tx: Tx, ctx: SessionContext) {
  const rows = await listRequests(tx, ctx, { filter: 'action' });
  return rows.sort((a, b) => b.daysInStage - a.daysInStage);
}

export async function countMyQueue(tx: Tx, ctx: SessionContext) {
  try {
    return await tx.transaction(async (sp) => (await myQueue(sp, ctx)).length);
  } catch {
    return 0;
  }
}

export const ROLE_TEXT = (r: ProcRole) => roleLabel(r);
