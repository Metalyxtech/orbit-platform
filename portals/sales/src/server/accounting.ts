import { and, desc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { splitTax, type AcctDoc, type AcctDocFilter } from '@orbit/core/accounting';
import { salesCustomers, salesInvoices, salesOrders, type Tx } from '@orbit/db';
import { loadConfig } from './shared';

// Sales invoices in the shape the accounting connections send (@orbit/core/accounting). The invoice
// amount includes GST at the company's Sales GST rate, so it is split back into value and GST.

export async function salesInvoiceDocs(tx: Tx, companyId: string, f: AcctDocFilter): Promise<AcctDoc[]> {
  const cfg = await loadConfig(tx, companyId);
  const where: SQL[] = [eq(salesInvoices.companyId, companyId)];
  if (f.ids) where.push(inArray(salesInvoices.id, f.ids.length ? f.ids : ['00000000-0000-0000-0000-000000000000']));
  if (f.from) where.push(gte(salesInvoices.issued, f.from));
  if (f.to) where.push(lte(salesInvoices.issued, f.to));
  const rows = await tx
    .select({ i: salesInvoices, c: salesCustomers, orderNo: salesOrders.number, title: salesOrders.title })
    .from(salesInvoices)
    .innerJoin(salesCustomers, eq(salesCustomers.id, salesInvoices.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesInvoices.orderId))
    .where(and(...where))
    .orderBy(desc(salesInvoices.issued), desc(salesInvoices.number))
    .limit(500);
  return rows.map(({ i, c, orderNo, title }) => {
    const { net, tax } = splitTax(i.amount, cfg.gst);
    return {
      kind: 'sales_invoice' as const,
      id: i.id,
      number: i.number,
      date: i.issued,
      due: i.due,
      party: { name: c.name, gstin: c.gstin, email: c.email, phone: c.phone, city: c.city },
      reference: orderNo ?? '',
      description: title ? `${orderNo}: ${title}` : `Invoice ${i.number}`,
      net,
      taxRate: cfg.gst,
      taxName: 'GST',
      tax,
      total: i.amount,
      paid: i.paid,
    };
  });
}
