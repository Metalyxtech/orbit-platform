import { and, asc, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { z } from 'zod';
import { audit, type ActionContext, type SessionContext } from '@orbit/core';
import { memberships, projectMembers, projects, timesheetEntries, timesheets, tsHolidays, tsOtRequests, tsOtSettings, tsRoster, tsShifts, users, type Tx } from '@orbit/db';
import { addDays, computeTotals, dayLabel, dayName, defaultOtRates, round2, weekDates, weekRangeLabel, weekStartFor, weightedOt, type DayPlan, type GridRow, type OtRates } from '../calc';
import { loadSettings, rulesFrom } from './shared';

// Roster and overtime for the Timesheet portal.
//  - Company admin sets the shifts, public holidays and overtime rates.
//  - Supervisors roster their own people, project managers their project team, the company admin
//    everyone; management (GM) sees every team. Changes stay a draft until the week is published.
//  - Anyone can ask for overtime in advance; their supervisor, project manager or the admin decides.
//  - My week, submit and approvals use the published plan to count overtime per day.

const pgCode = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
/** Migration 0034 not run yet: the roster is simply empty. */
const notReady = (err: unknown) => pgCode(err) === '42P01' || /relation "ts_(shifts|roster|holidays|ot_requests|ot_settings)" does not exist/.test(String(err));
async function safe<T>(tx: Tx, fn: (sp: Tx) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await tx.transaction(fn);
  } catch (err) {
    if (notReady(err)) return fallback;
    throw err;
  }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time, for example 08:00');
const emptyPlan = (): DayPlan[] => Array.from({ length: 7 }, () => ({ kind: null, preApproved: 0 }));

// ---------------------------------------------------------------- who may roster whom

export interface TeamPerson {
  membershipId: string;
  name: string;
  title: string | null;
  role: string;
}

/**
 * People this person rosters (and decides overtime for). Company admin: everyone. Supervisor: the
 * people they supervise. Project manager: their projects' teams. Management sees everyone, read only.
 */
export async function rosterTeam(tx: Tx, ctx: SessionContext): Promise<{ people: TeamPerson[]; canEdit: boolean }> {
  const all = await tx
    .select({ membershipId: memberships.id, name: users.name, title: memberships.title, role: memberships.role, supervisorId: memberships.supervisorId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.status, 'active')))
    .orderBy(asc(users.name));
  const strip = (p: (typeof all)[number]): TeamPerson => ({ membershipId: p.membershipId, name: p.name, title: p.title, role: p.role });
  if (ctx.role === 'company_admin') return { people: all.map(strip), canEdit: true };
  if (ctx.role === 'management') return { people: all.map(strip), canEdit: false };
  if (ctx.role === 'employee') return { people: [], canEdit: false };
  const mine = new Set(all.filter((p) => p.supervisorId === ctx.membershipId).map((p) => p.membershipId));
  const led = await tx
    .select({ id: projectMembers.membershipId })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projects.companyId, ctx.companyId), eq(projects.pmId, ctx.membershipId), eq(projects.status, 'active')));
  for (const r of led) mine.add(r.id);
  mine.delete(ctx.membershipId);
  return { people: all.filter((p) => mine.has(p.membershipId)).map(strip), canEdit: true };
}

async function assertInTeam(tx: Tx, ctx: SessionContext, ids: string[]) {
  const { people, canEdit } = await rosterTeam(tx, ctx);
  if (!canEdit) throw new Error('You can view the roster but not change it');
  const ok = new Set(people.map((p) => p.membershipId));
  if (ids.some((id) => !ok.has(id))) throw new Error('You can only roster people in your own team');
}

const requireAdmin = (ctx: SessionContext) => {
  if (ctx.role !== 'company_admin') throw new Error('Only the company admin can change shifts, holidays and overtime rates');
};

// ---------------------------------------------------------------- shifts, holidays, rates (admin)

