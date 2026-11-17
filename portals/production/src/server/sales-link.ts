import { and, eq } from 'drizzle-orm';
import { audit, type ActionContext } from '@orbit/core';
import { prodWorkOrders, salesOrders, type Tx } from '@orbit/db';

// Keeps the sales order in step with its work orders, so Sales and Accounts see where the job is
// without anyone moving the order by hand:
//   a work order is released to the floor  -> the order is "In production"
//   every work order for it is dispatched  -> the order is "Dispatched" (Accounts can invoice)
// It only ever moves an order forward, and does nothing for companies without Sales.

const ON_FLOOR = ['released', 'in_progress', 'final_qc', 'completed', 'dispatched'];

export async function syncSalesOrder(tx: Tx, ctx: ActionContext, salesOrderId: string | null | undefined) {
  if (!salesOrderId) return;
  try {
    await tx.transaction(async (sp) => {
      const [so] = await sp.select().from(salesOrders).where(and(eq(salesOrders.id, salesOrderId), eq(salesOrders.companyId, ctx.companyId))).for('update');
      if (!so || (so.status !== 'confirmed' && so.status !== 'production')) return;
      const wos = (await sp.select({ number: prodWorkOrders.number, status: prodWorkOrders.status }).from(prodWorkOrders).where(and(eq(prodWorkOrders.companyId, ctx.companyId), eq(prodWorkOrders.salesOrderId, salesOrderId)))).filter((w) => w.status !== 'cancelled');
      if (!wos.length) return;
      const next = wos.every((w) => w.status === 'dispatched') ? 'dispatched' : wos.some((w) => ON_FLOOR.includes(w.status)) ? 'production' : so.status;
      if (next === so.status) return;
      await sp.update(salesOrders).set({ status: next }).where(eq(salesOrders.id, so.id));
      const line = next === 'dispatched' ? `${so.number}: dispatched by Production (${wos.map((w) => w.number).join(', ')}). Ready to invoice.` : `${so.number}: in production (${wos.map((w) => w.number).join(', ')} released to the shop floor)`;
      await audit(sp, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'sales.order.status', entity: 'sales_orders', entityId: so.id, data: { summary: [line] }, requestId: ctx.requestId });
    });
  } catch {
    /* no Sales tables (company without Sales): nothing to keep in step */
  }
}
