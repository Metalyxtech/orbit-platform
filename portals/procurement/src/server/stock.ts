import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { procItems, procMoves, type Tx } from '@orbit/db';
import { r2, r3 } from '../engine';
import { myRole, peopleById, requireRole } from './shared';

export async function listItems(tx: Tx, ctx: SessionContext) {
  const rows = await tx.select().from(procItems).where(and(eq(procItems.companyId, ctx.companyId), eq(procItems.active, true))).orderBy(asc(procItems.code));
  return rows.map((i) => {
    const available = r3(i.onHand - i.reserved);
    return {
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      unit: i.unit,
      onHand: i.onHand,
      reserved: i.reserved,
      available,
      reorderLevel: i.reorderLevel,
      location: i.location,
      avgCost: i.avgCost,
      value: r2(i.onHand * i.avgCost),
      state: available <= 0 ? ('out' as const) : available <= i.reorderLevel ? ('low' as const) : ('ok' as const),
    };
  });
}
export type StockItemRow = Awaited<ReturnType<typeof listItems>>[number];

const itemInput = z.object({
  code: z.string().trim().min(1, 'Enter an item code').max(40).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'Enter the item name').max(200),
  category: z.string().trim().max(60).default('General'),
  unit: z.string().trim().min(1).max(20),
  reorderLevel: z.number().min(0),
  location: z.string().trim().max(60).nullable(),
  avgCost: z.number().min(0),
});

export async function addItem(tx: Tx, ctx: ActionContext, raw: z.input<typeof itemInput>) {
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const input = itemInput.parse(raw);
  const [clash] = await tx.select({ id: procItems.id }).from(procItems).where(and(eq(procItems.companyId, ctx.companyId), eq(procItems.code, input.code)));
  if (clash) throw new Error(`Item code ${input.code} is already used`);
  const [row] = await tx.insert(procItems).values({ companyId: ctx.companyId, ...input, category: input.category || 'General' }).returning({ id: procItems.id });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'procurement.item.add', entity: 'proc_items', entityId: row.id, data: { code: input.code }, requestId: ctx.requestId });
  return row;
}

const entryInput = z.object({
  itemId: z.uuid(),
  type: z.enum(['IN', 'OUT', 'RET', 'ADJ']),
  qty: z.number().refine((v) => v !== 0, 'Enter a quantity'),
  rate: z.number().min(0).nullable(),
  reference: z.string().trim().max(80).nullable(),
  note: z.string().trim().max(300).nullable(),
});

/** Stock entry: receipt (IN), issue (OUT), return (RET) or adjustment (ADJ, signed). */
export async function stockEntry(tx: Tx, ctx: ActionContext, raw: z.input<typeof entryInput>) {
  requireRole(await myRole(tx, ctx), 'store');
  const input = entryInput.parse(raw);
  const [it] = await tx.select().from(procItems).where(and(eq(procItems.id, input.itemId), eq(procItems.companyId, ctx.companyId))).for('update');
  if (!it) throw new Error('Item not found');
  const delta = input.type === 'OUT' ? -Math.abs(input.qty) : input.type === 'ADJ' ? input.qty : Math.abs(input.qty);
  const onHand = r3(it.onHand + delta);
  if (onHand < 0) throw new Error(`Only ${it.onHand} ${it.unit} on hand`);
  if (input.type === 'OUT' && it.onHand - it.reserved < Math.abs(delta) - 1e-9) throw new Error(`Only ${r3(it.onHand - it.reserved)} ${it.unit} free; the rest is reserved for requests`);
  const avg = delta > 0 && input.rate != null && onHand > 0 ? r2((it.onHand * it.avgCost + delta * input.rate) / onHand) : it.avgCost;
  await tx.update(procItems).set({ onHand, avgCost: avg }).where(eq(procItems.id, it.id));
  await tx.insert(procMoves).values({ companyId: ctx.companyId, itemId: it.id, type: input.type, qty: delta, balanceAfter: onHand, reference: input.reference, note: input.note, byId: ctx.membershipId });
  return { onHand };
}

export async function ledger(tx: Tx, ctx: SessionContext, opts: { itemId?: string } = {}) {
  const where = opts.itemId ? and(eq(procMoves.companyId, ctx.companyId), eq(procMoves.itemId, opts.itemId)) : eq(procMoves.companyId, ctx.companyId);
  const rows = await tx
    .select({ m: procMoves, code: procItems.code, name: procItems.name, unit: procItems.unit })
    .from(procMoves)
    .innerJoin(procItems, eq(procItems.id, procMoves.itemId))
    .where(where)
    .orderBy(desc(procMoves.createdAt))
    .limit(300);
  const people = await peopleById(tx, rows.map((r) => r.m.byId));
  return rows.map(({ m, code, name, unit }) => ({
    id: m.id,
    at: m.createdAt.toISOString(),
    code,
    name,
    unit,
    type: m.type,
    qty: m.qty,
    balance: m.balanceAfter,
    reference: m.reference,
    note: m.note,
    by: m.byId ? (people.get(m.byId)?.name ?? '') : '',
  }));
}
