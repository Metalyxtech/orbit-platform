import { and, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import { splitTax, type AcctDoc, type AcctDocFilter } from '@orbit/core/accounting';
import { procQuotes, procRequests, procSuppliers, type Tx } from '@orbit/db';
import { loadConfig } from './shared';

// Supplier bills in the shape the accounting connections send (@orbit/core/accounting): every
// purchase whose supplier invoice was matched to the PO. The invoice amount includes the
// company's purchase tax, so it is split back into value and tax.

type Invoice = { no: string; amount: number; date?: string };
const BILL_DUE_DAYS = 30;
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export async function purchaseBillDocs(tx: Tx, companyId: string, f: AcctDocFilter): Promise<AcctDoc[]> {
  const cfg = await loadConfig(tx, companyId);
  const where: SQL[] = [eq(procRequests.companyId, companyId), isNotNull(procRequests.invoice)];
  if (f.ids) where.push(inArray(procRequests.id, f.ids.length ? f.ids : ['00000000-0000-0000-0000-000000000000']));
  const rows = await tx
    .select({ r: procRequests, s: procSuppliers })
    .from(procRequests)
    .leftJoin(procQuotes, eq(procQuotes.id, procRequests.awardQuoteId))
    .leftJoin(procSuppliers, eq(procSuppliers.id, procQuotes.supplierId))
    .where(and(...where))
    .orderBy(desc(procRequests.stageAt))
    .limit(500);
  return rows
    .map(({ r, s }) => {
      const inv = r.invoice as Invoice;
      // Bills matched before the invoice date was kept use the PO date.
      const date = inv.date ?? r.poDate ?? r.createdAt.toISOString().slice(0, 10);
      const { net, tax } = splitTax(inv.amount, cfg.money.taxRate);
      return {
        kind: 'purchase_bill' as const,
        id: r.id,
        number: inv.no,
        date,
        due: addDays(date, BILL_DUE_DAYS),
        party: { name: s?.name ?? 'Supplier', email: s?.email, phone: s?.phone },
        reference: r.poNo ?? r.number,
        description: `${r.poNo ?? r.number}: ${r.title}`,
        net,
        taxRate: cfg.money.taxRate,
        taxName: cfg.money.taxName,
        tax,
        total: inv.amount,
        paid: 0,
      };
    })
    .filter((d) => (!f.from || d.date >= f.from) && (!f.to || d.date <= f.to));
}
