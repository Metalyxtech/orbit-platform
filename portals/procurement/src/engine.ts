// Purchase workflow engine: pure functions, no database. The server uses these to decide the next
// stage, who must act and what the money adds up to; the tests cover them.
import { ORDER, STAGE_HELPERS, STAGES, type ApprovalLevel, type ProcConfig, type ProcRole, type Stage, type StageKey } from './config';

export const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const r2 = (v: number) => Math.round(v * 100) / 100;

export interface EngineLine {
  qty: number;
  buyQty: number | null;
  estRate: number;
}

/** What still has to be bought on a line (all of it until the stock check runs). */
export const buyOf = (l: EngineLine) => (l.buyQty == null ? l.qty : l.buyQty);

/** Stages this company uses, in order (optional stages can be switched off). */
export function flowOf(cfg: ProcConfig): Stage[] {
  return ORDER.filter((k) => k === 'draft' || k === 'closed' || !STAGES[k as StageKey].optional || cfg.flow[k as keyof ProcConfig['flow']]);
}

/** The stage after `current`. After a stock check that covered every line, the request goes to stock_issue. */
export function nextStage(cfg: ProcConfig, current: Stage, lines: EngineLine[]): Stage {
  if (current === 'stock_issue') return 'closed';
  if (current === 'stock_check' && lines.every((l) => buyOf(l) <= 0)) return 'stock_issue';
  const flow = flowOf(cfg);
  const i = ORDER.indexOf(current);
  for (let j = i + 1; j < ORDER.length; j++) if (flow.includes(ORDER[j])) return ORDER[j];
  return 'closed';
}

export const estValue = (lines: EngineLine[]) => r2(lines.reduce((t, l) => t + buyOf(l) * l.estRate, 0));
export const quoteValue = (lines: EngineLine[], rates: number[]) => r2(lines.reduce((t, l, i) => t + buyOf(l) * (rates[i] ?? 0), 0));
export const taxOf = (cfg: ProcConfig, v: number) => r2((v * (cfg.money.taxRate || 0)) / 100);

/** Approval levels that apply to a value, lowest threshold first. */
export function chainFor(cfg: ProcConfig, kind: 'pr' | 'po', value: number): ApprovalLevel[] {
  return cfg.levels.filter((l) => l[kind] && value >= (l.min || 0)).sort((a, b) => a.min - b.min);
}

/** The next level that still has to approve, or null when all have. */
export function pendingLevel(cfg: ProcConfig, stage: Stage, value: number, approvedLevelIds: string[]): ApprovalLevel | null {
  if (stage !== 'pr_approval' && stage !== 'po_approval') return null;
  return chainFor(cfg, stage === 'pr_approval' ? 'pr' : 'po', value).find((l) => !approvedLevelIds.includes(l.id)) ?? null;
}

/** The portal role that acts on the request now (null when nobody needs to). */
export function ownerRole(cfg: ProcConfig, stage: Stage, pending: ApprovalLevel | null): ProcRole | null {
  if (stage === 'draft' || stage === 'closed' || stage === 'rejected') return null;
  if (stage === 'pr_approval' || stage === 'po_approval') return pending?.role ?? null;
  // Inspection is done in the Quality portal, not by a Purchase role.
  if (stage === 'inspection') return null;
  const role = cfg.stageCfg[stage]?.role ?? STAGES[stage].role;
  return role === 'approval' ? null : role;
}

/**
 * A person acts on a step when their role owns it, when they cover that role (admins standing in),
 * or when their role helps on that stage (the store keeper at the stock check).
 */
export const canAct = (roles: ProcRole[], owner: ProcRole | null, stage?: Stage) =>
  owner != null && (roles.includes(owner) || (stage != null && stage in STAGE_HELPERS && (STAGE_HELPERS[stage as StageKey] ?? []).some((r) => roles.includes(r))));

/** Received quantity per line across all receipts. */
export const receivedQty = (lineCount: number, receipts: { qty: number[] }[]) =>
  Array.from({ length: lineCount }, (_, i) => r3(receipts.reduce((t, g) => t + (Number(g.qty[i]) || 0), 0)));

export const fullyReceived = (lines: EngineLine[], received: number[]) => lines.every((l, i) => buyOf(l) <= 0 || received[i] >= buyOf(l) - 1e-9);

/** Value received so far at the awarded rates. */
export const receivedValue = (lines: EngineLine[], rates: number[], received: number[]) =>
  r2(lines.reduce((t, l, i) => t + Math.min(received[i] ?? 0, buyOf(l)) * (rates[i] ?? 0), 0));

/** Invoice amount expected (incl. tax): received value when receipts are used, else the PO value. */
export function expectedInvoice(cfg: ProcConfig, lines: EngineLine[], rates: number[], received: number[]) {
  const v = cfg.flow.receiving ? receivedValue(lines, rates, received) : quoteValue(lines, rates);
  return r2(v + taxOf(cfg, v));
}

export const variancePct = (amount: number, expected: number) => (expected ? r2(((amount - expected) / expected) * 100) : 0);
export const withinTolerance = (cfg: ProcConfig, pct: number) => Math.abs(pct) <= (cfg.money.tolerance || 0) + 1e-9;