/** Paid hours of a shift: end minus start (past midnight for night shifts) less the break. */
export function shiftHours(start: string, end: string, breakMinutes: number) {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let mins = m(end) - m(start);
  if (mins <= 0) mins += 24 * 60;
  return round2((mins - breakMinutes) / 60);
}

export async function listShifts(tx: Tx, ctx: SessionContext, includeInactive = false) {
  return safe(
    tx,
    (sp) =>
      sp
        .select()
        .from(tsShifts)
        .where(and(eq(tsShifts.companyId, ctx.companyId), ...(includeInactive ? [] : [eq(tsShifts.active, true)])))
        .orderBy(asc(tsShifts.position), asc(tsShifts.name)),
    [] as (typeof tsShifts.$inferSelect)[],
  );
}

const shiftInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Name the shift').max(40),
  startTime: timeSchema,
  endTime: timeSchema,
  breakMinutes: z.coerce.number().int().min(0).max(600),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2f5d8a'),
});

export async function saveShift(tx: Tx, ctx: ActionContext, raw: z.input<typeof shiftInput>) {
  requireAdmin(ctx);
  const v = shiftInput.parse(raw);
  const hours = shiftHours(v.startTime, v.endTime, v.breakMinutes);
  if (hours <= 0 || hours > 24) throw new Error('The break is longer than the shift');
  const values = { name: v.name, startTime: v.startTime, endTime: v.endTime, breakMinutes: v.breakMinutes, hours, color: v.color };
  if (v.id) {
    await tx.update(tsShifts).set(values).where(and(eq(tsShifts.id, v.id), eq(tsShifts.companyId, ctx.companyId)));
  } else {
    const n = (await listShifts(tx, ctx, true)).length;
    await tx.insert(tsShifts).values({ companyId: ctx.companyId, position: n, ...values });
  }
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'timesheet.shift_saved', entity: 'ts_shifts', entityId: v.id, data: { summary: [`Shift ${v.name} ${v.startTime}-${v.endTime} (${hours} h)`] }, requestId: ctx.requestId });
  return { ok: true as const, hours };
}

/** Shifts are switched off, not deleted, so past rosters keep their meaning. */
export async function setShiftActive(tx: Tx, ctx: ActionContext, raw: { id: string; active: boolean }) {
  requireAdmin(ctx);
  const v = z.object({ id: z.uuid(), active: z.boolean() }).parse(raw);
  await tx.update(tsShifts).set({ active: v.active }).where(and(eq(tsShifts.id, v.id), eq(tsShifts.companyId, ctx.companyId)));
  return { ok: true as const };
}

export async function listHolidays(tx: Tx, ctx: SessionContext, year: number) {
  return safe(
    tx,
    (sp) =>
      sp
        .select()
        .from(tsHolidays)
        .where(and(eq(tsHolidays.companyId, ctx.companyId), gte(tsHolidays.holidayDate, `${year}-01-01`), lte(tsHolidays.holidayDate, `${year}-12-31`)))
        .orderBy(asc(tsHolidays.holidayDate)),
    [] as (typeof tsHolidays.$inferSelect)[],
  );
}

export async function saveHoliday(tx: Tx, ctx: ActionContext, raw: { date: string; name: string }) {
  requireAdmin(ctx);
  const v = z.object({ date: dateSchema, name: z.string().trim().min(2, 'Name the holiday').max(80) }).parse(raw);
  await tx
    .insert(tsHolidays)
    .values({ companyId: ctx.companyId, holidayDate: v.date, name: v.name })
    .onConflictDoUpdate({ target: [tsHolidays.companyId, tsHolidays.holidayDate], set: { name: v.name } });
  return { ok: true as const };
}

export async function deleteHoliday(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  requireAdmin(ctx);
  await tx.delete(tsHolidays).where(and(eq(tsHolidays.id, z.uuid().parse(raw.id)), eq(tsHolidays.companyId, ctx.companyId)));
  return { ok: true as const };
}

