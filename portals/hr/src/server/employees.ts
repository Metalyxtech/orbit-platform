import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { hrEmployees, type Tx } from '@orbit/db';
import { activePeople, myRole, requireHrStaff } from './shared';

// Employee records: one per person in the company. HR staff keep them; each person sees their own.

export type EmployeeRecord = typeof hrEmployees.$inferSelect;

/** Everyone active, with their HR record when there is one. HR staff and management only. */
export async function directory(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  if (me !== 'hr' && me !== 'admin' && ctx.role !== 'management') throw new Error('Only HR can see the employee list');
  const [people, records] = await Promise.all([activePeople(tx, ctx), tx.select().from(hrEmployees).where(eq(hrEmployees.companyId, ctx.companyId))]);
  const byMember = new Map(records.map((r) => [r.membershipId, r]));
  return { canEdit: me === 'hr' || me === 'admin', rows: people.map((p) => ({ ...p, record: byMember.get(p.membershipId) ?? null })) };
}
export type DirectoryRow = Awaited<ReturnType<typeof directory>>['rows'][number];

export async function myRecord(tx: Tx, ctx: SessionContext) {
  const [r] = await tx.select().from(hrEmployees).where(and(eq(hrEmployees.companyId, ctx.companyId), eq(hrEmployees.membershipId, ctx.membershipId)));
  return r ?? null;
}

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optDate = z.union([z.iso.date(), z.literal('')]).optional().transform((v) => v || null);
const recordInput = z.object({
  membershipId: z.uuid(),
  employeeCode: opt(30),
  department: opt(80),
  designation: opt(80),
  employmentType: z.enum(['permanent', 'contract', 'trainee', 'intern']).default('permanent'),
  joiningDate: optDate,
  dateOfBirth: optDate,
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => !v || /^\+?[0-9 ()\-.]{6,30}$/.test(v), 'Enter a valid phone number')
    .optional()
    .transform((v) => v || null),
  address: opt(400),
  emergencyName: opt(120),
  emergencyPhone: opt(30),
  status: z.enum(['active', 'left']).default('active'),
  leftOn: optDate,
});

/** HR saves a person's record. */
export async function saveRecord(tx: Tx, ctx: ActionContext, raw: z.input<typeof recordInput>) {
  requireHrStaff(await myRole(tx, ctx));
  const v = recordInput.parse(raw);
  if (!(await activePeople(tx, ctx)).some((p) => p.membershipId === v.membershipId)) throw new Error('This person is not in the company');
  const { membershipId, ...values } = v;
  await tx
    .insert(hrEmployees)
    .values({ companyId: ctx.companyId, membershipId, ...values })
    .onConflictDoUpdate({ target: [hrEmployees.companyId, hrEmployees.membershipId], set: { ...values, updatedAt: new Date() } });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'hr.employee_saved', entity: 'hr_employees', entityId: membershipId, data: { summary: [`Employee record saved${v.designation ? `: ${v.designation}` : ''}${v.department ? `, ${v.department}` : ''}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}
