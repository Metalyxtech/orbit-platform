import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { attendanceFacts } from '@orbit/core/attendance';
import { hrLeaveRequests, hrLeaveTypes, type Tx } from '@orbit/db';
import { DEFAULT_LEAVE_TYPES, leaveDays } from '../config';
import { activePeople, isHrStaff, myRole, requireHrStaff } from './shared';

// Leave: types with days per year, requests, approval by the person's supervisor, HR or admin, and
// balances per year. Approved leave shows in Timesheet (My week, roster) through @orbit/core/attendance.

const dateSchema = z.iso.date();
const today = (ctx: SessionContext) => new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });

/** The company's leave types; the default set is created the first time HR opens it. */
export async function leaveTypes(tx: Tx, ctx: SessionContext, includeInactive = false) {
  let rows = await tx.select().from(hrLeaveTypes).where(eq(hrLeaveTypes.companyId, ctx.companyId)).orderBy(asc(hrLeaveTypes.code));
  if (!rows.length) {
    await tx
      .insert(hrLeaveTypes)
      .values(DEFAULT_LEAVE_TYPES.map((t) => ({ companyId: ctx.companyId, ...t })))
      .onConflictDoNothing();
    rows = await tx.select().from(hrLeaveTypes).where(eq(hrLeaveTypes.companyId, ctx.companyId)).orderBy(asc(hrLeaveTypes.code));
  }
  return includeInactive ? rows : rows.filter((r) => r.active);
}

const typeInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, 'Name the leave type').max(60),
  code: z.string().trim().toUpperCase().min(1).max(8),
  daysPerYear: z.coerce.number().min(0).max(366),
  paid: z.boolean(),
  active: z.boolean().default(true),
});