export async function otRates(tx: Tx, companyId: string): Promise<OtRates> {
  const [row] = await safe(tx, (sp) => sp.select().from(tsOtSettings).where(eq(tsOtSettings.companyId, companyId)), [] as (typeof tsOtSettings.$inferSelect)[]);
  return row ? { workday: row.workdayRate, offday: row.offdayRate } : defaultOtRates;
}

export async function saveOtRates(tx: Tx, ctx: ActionContext, raw: { workday: number; offday: number }) {
  requireAdmin(ctx);
  const v = z.object({ workday: z.coerce.number().min(1).max(5), offday: z.coerce.number().min(1).max(5) }).parse(raw);
  await tx
    .insert(tsOtSettings)
    .values({ companyId: ctx.companyId, workdayRate: v.workday, offdayRate: v.offday })
    .onConflictDoUpdate({ target: tsOtSettings.companyId, set: { workdayRate: v.workday, offdayRate: v.offday } });
  return { ok: true as const };
}

// ---------------------------------------------------------------- the plan per person (published)

/** Plans for several people for one week: published roster, holidays, and pre-approved overtime. */
export async function weekPlans(tx: Tx, companyId: string, ids: string[], weekStart: string): Promise<Map<string, DayPlan[]>> {
  const out = new Map(ids.map((id) => [id, emptyPlan()]));
  if (!ids.length) return out;
  const dates = weekDates(weekStart);
  const end = dates[6];
  const [cells, holidays, requests] = await Promise.all([
    safe(
      tx,
      (sp) =>
        sp
          .select({ membershipId: tsRoster.membershipId, workDate: tsRoster.workDate, kind: tsRoster.kind, plannedOt: tsRoster.plannedOt, shift: tsShifts })
          .from(tsRoster)
          .leftJoin(tsShifts, eq(tsShifts.id, tsRoster.shiftId))
          .where(and(eq(tsRoster.companyId, companyId), inArray(tsRoster.membershipId, ids), gte(tsRoster.workDate, weekStart), lte(tsRoster.workDate, end), eq(tsRoster.published, true))),
      [] as { membershipId: string; workDate: string; kind: string; plannedOt: number; shift: typeof tsShifts.$inferSelect | null }[],
    ),
    safe(tx, (sp) => sp.select().from(tsHolidays).where(and(eq(tsHolidays.companyId, companyId), gte(tsHolidays.holidayDate, weekStart), lte(tsHolidays.holidayDate, end))), [] as (typeof tsHolidays.$inferSelect)[]),
    safe(
      tx,
      (sp) =>
        sp
          .select({ membershipId: tsOtRequests.membershipId, workDate: tsOtRequests.workDate, hours: tsOtRequests.hours })
          .from(tsOtRequests)
          .where(and(eq(tsOtRequests.companyId, companyId), inArray(tsOtRequests.membershipId, ids), gte(tsOtRequests.workDate, weekStart), lte(tsOtRequests.workDate, end), eq(tsOtRequests.status, 'approved'))),
      [] as { membershipId: string; workDate: string; hours: number }[],
    ),
  ]);
  for (const [id, plan] of out) {
    dates.forEach((date, d) => {
      const h = holidays.find((x) => x.holidayDate === date);
      if (h) plan[d].holiday = h.name;
      const c = cells.find((x) => x.membershipId === id && x.workDate === date);
      if (c) {
        plan[d].kind = c.kind as DayPlan['kind'];
        plan[d].preApproved += c.plannedOt;
        if (c.shift) Object.assign(plan[d], { shiftName: c.shift.name, start: c.shift.startTime, end: c.shift.endTime, hours: c.shift.hours, color: c.shift.color });
      }
      plan[d].preApproved = round2(plan[d].preApproved + requests.filter((r) => r.membershipId === id && r.workDate === date).reduce((s, r) => s + r.hours, 0));
    });
  }
  return out;
}

