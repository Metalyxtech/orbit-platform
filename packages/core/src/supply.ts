import { and, eq } from 'drizzle-orm';
import { companyPortals, type Tx } from '@orbit/db';
import type { ActionContext } from './session';

// The contract between Production (which needs material) and Purchase (which buys it or issues it
// from the main store). Production calls raisePurchase() once the production manager approves a
// material request; Purchase reports back through notifySupply() when it issues stock, receives
// the goods or rejects the request. The app connects the two in supply-bridge.ts; no portal
// imports another.

export const PURCHASE_PORTAL = 'procurement';
export type SupplySource = 'production';

export interface SupplyLine {
  description: string;
  qty: number;
  unit: string;
}

export interface SupplyRequest {
  source: SupplySource;
  sourceId: string;
  /** MR number shown in Purchase. */
  sourceRef: string;
  /** Work order the material is for. */
  workOrder: string;
  title: string;
  project: string;
  needBy: string;
  priority: 'Normal' | 'Urgent';
  note?: string | null;
  lines: SupplyLine[];
}

export interface SupplyUpdate {
  source: SupplySource;
  sourceId: string;
  /** issued: from the main store; received: goods accepted (after QC when used); rejected. */
  kind: 'issued' | 'received' | 'rejected' | 'po';
  /** Purchase request / PO number. */
  ref: string;
  /** Quantity per line of the original request, in order. */
  qty: number[];
  /** Where the goods were received (receipts). */
  receivedAt?: 'purchase' | 'production';
  note?: string | null;
}

/** A delivery recorded by the production store against the purchase raised for a material request. */
export interface SupplyDelivery {
  purchaseId: string;
  deliveryNote: string;
  condition: 'Good' | 'Damaged' | 'Short';
  docsOk: boolean;
  qty: number[];
}

/** True when the company uses the Purchase portal. */
export async function purchaseOn(tx: Tx, companyId: string) {
  const [r] = await tx
    .select({ enabled: companyPortals.enabled })
    .from(companyPortals)
    .where(and(eq(companyPortals.companyId, companyId), eq(companyPortals.portal, PURCHASE_PORTAL)));
  return r?.enabled === true;
}

type Raiser = (tx: Tx, ctx: ActionContext, req: SupplyRequest) => Promise<{ id: string; number: string }>;
type Deliverer = (tx: Tx, ctx: ActionContext, d: SupplyDelivery) => Promise<{ ref: string }>;
type Listener = (tx: Tx, ctx: ActionContext, u: SupplyUpdate) => Promise<void>;
type Status = (tx: Tx, companyId: string, purchaseId: string) => Promise<{ number: string; stage: string; stageLabel: string; poNo: string | null; receiving: boolean; lines: SupplyLine[] } | null>;

// Kept on globalThis so every bundle that loads this module shares one registry.
const KEY = Symbol.for('orbit.supply.registry');
const reg = ((globalThis as Record<symbol, unknown>)[KEY] ??= { listeners: new Map<SupplySource, Listener>() }) as {
  raiser?: Raiser;
  deliverer?: Deliverer;
  status?: Status;
  listeners: Map<SupplySource, Listener>;
};

/** Purchase registers how it takes requests, deliveries and status questions. */
export function servePurchase(h: { raise: Raiser; deliver: Deliverer; status: Status }) {
  reg.raiser = h.raise;
  reg.deliverer = h.deliver;
  reg.status = h.status;
}
/** A source portal says what happens when Purchase reports progress. */
export function onSupplyUpdate(source: SupplySource, listener: Listener) {
  reg.listeners.set(source, listener);
}

const unreachable = () => new Error('Orbit cannot reach the Purchase portal right now. Try again in a moment.');

/** Sends approved material to Purchase. Returns the purchase request created there. */
export async function raisePurchase(tx: Tx, ctx: ActionContext, req: SupplyRequest) {
  if (!(await purchaseOn(tx, ctx.companyId))) throw new Error('Your company does not use the Purchase portal. Switch it on in Company portals, or receive the material directly in the production store.');
  if (!reg.raiser) throw unreachable();
  return reg.raiser(tx, ctx, req);
}

/** The production store records a delivery of goods bought for its request. */
export async function deliverToProduction(tx: Tx, ctx: ActionContext, d: SupplyDelivery) {
  if (!reg.deliverer) throw unreachable();
  return reg.deliverer(tx, ctx, d);
}

/** Where a purchase raised for production stands (null when unknown). */
export async function purchaseStatus(tx: Tx, companyId: string, purchaseId: string) {
  if (!reg.status) return null;
  try {
    return await reg.status(tx, companyId, purchaseId);
  } catch {
    return null;
  }
}

/** Called by Purchase inside its own transaction. */
export async function notifySupply(tx: Tx, ctx: ActionContext, u: SupplyUpdate) {
  const l = reg.listeners.get(u.source);
  if (!l) throw new Error(`Orbit cannot reach the ${u.source} portal right now. Try again in a moment.`);
  await l(tx, ctx, u);
}
