import { describe, expect, it } from 'vitest';
import { configFromTemplate, originOf, withoutViewOnly } from '../src/config';
import { canAct, chainFor, estValue, expectedInvoice, fullyReceived, nextStage, ownerRole, pendingLevel, receivedQty, variancePct, withinTolerance } from '../src/engine';

const cfg = configFromTemplate('fab');
const lines = [
  { qty: 10, buyQty: null, estRate: 100 },
  { qty: 5, buyQty: null, estRate: 20 },
];

describe('purchase workflow', () => {
  it('walks the enabled stages in order', () => {
    expect(nextStage(cfg, 'draft', lines)).toBe('stock_check');
    expect(nextStage(cfg, 'pr_approval', lines)).toBe('rfq');
    expect(nextStage(cfg, 'invoice', lines)).toBe('closed');
  });

  it('skips stages the company switched off', () => {
    const c = configFromTemplate('fab');
    c.flow.stock_check = false;
    c.flow.pr_approval = false;
    expect(nextStage(c, 'draft', lines)).toBe('rfq');
  });

  it('branches to issue-from-stock when stock covers everything', () => {
    const covered = lines.map((l) => ({ ...l, buyQty: 0 }));
    expect(nextStage(cfg, 'stock_check', covered)).toBe('stock_issue');
    expect(nextStage(cfg, 'stock_issue', covered)).toBe('closed');
  });

  it('values only what is bought', () => {
    expect(estValue(lines)).toBe(1100);
    expect(estValue([{ qty: 10, buyQty: 4, estRate: 100 }])).toBe(400);
  });

  // A company can add a second level (another manager) for big POs; the GM never approves.
  const two = { ...cfg, levels: [...cfg.levels, { id: 'l2', name: 'Senior purchase manager', role: 'manager' as const, min: 50000, pr: false, po: true }] };

  it('builds the approval chain from value thresholds', () => {
    expect(cfg.levels.map((l) => l.role)).toEqual(['manager']);
    expect(chainFor(two, 'po', 1000).map((l) => l.id)).toEqual(['l1']);
    expect(chainFor(two, 'po', 60000).map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(chainFor(two, 'pr', 60000).map((l) => l.id)).toEqual(['l1']);
    expect(pendingLevel(two, 'po_approval', 60000, ['l1'])?.id).toBe('l2');
    expect(pendingLevel(two, 'po_approval', 60000, ['l1', 'l2'])).toBeNull();
  });

  it('drops GM approval levels saved before the GM became view-only', () => {
    const old = { ...cfg, levels: [...cfg.levels, { id: 'g', name: 'General manager', role: 'gm' as const, min: 50000, pr: false, po: true }], stageCfg: { rfq: { role: 'gm' as const } } };
    const fixed = withoutViewOnly(old);
    expect(fixed.levels.map((l) => l.role)).toEqual(['manager']);
    expect(ownerRole(fixed, 'rfq', null)).toBe('buyer');
  });

  it('knows who acts', () => {
    expect(ownerRole(cfg, 'rfq', null)).toBe('buyer');
    expect(ownerRole(cfg, 'receiving', null)).toBe('store');
    expect(ownerRole(two, 'po_approval', two.levels[1])).toBe('manager');
    expect(canAct(['buyer'], 'buyer')).toBe(true);
    expect(canAct(['store'], 'buyer')).toBe(false);
    // An admin acts only on the roles they cover, not on every step.
    expect(canAct(['admin'], 'qc')).toBe(false);
    expect(canAct(['admin', 'qc'], 'qc')).toBe(true);
  });

  it('tracks partial receipts and the invoice match', () => {
    const rec = receivedQty(2, [{ qty: [6, 5] }, { qty: [4, 0] }]);
    expect(rec).toEqual([10, 5]);
    expect(fullyReceived(lines, rec)).toBe(true);
    expect(fullyReceived(lines, [9, 5])).toBe(false);
    const exp = expectedInvoice(cfg, lines, [100, 20], rec);
    expect(exp).toBe(1210);
    expect(withinTolerance(cfg, variancePct(1230, exp))).toBe(true);
    expect(withinTolerance(cfg, variancePct(1300, exp))).toBe(false);
  });
});

describe('stock check helpers and production requests', () => {
  it('lets the purchase store keeper act at the stock check, but not on other buyer steps', () => {
    expect(canAct(['store'], 'buyer', 'stock_check')).toBe(true);
    expect(canAct(['store'], 'buyer', 'rfq')).toBe(false);
    expect(canAct(['buyer'], 'buyer', 'rfq')).toBe(true);
    expect(canAct(['store'], null, 'stock_check')).toBe(false);
  });
  it('reads the production origin from the request header', () => {
    expect(originOf({ _from: { portal: 'production', id: 'x', ref: 'MR-0001', workOrder: 'WO-1' } })?.ref).toBe('MR-0001');
    expect(originOf({ dept: 'Ops' })).toBeNull();
    expect(originOf(null)).toBeNull();
  });
});