export async function weekPlan(tx: Tx, companyId: string, membershipId: string, weekStart: string) {
  return (await weekPlans(tx, companyId, [membershipId], weekStart)).get(membershipId)!;
}

// ---------------------------------------------------------------- the roster planner

export interface RosterCell {
  kind: 'shift' | 'off' | 'leave';
  shiftId: string | null;
  plannedOt: number;
  note: string | null;
  published: boolean;
}

export async function getRoster(tx: Tx, ctx: SessionContext, input: { weekStart?: string }) {
  const rules = rulesFrom(await loadSettings(tx, ctx.companyId));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const weekStart = weekStartFor(input.weekStart ? dateSchema.parse(input.weekStart) : today, rules.weekStart);
  const dates = weekDates(weekStart);
  const { people, canEdit } = await rosterTeam(tx, ctx);
  const ids = people.map((p) => p.membershipId);
  const [shifts, cells, holidays] = await Promise.all([
    listShifts(tx, ctx),
    ids.length
      ? safe(tx, (sp) => sp.select().from(tsRoster).where(and(eq(tsRoster.companyId, ctx.companyId), inArray(tsRoster.membershipId, ids), gte(tsRoster.workDate, weekStart), lte(tsRoster.workDate, dates[6]))), [] as (typeof tsRoster.$inferSelect)[])
      : Promise.resolve([] as (typeof tsRoster.$inferSelect)[]),
    safe(tx, (sp) => sp.select().from(tsHolidays).where(and(eq(tsHolidays.companyId, ctx.companyId), gte(tsHolidays.holidayDate, weekStart), lte(tsHolidays.holidayDate, dates[6]))), [] as (typeof tsHolidays.$inferSelect)[]),
  ]);
  const byKey = new Map(cells.map((c) => [`${c.membershipId}:${c.workDate}`, c]));
  return {
    weekStart,
    rangeLabel: weekRangeLabel(weekStart),
    prevWeek: addDays(weekStart, -7),
    nextWeek: addDays(weekStart, 7),
    days: dates.map((date) => ({
      date,
      name: dayName(date),
      label: dayLabel(date),
      weeklyOff: rules.weeklyOff.includes(new Date(`${date}T00:00:00Z`).getUTCDay()),
      holiday: holidays.find((h) => h.holidayDate === date)?.name ?? null,
    })),
    shifts: shifts.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, hours: s.hours, color: s.color })),
    people: people.map((p) => ({
      ...p,
      cells: dates.map((date): RosterCell | null => {
        const c = byKey.get(`${p.membershipId}:${date}`);
        return c ? { kind: c.kind as RosterCell['kind'], shiftId: c.shiftId, plannedOt: c.plannedOt, note: c.note, published: c.published } : null;
      }),
    })),
    unpublished: cells.filter((c) => !c.published).length,
    canEdit,
    stdDayHours: rules.stdDayHours,
  };
}
export type RosterView = Awaited<ReturnType<typeof getRoster>>;

const cellInput = z.object({
  membershipId: z.uuid(),
  date: dateSchema,
  /** null clears the day. */
  kind: z.enum(['shift', 'off', 'leave']).nullable(),
  shiftId: z.uuid().nullable().optional(),
  plannedOt: z.coerce.number().min(0).max(16).default(0),
  note: z.string().trim().max(200).nullable().optional(),
});
const cellsInput = z.object({ cells: z.array(cellInput).min(1).max(1000) });