export async function saveLeaveType(tx: Tx, ctx: ActionContext, raw: z.input<typeof typeInput>) {
  requireHrStaff(await myRole(tx, ctx));
  const v = typeInput.parse(raw);
  const values = { name: v.name, code: v.code, daysPerYear: v.daysPerYear, paid: v.paid, active: v.active };
  if (v.id) await tx.update(hrLeaveTypes).set(values).where(and(eq(hrLeaveTypes.id, v.id), eq(hrLeaveTypes.companyId, ctx.companyId)));
  else await tx.insert(hrLeaveTypes).values({ companyId: ctx.companyId, ...values });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'hr.leave_type', entity: 'hr_leave_types', entityId: v.id, data: { summary: [`Leave type ${v.code} ${v.name}: ${v.daysPerYear} days a year${v.paid ? '' : ' (unpaid)'}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

/** Days used (approved) and waiting (pending) per leave type for one person in a year. */
export async function balances(tx: Tx, ctx: SessionContext, membershipId: string, year: number) {
  const types = await leaveTypes(tx, ctx);
  const reqs = await tx
    .select({ typeId: hrLeaveRequests.leaveTypeId, days: hrLeaveRequests.days, status: hrLeaveRequests.status })
    .from(hrLeaveRequests)
    .where(and(eq(hrLeaveRequests.companyId, ctx.companyId), eq(hrLeaveRequests.membershipId, membershipId), gte(hrLeaveRequests.fromDate, `${year}-01-01`), lte(hrLeaveRequests.fromDate, `${year}-12-31`), inArray(hrLeaveRequests.status, ['approved', 'pending'])));
  return types.map((t) => {
    const used = reqs.filter((r) => r.typeId === t.id && r.status === 'approved').reduce((s, r) => s + r.days, 0);
    const pending = reqs.filter((r) => r.typeId === t.id && r.status === 'pending').reduce((s, r) => s + r.days, 0);
    return { id: t.id, code: t.code, name: t.name, paid: t.paid, allowance: t.daysPerYear, used, pending, left: t.paid ? Math.max(0, t.daysPerYear - used - pending) : null };
  });
}

const requestInput = z.object({
  leaveTypeId: z.uuid(),
  from: dateSchema,
  to: dateSchema,
  halfDay: z.boolean().default(false),
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
});

export async function requestLeave(tx: Tx, ctx: ActionContext, raw: z.input<typeof requestInput>) {
  const v = requestInput.parse(raw);
  const to = v.halfDay ? v.from : v.to;
  if (to < v.from) throw new Error('The last day is before the first day');
  if (v.from < addDays(today(ctx), -30)) throw new Error('Leave can be asked for up to 30 days back');
  const [type] = await tx.select().from(hrLeaveTypes).where(and(eq(hrLeaveTypes.id, v.leaveTypeId), eq(hrLeaveTypes.companyId, ctx.companyId), eq(hrLeaveTypes.active, true)));
  if (!type) throw new Error('Choose a leave type');
  const overlap = await tx
    .select({ id: hrLeaveRequests.id })
    .from(hrLeaveRequests)
    .where(and(eq(hrLeaveRequests.membershipId, ctx.membershipId), inArray(hrLeaveRequests.status, ['pending', 'approved']), lte(hrLeaveRequests.fromDate, to), gte(hrLeaveRequests.toDate, v.from)));
  if (overlap.length) throw new Error('You already have leave on some of these days');
  const facts = await attendanceFacts(tx, ctx.companyId, [], v.from, to);
  const days = leaveDays(v.from, to, v.halfDay, facts.weeklyOff, new Set(facts.holidays.keys()));
  if (days <= 0) throw new Error('These dates are all weekly off or holidays');
  if (type.paid) {
    const bal = (await balances(tx, ctx, ctx.membershipId, Number(v.from.slice(0, 4)))).find((b) => b.id === type.id);
    if (bal && bal.left !== null && days > bal.left) throw new Error(`Only ${bal.left} days of ${type.name} left this year`);
  }
  await tx.insert(hrLeaveRequests).values({ companyId: ctx.companyId, membershipId: ctx.membershipId, leaveTypeId: type.id, fromDate: v.from, toDate: to, halfDay: v.halfDay, days, reason: v.reason });
  return { ok: true as const, days };
}

export async function cancelLeave(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const id = z.uuid().parse(raw.id);
  const [r] = await tx.select().from(hrLeaveRequests).where(and(eq(hrLeaveRequests.id, id), eq(hrLeaveRequests.membershipId, ctx.membershipId)));
  if (!r || !['pending', 'approved'].includes(r.status)) throw new Error('This leave cannot be cancelled');
  if (r.status === 'approved' && r.fromDate <= today(ctx)) throw new Error('Leave that has started can only be changed by HR');
  await tx.update(hrLeaveRequests).set({ status: 'cancelled' }).where(eq(hrLeaveRequests.id, r.id));
  return { ok: true as const };
}

const viewOf = (r: typeof hrLeaveRequests.$inferSelect, type: string, name = '') => ({
  id: r.id,
  membershipId: r.membershipId,
  name,
  type,
  from: r.fromDate,
  to: r.toDate,
  halfDay: r.halfDay,
  days: r.days,
  reason: r.reason,
  status: r.status,
  decisionNote: r.decisionNote,
});
export type LeaveRow = ReturnType<typeof viewOf>;

/** My leave requests, latest first. */
export async function myLeave(tx: Tx, ctx: SessionContext) {
  const rows = await tx
    .select({ r: hrLeaveRequests, type: hrLeaveTypes.name })
    .from(hrLeaveRequests)
    .innerJoin(hrLeaveTypes, eq(hrLeaveTypes.id, hrLeaveRequests.leaveTypeId))
    .where(and(eq(hrLeaveRequests.companyId, ctx.companyId), eq(hrLeaveRequests.membershipId, ctx.membershipId)))
    .orderBy(desc(hrLeaveRequests.fromDate))
    .limit(30);
  return rows.map(({ r, type }) => viewOf(r, type));
}

/** People whose leave I decide: HR staff everyone, a supervisor the people they supervise. */
async function decidesFor(tx: Tx, ctx: SessionContext) {
  const me = await myRole(tx, ctx);
  const people = await activePeople(tx, ctx);
  const mine = isHrStaff(me) || ctx.role === 'company_admin' ? people : people.filter((p) => p.supervisorId === ctx.membershipId);
  return new Map(mine.filter((p) => p.membershipId !== ctx.membershipId).map((p) => [p.membershipId, p.name]));
}

/** Leave requests waiting for me. */
export async function leaveQueue(tx: Tx, ctx: SessionContext) {
  const names = await decidesFor(tx, ctx);
  if (!names.size) return [];
  const rows = await tx
    .select({ r: hrLeaveRequests, type: hrLeaveTypes.name })
    .from(hrLeaveRequests)
    .innerJoin(hrLeaveTypes, eq(hrLeaveTypes.id, hrLeaveRequests.leaveTypeId))
    .where(and(eq(hrLeaveRequests.companyId, ctx.companyId), eq(hrLeaveRequests.status, 'pending'), inArray(hrLeaveRequests.membershipId, [...names.keys()])))
    .orderBy(asc(hrLeaveRequests.fromDate));
  return rows.map(({ r, type }) => viewOf(r, type, names.get(r.membershipId)));
}

export async function countQueue(tx: Tx, ctx: SessionContext) {
  try {
    return (await tx.transaction((sp) => leaveQueue(sp, ctx))).length;
  } catch {
    return 0;
  }
}

export async function decideLeave(tx: Tx, ctx: ActionContext, raw: { id: string; approve: boolean; note?: string }) {
  const v = z.object({ id: z.uuid(), approve: z.boolean(), note: z.string().trim().max(300).optional() }).parse(raw);
  const [r] = await tx.select().from(hrLeaveRequests).where(and(eq(hrLeaveRequests.id, v.id), eq(hrLeaveRequests.companyId, ctx.companyId))).for('update');
  if (!r || r.status !== 'pending') throw new Error('This request has already been decided');
  if (r.membershipId === ctx.membershipId) throw new Error('You cannot approve your own leave');
  if (!(await decidesFor(tx, ctx)).has(r.membershipId)) throw new Error('Only their supervisor or HR can decide this leave');
  await tx.update(hrLeaveRequests).set({ status: v.approve ? 'approved' : 'rejected', decidedBy: ctx.membershipId, decidedAt: new Date(), decisionNote: v.note || null }).where(eq(hrLeaveRequests.id, r.id));
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: v.approve ? 'hr.leave_approved' : 'hr.leave_rejected', entity: 'hr_leave_requests', entityId: r.id, data: { summary: [`${v.approve ? 'Approved' : 'Rejected'} ${r.days} days leave from ${r.fromDate}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

function addDays(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
