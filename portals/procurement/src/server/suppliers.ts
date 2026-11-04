import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { procSuppliers, type Tx } from '@orbit/db';
import { myRole, requireRole } from './shared';

export async function listSuppliers(tx: Tx, ctx: SessionContext) {
  return tx
    .select({ id: procSuppliers.id, name: procSuppliers.name, categories: procSuppliers.categories, email: procSuppliers.email, phone: procSuppliers.phone, rating: procSuppliers.rating })
    .from(procSuppliers)
    .where(and(eq(procSuppliers.companyId, ctx.companyId), eq(procSuppliers.active, true)))
    .orderBy(asc(procSuppliers.name));
}
export type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>[number];

const supplierInput = z.object({
  name: z.string().trim().min(2, 'Enter the supplier name').max(200),
  categories: z.string().trim().max(200),
  email: z.string().trim().toLowerCase().max(200).nullable(),
  phone: z.string().trim().max(40).nullable(),
  rating: z.number().min(0).max(5).nullable(),
});

export async function addSupplier(tx: Tx, ctx: ActionContext, raw: z.input<typeof supplierInput>) {
  requireRole(await myRole(tx, ctx), 'buyer', 'manager');
  const input = supplierInput.parse(raw);
  if (input.email && !z.email().safeParse(input.email).success) throw new Error('Enter a valid email');
  const [row] = await tx.insert(procSuppliers).values({ companyId: ctx.companyId, ...input }).returning({ id: procSuppliers.id });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'procurement.supplier.add', entity: 'proc_suppliers', entityId: row.id, data: { name: input.name }, requestId: ctx.requestId });
  return row;
}