/** Sets roster days (a draft until the week is published). */
export async function setCells(tx: Tx, ctx: ActionContext, raw: z.input<typeof cellsInput>) {
  const { cells } = cellsInput.parse(raw);
  await assertInTeam(tx, ctx, [...new Set(cells.map((c) => c.membershipId))]);
  const shiftIds = new Set((await listShifts(tx, ctx)).map((s) => s.id));
  for (const c of cells) {
    if (c.kind === null) {
      await tx.delete(tsRoster).where(and(eq(tsRoster.companyId, ctx.companyId), eq(tsRoster.membershipId, c.membershipId), eq(tsRoster.workDate, c.date)));
      continue;
    }
    if (c.kind === 'shift' && (!c.shiftId || !shiftIds.has(c.shiftId))) throw new Error('Choose one of the company shifts');
    const values = { kind: c.kind, shiftId: c.kind === 'shift' ? c.shiftId! : null, plannedOt: c.kind === 'leave' ? 0 : c.plannedOt, note: c.note || null, published: false, updatedBy: ctx.membershipId, updatedAt: new Date() };
    await tx
      .insert(tsRoster)
      .values({ companyId: ctx.companyId, membershipId: c.membershipId, workDate: c.date, ...values })
      .onConflictDoUpdate({ target: [tsRoster.companyId, tsRoster.membershipId, tsRoster.workDate], set: values });
  }
  return { ok: true as const, changed: cells.length };
}

/** Copies last week's roster for my team into this week (as a draft), replacing what is there. */
export async function copyRosterWeek(tx: Tx, ctx: ActionContext, raw: { weekStart: string }) {
  const weekStart = dateSchema.parse(raw.weekStart);
  const { people, canEdit } = await rosterTeam(tx, ctx);
  if (!canEdit) throw new Error('You can view the roster but not change it');
  const ids = people.map((p) => p.membershipId);
  if (!ids.length) return { ok: true as const, copied: 0 };
  const prev = addDays(weekStart, -7);
  const from = await tx.select().from(tsRoster).where(and(eq(tsRoster.companyId, ctx.companyId), inArray(tsRoster.membershipId, ids), gte(tsRoster.workDate, prev), lte(tsRoster.workDate, addDays(prev, 6))));
  const cells = from.map((c) => ({ membershipId: c.membershipId, date: addDays(c.workDate, 7), kind: c.kind as RosterCell['kind'], shiftId: c.shiftId, plannedOt: c.plannedOt, note: c.note }));
  if (cells.length) await setCells(tx, ctx, { cells });
  return { ok: true as const, copied: cells.length };
}

/** Publishes the week for my team: everyone sees their shifts, and overtime is counted against them. */
export async function publishWeek(tx: Tx, ctx: ActionContext, raw: { weekStart: string }) {
  const weekStart = dateSchema.parse(raw.weekStart);
  const { people, canEdit } = await rosterTeam(tx, ctx);
  if (!canEdit) throw new Error('You can view the roster but not publish it');
  const ids = people.map((p) => p.membershipId);
  if (!ids.length) return { ok: true as const, published: 0 };
  const done = await tx
    .update(tsRoster)
    .set({ published: true })
    .where(and(eq(tsRoster.companyId, ctx.companyId), inArray(tsRoster.membershipId, ids), gte(tsRoster.workDate, weekStart), lte(tsRoster.workDate, addDays(weekStart, 6)), eq(tsRoster.published, false)))
    .returning({ id: tsRoster.id });
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'timesheet.roster_published', entity: 'ts_roster', data: { summary: [`Roster published for ${weekRangeLabel(weekStart)} (${done.length} days)`] }, requestId: ctx.requestId });
  return { ok: true as const, published: done.length };
}

// ---------------------------------------------------------------- overtime asked for in advance

const otInput = z.object({
  date: dateSchema,
  hours: z.coerce.number().min(0.25, 'At least 0.25 h').max(16, 'At most 16 h'),
  projectId: z.uuid().nullable().optional(),
  reason: z.string().trim().min(3, 'Say why the overtime is needed').max(500),
});

