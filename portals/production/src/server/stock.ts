import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { prodStock, prodStockMoves, type Tx } from '@orbit/db';
import { fmtQty } from '../config';
import { myRole, requireRole } from './shared';

// Production store stock: what is physically in the shop-floor store, per item name and unit.
// Material comes IN from the main store (Purchase), purchases delivered to the shop floor and
// direct receipts; it goes OUT when the store issues it to a work order.

export const r3 = (v: number) => Math.round(v * 1000) / 1000;
const key = (name: string, unit: string) => `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;

/** Finds (and locks) the stock row for an item, creating it when asked. */
async function stockRow(tx: Tx, companyId: string, name: string, unit: string, create: boolean) {
  const [row] = await tx
    .select()
    .from(prodStock)
    .where(and(eq(prodStock.companyId, companyId), sql`lower(${prodStock.name}) = lower(${name.trim()})`, sql`lower(${prodStock.unit}) = lower(${unit.trim()})`))
    .for('update');
  if (row || !create) return row ?? null;
  const [made] = await tx.insert(prodStock).values({ companyId, name: name.trim(), unit: unit.trim() }).returning();
  return made;
}

/** Books material into the production store. */
export async function stockIn(tx: Tx, ctx: ActionContext, lines: { item: string; qty: number; unit: string }[], reference: string, note?: string | null) {
  for (const l of lines.filter((x) => x.qty > 0)) {
    const row = (await stockRow(tx, ctx.companyId, l.item, l.unit, true))!;
    const onHand = r3(row.onHand + l.qty);
    await tx.update(prodStock).set({ onHand }).where(eq(prodStock.id, row.id));
    await tx.insert(prodStockMoves).values({ companyId: ctx.companyId, stockId: row.id, type: 'IN', qty: l.qty, balanceAfter: onHand, reference, note: note ?? null, byId: ctx.membershipId });
  }
}

/** Takes material out of the production store (issue to a work order). Throws when there is not enough. */
export async function stockOut(tx: Tx, ctx: ActionContext, l: { item: string; qty: number; unit: string }, reference: string, note?: string | null) {
  const row = await stockRow(tx, ctx.companyId, l.item, l.unit, false);
  const have = row?.onHand ?? 0;
  if (!row || have < l.qty - 1e-9) throw new Error(`${l.item}: only ${fmtQty(have)} ${l.unit} in the production store. Issue what is there and request the rest.`);
  const onHand = r3(have - l.qty);
  await tx.update(prodStock).set({ onHand }).where(eq(prodStock.id, row.id));
  await tx.insert(prodStockMoves).values({ companyId: ctx.companyId, stockId: row.id, type: 'OUT', qty: -l.qty, balanceAfter: onHand, reference, note: note ?? null, byId: ctx.membershipId });
}

/** On-hand quantity per item|unit key, for the store's "available" column. */
export async function availability(tx: Tx, companyId: string) {
  const rows = await tx.select({ name: prodStock.name, unit: prodStock.unit, onHand: prodStock.onHand }).from(prodStock).where(eq(prodStock.companyId, companyId));
  const map = new Map(rows.map((r) => [key(r.name, r.unit), r.onHand]));
  return (item: string, unit: string) => map.get(key(item, unit)) ?? 0;
}

export async function stockList(tx: Tx, ctx: SessionContext) {
  const items = await tx.select().from(prodStock).where(eq(prodStock.companyId, ctx.companyId)).orderBy(prodStock.name);
  const moves = await tx
    .select({ m: prodStockMoves, item: prodStock.name, unit: prodStock.unit })
    .from(prodStockMoves)
    .innerJoin(prodStock, eq(prodStock.id, prodStockMoves.stockId))
    .where(eq(prodStockMoves.companyId, ctx.companyId))
    .orderBy(desc(prodStockMoves.createdAt))
    .limit(60);
  return {
    items: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, onHand: i.onHand, location: i.location })),
    moves: moves.map(({ m, item, unit }) => ({ id: m.id, item, unit, type: m.type, qty: m.qty, balanceAfter: m.balanceAfter, reference: m.reference, note: m.note, at: m.createdAt.toISOString() })),
  };
}

const adjustInput = z.object({
  item: z.string().trim().min(1, 'Enter the item').max(200),
  unit: z.string().trim().min(1, 'Enter the unit').max(20),
  /** Positive adds (opening stock, found), negative removes (damaged, counted short). */
  qty: z.number().refine((v) => v !== 0, 'Enter a quantity'),
  note: z.string().trim().min(2, 'Say why (e.g. opening stock, stock count)').max(300),
});

/** Opening stock and stock-count corrections by the production store keeper or manager. */
export async function adjustStock(tx: Tx, ctx: ActionContext, raw: z.input<typeof adjustInput>) {
  const v = adjustInput.parse(raw);
  requireRole(await myRole(tx, ctx), 'store', 'manager');
  const row = (await stockRow(tx, ctx.companyId, v.item, v.unit, v.qty > 0))!;
  if (!row) throw new Error(`${v.item} is not in the production store`);
  const onHand = r3(row.onHand + v.qty);
  if (onHand < -1e-9) throw new Error(`${v.item}: only ${fmtQty(row.onHand)} ${row.unit} in stock`);
  await tx.update(prodStock).set({ onHand }).where(eq(prodStock.id, row.id));
  await tx.insert(prodStockMoves).values({ companyId: ctx.companyId, stockId: row.id, type: 'ADJ', qty: v.qty, balanceAfter: onHand, reference: 'Adjustment', note: v.note, byId: ctx.membershipId });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'production.stock.adjust', entity: 'prod_stock', entityId: row.id, data: { summary: [`Production store: ${row.name} ${v.qty > 0 ? '+' : ''}${fmtQty(v.qty)} ${row.unit} (${v.note})`] }, requestId: ctx.requestId });
  return { ok: true as const };
}
