import { and, eq, gte } from 'drizzle-orm';
import type { SessionContext } from '@orbit/core';
import { salesCustomers, salesEnquiries, salesInvoices, salesOrders, salesPayments, type Tx } from '@orbit/db';
import { today } from './shared';

// Sales for the GM: six months of enquiries, orders and money, where enquiries come from, how
// they end, the biggest customers and what is still to collect.

const DAY = 86_400_000;

export async function managementCharts(tx: Tx, ctx: SessionContext) {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const [enq, orders, invoices, payments] = await Promise.all([
    tx.select({ stage: salesEnquiries.stage, source: salesEnquiries.source, lostReason: salesEnquiries.lostReason, createdAt: salesEnquiries.createdAt }).from(salesEnquiries).where(and(eq(salesEnquiries.companyId, ctx.companyId), gte(salesEnquiries.createdAt, first))),
    tx.select({ value: salesOrders.value, createdAt: salesOrders.createdAt, customer: salesCustomers.name }).from(salesOrders).innerJoin(salesCustomers, eq(salesCustomers.id, salesOrders.customerId)).where(and(eq(salesOrders.companyId, ctx.companyId), gte(salesOrders.createdAt, first))),
    tx.select({ amount: salesInvoices.amount, paid: salesInvoices.paid, issued: salesInvoices.issued, due: salesInvoices.due }).from(salesInvoices).where(eq(salesInvoices.companyId, ctx.companyId)),
    tx.select({ amount: salesPayments.amount, createdAt: salesPayments.createdAt }).from(salesPayments).where(and(eq(salesPayments.companyId, ctx.companyId), gte(salesPayments.createdAt, first))),
  ]);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) };
  });
  const inMonth = (d: Date | string, key: string) => (typeof d === 'string' ? d : d.toISOString()).slice(0, 7) === key;
  const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);
  const tally = (keys: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k || 'Not recorded', (m.get(k || 'Not recorded') ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const byCustomer = new Map<string, number>();
  for (const o of orders) byCustomer.set(o.customer, (byCustomer.get(o.customer) ?? 0) + o.value);
  const t0 = today();
  const ageing = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const i of invoices) {
    const bal = i.amount - i.paid;
    if (bal <= 0.5) continue;
    const late = i.due < t0 ? Math.round((Date.parse(t0) - Date.parse(i.due)) / DAY) : 0;
    if (!late) ageing.current += bal;
    else if (late <= 30) ageing.d30 += bal;
    else if (late <= 60) ageing.d60 += bal;
    else ageing.d90 += bal;
  }
  const won = enq.filter((e) => e.stage === 'won').length;
  const lost = enq.filter((e) => e.stage === 'lost').length;
  const cur = months[5].key;
  const prev = months[4].key;
  return {
    months: months.map((m) => ({
      label: m.label,
      enquiries: enq.filter((e) => inMonth(e.createdAt, m.key)).length,
      orders: orders.filter((o) => inMonth(o.createdAt, m.key)).length,
      orderValue: sum(orders.filter((o) => inMonth(o.createdAt, m.key)), (o) => o.value),
      invoiced: sum(invoices.filter((i) => inMonth(i.issued, m.key)), (i) => i.amount),
      collected: sum(payments.filter((p) => inMonth(p.createdAt, m.key)), (p) => p.amount),
    })),
    now: { enquiries: enq.filter((e) => inMonth(e.createdAt, cur)).length, orderValue: sum(orders.filter((o) => inMonth(o.createdAt, cur)), (o) => o.value), collected: sum(payments.filter((p) => inMonth(p.createdAt, cur)), (p) => p.amount) },
    before: { enquiries: enq.filter((e) => inMonth(e.createdAt, prev)).length, orderValue: sum(orders.filter((o) => inMonth(o.createdAt, prev)), (o) => o.value), collected: sum(payments.filter((p) => inMonth(p.createdAt, prev)), (p) => p.amount) },
    outcome: { won, lost, open: enq.length - won - lost, winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null },
    bySource: tally(enq.map((e) => e.source)),
    lostReasons: tally(enq.filter((e) => e.stage === 'lost').map((e) => e.lostReason)),
    topCustomers: [...byCustomer.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    ageing,
    outstanding: ageing.current + ageing.d30 + ageing.d60 + ageing.d90,
  };
}