export async function requestOt(tx: Tx, ctx: ActionContext, raw: z.input<typeof otInput>) {
  const v = otInput.parse(raw);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  if (v.date < addDays(today, -14)) throw new Error('Overtime can be asked for up to 14 days back');
  await tx.insert(tsOtRequests).values({ companyId: ctx.companyId, membershipId: ctx.membershipId, workDate: v.date, hours: v.hours, projectId: v.projectId ?? null, reason: v.reason });
  return { ok: true as const };
}

export async function cancelOt(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const id = z.uuid().parse(raw.id);
  await tx
    .update(tsOtRequests)
    .set({ status: 'cancelled' })
    .where(and(eq(tsOtRequests.id, id), eq(tsOtRequests.membershipId, ctx.membershipId), eq(tsOtRequests.status, 'pending')));
  return { ok: true as const };
}

const otView = (r: typeof tsOtRequests.$inferSelect & { name?: string; project?: string | null }) => ({
  id: r.id,
  membershipId: r.membershipId,
  name: r.name ?? '',
  date: r.workDate,
  dateLabel: `${dayName(r.workDate)} ${dayLabel(r.workDate)}`,
  hours: r.hours,
  project: r.project ?? null,
  reason: r.reason,
  status: r.status,
  decisionNote: r.decisionNote,
});

/** My overtime requests (latest first). */
export async function myOtRequests(tx: Tx, ctx: SessionContext) {
  const rows = await safe(
    tx,
    (sp) =>
      sp
        .select({ r: tsOtRequests, project: projects.name })
        .from(tsOtRequests)
        .leftJoin(projects, eq(projects.id, tsOtRequests.projectId))
        .where(and(eq(tsOtRequests.companyId, ctx.companyId), eq(tsOtRequests.membershipId, ctx.membershipId)))
        .orderBy(desc(tsOtRequests.workDate))
        .limit(20),
    [] as { r: typeof tsOtRequests.$inferSelect; project: string | null }[],
  );
  return rows.map(({ r, project }) => otView({ ...r, project }));
}

/** Overtime requests waiting for me (people I roster). */
export async function otQueue(tx: Tx, ctx: SessionContext) {
  const { people, canEdit } = await rosterTeam(tx, ctx);
  if (!canEdit || !people.length) return [];
  const names = new Map(people.map((p) => [p.membershipId, p.name]));
  const rows = await safe(
    tx,
    (sp) =>
      sp
        .select({ r: tsOtRequests, project: projects.name })
        .from(tsOtRequests)
        .leftJoin(projects, eq(projects.id, tsOtRequests.projectId))
        .where(and(eq(tsOtRequests.companyId, ctx.companyId), eq(tsOtRequests.status, 'pending'), inArray(tsOtRequests.membershipId, [...names.keys()]), ne(tsOtRequests.membershipId, ctx.membershipId)))
        .orderBy(asc(tsOtRequests.workDate)),
    [] as { r: typeof tsOtRequests.$inferSelect; project: string | null }[],
  );
  return rows.map(({ r, project }) => otView({ ...r, project, name: names.get(r.membershipId) }));
}

export async function decideOt(tx: Tx, ctx: ActionContext, raw: { id: string; approve: boolean; note?: string }) {
  const v = z.object({ id: z.uuid(), approve: z.boolean(), note: z.string().trim().max(300).optional() }).parse(raw);
  const [r] = await tx.select().from(tsOtRequests).where(and(eq(tsOtRequests.id, v.id), eq(tsOtRequests.companyId, ctx.companyId))).for('update');
  if (!r || r.status !== 'pending') throw new Error('This request has already been decided');
  if (r.membershipId === ctx.membershipId) throw new Error('You cannot approve your own overtime');
  await assertInTeam(tx, ctx, [r.membershipId]);
  await tx
    .update(tsOtRequests)
    .set({ status: v.approve ? 'approved' : 'rejected', decidedBy: ctx.membershipId, decidedAt: new Date(), decisionNote: v.note || null })
    .where(eq(tsOtRequests.id, r.id));
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: v.approve ? 'timesheet.ot_approved' : 'timesheet.ot_rejected', entity: 'ts_ot_requests', entityId: r.id, data: { summary: [`${v.approve ? 'Approved' : 'Rejected'} ${r.hours} h overtime on ${r.workDate}`] }, requestId: ctx.requestId });
  return { ok: true as const };
}

// ---------------------------------------------------------------- overtime report (payroll)

/** Overtime for a month by person (submitted and approved weeks), split and weighted for payroll. */
export async function otReport(tx: Tx, ctx: SessionContext, raw: { month?: string }) {
  const month = raw.month && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone }).slice(0, 7);
  const { people } = await rosterTeam(tx, ctx);
  const rates = await otRates(tx, ctx.companyId);
  const rules = rulesFrom(await loadSettings(tx, ctx.companyId));
  const ids = people.map((p) => p.membershipId);
  const empty = { month, rates, rows: [] as OtReportRow[], totals: { overtime: 0, workdayOt: 0, offdayOt: 0, preApprovedOt: 0, notPreApprovedOt: 0, weighted: 0 } };
  if (!ids.length) return empty;
  const first = `${month}-01`;
  // Weeks that start in the month (the last day of the month is day 0 of the next one).
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const sheets = await tx
    .select({ id: timesheets.id, membershipId: timesheets.membershipId, weekStart: timesheets.weekStart, revision: timesheets.revision })
    .from(timesheets)
    .where(and(eq(timesheets.companyId, ctx.companyId), inArray(timesheets.membershipId, ids), gte(timesheets.weekStart, first), lte(timesheets.weekStart, last), inArray(timesheets.status, ['in_approval', 'locked'])))
    .orderBy(desc(timesheets.revision));
  const latest = new Map<string, (typeof sheets)[number]>();
  for (const s of sheets) if (!latest.has(`${s.membershipId}:${s.weekStart}`)) latest.set(`${s.membershipId}:${s.weekStart}`, s);
  const sums = new Map<string, { overtime: number; workdayOt: number; offdayOt: number; preApprovedOt: number; notPreApprovedOt: number }>();
  for (const s of latest.values()) {
    const entries = await tx.select().from(timesheetEntries).where(eq(timesheetEntries.timesheetId, s.id));
    const dates = weekDates(s.weekStart);
    const rows = new Map<string, GridRow>();
    for (const e of entries) {
      const row = rows.get(e.rowKey) ?? { key: e.rowKey, projectId: e.projectId, costCodeId: e.costCodeId, hours: Array(7).fill(0) };
      const d = dates.indexOf(e.workDate);
      if (d >= 0) row.hours[d] = e.hours;
      rows.set(e.rowKey, row);
    }
    const t = computeTotals([...rows.values()], rules, await weekPlan(tx, ctx.companyId, s.membershipId, s.weekStart), s.weekStart);
    const acc = sums.get(s.membershipId) ?? { overtime: 0, workdayOt: 0, offdayOt: 0, preApprovedOt: 0, notPreApprovedOt: 0 };
    for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] = round2(acc[k] + t[k]);
    sums.set(s.membershipId, acc);
  }
  const rows: OtReportRow[] = people
    .filter((p) => sums.get(p.membershipId)?.overtime)
    .map((p) => {
      const s = sums.get(p.membershipId)!;
      return { membershipId: p.membershipId, name: p.name, ...s, weighted: weightedOt(s, rates) };
    })
    .sort((a, b) => b.overtime - a.overtime);
  const totals = { ...empty.totals };
  for (const r of rows) for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = round2(totals[k] + r[k]);
  return { month, rates, rows, totals };
}
export interface OtReportRow {
  membershipId: string;
  name: string;
  overtime: number;
  workdayOt: number;
  offdayOt: number;
  preApprovedOt: number;
  notPreApprovedOt: number;
  weighted: number;
}
