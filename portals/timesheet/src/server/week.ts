import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionContext, SessionContext } from '@orbit/core';
import { simulate, startWorkflow, type RouteStep } from '@orbit/core/workflow';
import {
  correctionRequests,
  costCodes,
  projects,
  timesheetEntries,
  timesheets,
  workflowInstances,
  workflowTasks,
  type Tx,
} from '@orbit/db';
import {
  addDays,
  computeTotals,
  deadlineDate,
  dayLabel,
  dayName,
  dayOfWeek,
  validateSubmit,
  weekDates,
  weekNumber,
  weekRangeLabel,
  weekStartFor,
  type GridRow,
  type SubmitIssue,
  type TsRules,
} from '../calc';
import { messages } from '../messages';
import {
  approverResolver,
  boundWorkflow,
  email,
  emit,
  loadSettings,
  membersById,
  membersWithRole,
  rulesFrom,
} from './shared';

export type TimesheetStatus = (typeof timesheets.$inferSelect)['status'];

export interface WeekRow extends GridRow {
  projectLabel: string;
  costCodeLabel: string;
}

export interface WeekView {
  weekStart: string;
  weekNumber: number;
  rangeLabel: string;
  days: { date: string; name: string; label: string; weeklyOff: boolean }[];
  deadlineLabel: string;
  rules: TsRules;
  timesheet: {
    id: string | null;
    status: TimesheetStatus;
    revision: number;
    note: string | null;
    returnComment: string | null;
    returnedBy: string | null;
    returnedAt: string | null;
  };
  readOnly: boolean;
  rows: WeekRow[];
  route: RouteStep[];
  options: {
    projects: { id: string; code: string; name: string }[];
    costCodes: { id: string; projectId: string | null; code: string; name: string }[];
  };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Latest revision of my timesheet for a week, if it exists. */
async function latestSheet(tx: Tx, ctx: SessionContext, weekStart: string) {
  const [sheet] = await tx
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.membershipId, ctx.membershipId), eq(timesheets.weekStart, weekStart)))
    .orderBy(desc(timesheets.revision))
    .limit(1);
  return sheet;
}

async function loadRows(tx: Tx, timesheetId: string, weekStart: string): Promise<GridRow[]> {
  const entries = await tx
    .select()
    .from(timesheetEntries)
    .where(eq(timesheetEntries.timesheetId, timesheetId))
    .orderBy(asc(timesheetEntries.rowKey));
  const dates = weekDates(weekStart);
  const rows = new Map<string, GridRow>();
  for (const e of entries) {
    const row = rows.get(e.rowKey) ?? { key: e.rowKey, projectId: e.projectId, costCodeId: e.costCodeId, hours: Array(7).fill(0) };
    const d = dates.indexOf(e.workDate);
    if (d >= 0) row.hours[d] = e.hours;
    rows.set(e.rowKey, row);
  }
  return [...rows.values()];
}

async function options(tx: Tx, ctx: SessionContext) {
  const [p, c] = await Promise.all([
    tx
      .select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(and(eq(projects.companyId, ctx.companyId), eq(projects.status, 'active')))
      .orderBy(asc(projects.code)),
    tx
      .select({ id: costCodes.id, projectId: costCodes.projectId, code: costCodes.code, name: costCodes.name })
      .from(costCodes)
      .where(and(eq(costCodes.companyId, ctx.companyId), eq(costCodes.active, true)))
      .orderBy(asc(costCodes.code)),
  ]);
  return { projects: p, costCodes: c };
}

function contextFor(ctx: SessionContext, rows: GridRow[], rules: TsRules) {
  const t = computeTotals(rows, rules);
  return {
    submitterId: ctx.membershipId,
    totalHours: t.total,
    overtimeHours: t.overtime,
    maxDayHours: t.maxDay,
    projectIds: [...new Set(rows.filter((r) => r.hours.some((h) => h > 0)).map((r) => r.projectId).filter((x): x is string => !!x))],
  };
}

/** ts.getWeek */
export async function getWeek(tx: Tx, ctx: SessionContext, input: { weekStart?: string }): Promise<WeekView> {
  const settings = await loadSettings(tx, ctx.companyId);
  const rules = rulesFrom(settings);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const weekStart = weekStartFor(input.weekStart ? dateSchema.parse(input.weekStart) : today, rules.weekStart);

  const sheet = await latestSheet(tx, ctx, weekStart);
  const rows = sheet ? await loadRows(tx, sheet.id, weekStart) : [];
  const opts = await options(tx, ctx);
  const pById = new Map(opts.projects.map((p) => [p.id, p]));
  const cById = new Map(opts.costCodes.map((c) => [c.id, c]));

  const def = await boundWorkflow(tx, ctx.companyId);
  const route = await simulate(def.definition, contextFor(ctx, rows, rules), approverResolver(tx, ctx.companyId));
  const deadline = deadlineDate(weekStart, settings.deadlineDow);
  const status = sheet?.status ?? 'draft';

  return {
    weekStart,
    weekNumber: weekNumber(weekStart),
    rangeLabel: weekRangeLabel(weekStart),
    days: weekDates(weekStart).map((date) => ({
      date,
      name: dayName(date),
      label: dayLabel(date).split(' ')[0],
      weeklyOff: rules.weeklyOff.includes(dayOfWeek(date)),
    })),
    deadlineLabel: `${dayName(deadline)} ${dayLabel(deadline)}, ${settings.deadlineTime}`,
    rules,
    timesheet: {
      id: sheet?.id ?? null,
      status,
      revision: sheet?.revision ?? 0,
      note: sheet?.note ?? null,
      returnComment: sheet?.returnComment ?? null,
      returnedBy: sheet?.returnedBy ?? null,
      returnedAt: sheet?.returnedAt?.toISOString() ?? null,
    },
    readOnly: !(status === 'draft' || status === 'returned'),
    rows: rows.map((r) => {
      const p = r.projectId ? pById.get(r.projectId) : undefined;
      const c = r.costCodeId ? cById.get(r.costCodeId) : undefined;
      return { ...r, projectLabel: p ? `${p.code} ${p.name}` : '', costCodeLabel: c ? `${c.code} ${c.name}` : '' };
    }),
    route,
    options: opts,
  };
}

/** 'Who will approve' refresh (debounced 1.5 s on the client): workflow.simulate on unsaved totals. */
export async function previewRoute(tx: Tx, ctx: SessionContext, input: { rows: GridRow[] }) {
  const rules = rulesFrom(await loadSettings(tx, ctx.companyId));
  const def = await boundWorkflow(tx, ctx.companyId);
  return simulate(def.definition, contextFor(ctx, input.rows, rules), approverResolver(tx, ctx.companyId));
}

const rowSchema = z.object({
  key: z.string().min(1).max(64),
  projectId: z.uuid().nullable(),
  costCodeId: z.uuid().nullable(),
  hours: z.array(z.number().min(0).max(24)).length(7),
});

export const saveEntriesInput = z.object({
  weekStart: dateSchema,
  rows: z.array(rowSchema).max(50),
  removedRowKeys: z.array(z.string()).max(50).default([]),
  note: z.string().max(2000).nullable().optional(),
});

async function getOrCreateEditable(tx: Tx, ctx: SessionContext, weekStart: string) {
  const sheet = await latestSheet(tx, ctx, weekStart);
  if (sheet) {
    if (sheet.status !== 'draft' && sheet.status !== 'returned') throw new Error(messages.lockedWeek);
    return sheet;
  }
  const [created] = await tx
    .insert(timesheets)
    .values({ companyId: ctx.companyId, membershipId: ctx.membershipId, weekStart, createdStage: ctx.companyStage })
    .returning();
  return created;
}

async function recalc(tx: Tx, ctx: SessionContext, sheetId: string, weekStart: string, rules: TsRules) {
  const rows = await loadRows(tx, sheetId, weekStart);
  const t = computeTotals(rows, rules);
  await tx
    .update(timesheets)
    .set({ totalHours: t.total, overtimeHours: t.overtime, maxDayHours: t.maxDay })
    .where(eq(timesheets.id, sheetId));
  return { rows, totals: t };
}

/** ts.saveEntries: upsert changed rows and recalc totals. Draft / Returned only. */
export async function saveEntries(tx: Tx, ctx: SessionContext, raw: z.input<typeof saveEntriesInput>) {
  const input = saveEntriesInput.parse(raw);
  const rules = rulesFrom(await loadSettings(tx, ctx.companyId));
  const weekStart = weekStartFor(input.weekStart, rules.weekStart);
  const sheet = await getOrCreateEditable(tx, ctx, weekStart);
  const dates = weekDates(weekStart);

  const touched = [...input.removedRowKeys, ...input.rows.map((r) => r.key)];
  if (touched.length) {
    await tx
      .delete(timesheetEntries)
      .where(and(eq(timesheetEntries.timesheetId, sheet.id), inArray(timesheetEntries.rowKey, touched)));
  }
  const values = input.rows.flatMap((r) => {
    const cells = r.hours
      .map((h, d) => ({ h, d }))
      .filter(({ h, d }) => h > 0 || d === 0); // keep one cell so an empty row persists
    return cells.map(({ h, d }) => ({
      companyId: ctx.companyId,
      timesheetId: sheet.id,
      rowKey: r.key,
      projectId: r.projectId,
      costCodeId: r.costCodeId,
      workDate: dates[d],
      hours: h,
    }));
  });
  if (values.length) await tx.insert(timesheetEntries).values(values);
  if (input.note !== undefined) await tx.update(timesheets).set({ note: input.note }).where(eq(timesheets.id, sheet.id));

  const { totals } = await recalc(tx, ctx, sheet.id, weekStart, rules);
  return { timesheetId: sheet.id, totals, savedAt: new Date().toISOString() };
}

/** ts.copyLastWeek: copies rows (project + cost code), hours empty. */
export async function copyLastWeek(tx: Tx, ctx: SessionContext, input: { weekStart: string }) {
  const rules = rulesFrom(await loadSettings(tx, ctx.companyId));
  const weekStart = weekStartFor(dateSchema.parse(input.weekStart), rules.weekStart);
  const prev = await latestSheet(tx, ctx, addDays(weekStart, -7));
  if (!prev) return { copied: 0 };
  const prevRows = await loadRows(tx, prev.id, addDays(weekStart, -7));
  const sheet = await getOrCreateEditable(tx, ctx, weekStart);
  const existing = await loadRows(tx, sheet.id, weekStart);
  const have = new Set(existing.map((r) => `${r.projectId}:${r.costCodeId}`));
  const toCopy = prevRows.filter((r) => !have.has(`${r.projectId}:${r.costCodeId}`));
  if (toCopy.length) {
    await tx.insert(timesheetEntries).values(
      toCopy.map((r, i) => ({
        companyId: ctx.companyId,
        timesheetId: sheet.id,
        rowKey: `c${Date.now().toString(36)}${i}`,
        projectId: r.projectId,
        costCodeId: r.costCodeId,
        workDate: weekStart,
        hours: 0,
      })),
    );
  }
  return { copied: toCopy.length };
}

export type SubmitResult = { ok: true; message: string; warnings: SubmitIssue[] } | { ok: false; issues: SubmitIssue[] };

/** ts.submit: validate, status In approval, workflow.start('timesheet.submit') in one transaction. */
export async function submit(tx: Tx, ctx: ActionContext, input: { timesheetId: string; note?: string | null }): Promise<SubmitResult> {
  const settings = await loadSettings(tx, ctx.companyId);
  const rules = rulesFrom(settings);
  const [sheet] = await tx.select().from(timesheets).where(eq(timesheets.id, input.timesheetId)).for('update');
  if (!sheet || sheet.membershipId !== ctx.membershipId) throw new Error('Timesheet not found');
  if (sheet.status !== 'draft' && sheet.status !== 'returned') throw new Error(messages.lockedWeek);

  const note = input.note !== undefined ? input.note : sheet.note;
  const rows = await loadRows(tx, sheet.id, sheet.weekStart);
  const issues = validateSubmit(rows, rules, note, sheet.weekStart);
  if (issues.some((i) => i.level === 'error')) return { ok: false, issues };

  const totals = computeTotals(rows, rules);
  await tx
    .update(timesheets)
    .set({
      status: 'in_approval',
      note,
      submittedAt: new Date(),
      totalHours: totals.total,
      overtimeHours: totals.overtime,
      maxDayHours: totals.maxDay,
    })
    .where(eq(timesheets.id, sheet.id));

  const def = await boundWorkflow(tx, ctx.companyId);
  const result = await startWorkflow(
    tx,
    {
      companyId: ctx.companyId,
      kind: 'timesheet.submit',
      subjectId: sheet.id,
      definitionId: def.id,
      definition: def.definition,
      context: contextFor(ctx, rows, rules),
    },
    approverResolver(tx, ctx.companyId),
  );

  const week = weekNumber(sheet.weekStart);
  for (const task of result.createdTasks) {
    ctx.effects.timersToCreate.push(task);
    await emit(tx, ctx, 'approval.task_created', {
      taskId: task.id,
      email: email([task.approver.email], 'task_created', {
        approverName: task.approver.name,
        employeeName: ctx.name,
        week,
        totalHours: totals.total,
        overtimeHours: totals.overtime,
        dueAt: task.dueAt?.toISOString(),
        path: '/timesheet/approvals',
      }),
    });
  }
  await emit(tx, ctx, 'timesheet.submitted', { timesheetId: sheet.id });

  const first = result.createdTasks.map((t) => t.approver.name).join(' and ');
  return { ok: true, message: messages.submitted(week, first), warnings: issues };
}

export interface HistoryRow {
  id: string;
  weekStart: string;
  weekNumber: number;
  rangeLabel: string;
  total: number;
  overtime: number;
  status: TimesheetStatus;
  revision: number;
  whereItIs: string;
}

/** My history: every week I opened, with where it is now. */
export async function history(tx: Tx, ctx: SessionContext, input: { weeks?: number; status?: TimesheetStatus }) {
  const settings = await loadSettings(tx, ctx.companyId);
  const since = addDays(new Date().toISOString().slice(0, 10), -7 * (input.weeks ?? 12));
  const sheets = await tx
    .select()
    .from(timesheets)
    .where(
      and(
        eq(timesheets.membershipId, ctx.membershipId),
        gte(timesheets.weekStart, since),
        input.status ? eq(timesheets.status, input.status) : undefined,
      ),
    )
    .orderBy(desc(timesheets.weekStart), desc(timesheets.revision));

  const ids = sheets.map((s) => s.id);
  const instances = ids.length
    ? await tx
        .select()
        .from(workflowInstances)
        .where(inArray(workflowInstances.subjectId, ids))
        .orderBy(desc(workflowInstances.createdAt))
    : [];
  const allTasks = instances.length
    ? await tx.select().from(workflowTasks).where(inArray(workflowTasks.instanceId, instances.map((i) => i.id)))
    : [];
  const pending = allTasks.filter((t) => t.status === 'pending');
  const decidedTasks = allTasks.filter((t) => t.status !== 'pending');
  const people = await membersById(tx, [...pending.map((t) => t.assigneeId), ...decidedTasks.map((t) => t.decidedBy ?? t.assigneeId)]);

  const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: ctx.timezone }) : '');
  const hoursLeft = (d: Date | null) => (d ? Math.round((d.getTime() - Date.now()) / 3_600_000) : 0);

  return sheets.map<HistoryRow>((s) => {
    const inst = instances.find((i) => i.subjectId === s.id);
    let whereItIs = '';
    if (s.status === 'draft') {
      const deadline = deadlineDate(s.weekStart, settings.deadlineDow);
      whereItIs = `Not submitted. Due ${dayName(deadline)} ${dayLabel(deadline)}, ${settings.deadlineTime}`;
    } else if (s.status === 'in_approval' && inst) {
      const open = pending.filter((t) => t.instanceId === inst.id);
      const names = open.map((t) => `${people.get(t.assigneeId)?.name ?? 'approver'}${people.get(t.assigneeId)?.role === 'project_manager' ? ' (PM)' : ''}`);
      const due = open[0]?.dueAt ?? null;
      const left = hoursLeft(due);
      whereItIs = `Step ${inst.currentStep + 1}, ${names.join(', ')}, ${left >= 0 ? `due in ${left} h` : `${-left} h overdue`}`;
    } else if (s.status === 'returned') {
      whereItIs = `${s.returnedBy ?? 'Approver'}: "${s.returnComment ?? ''}"`;
    } else if (s.status === 'locked') {
      const last = decidedTasks.filter((t) => t.instanceId === inst?.id && t.status === 'approved').at(-1);
      whereItIs = `Approved ${fmtDate(s.approvedAt)} by ${last ? people.get(last.decidedBy ?? last.assigneeId)?.name : 'approver'}`;
    } else if (s.status === 'rejected') {
      const t = decidedTasks.find((x) => x.instanceId === inst?.id && x.status === 'rejected');
      whereItIs = `${t?.comment ?? 'Rejected'}. Rejected by ${t ? people.get(t.decidedBy ?? t.assigneeId)?.name : 'approver'}`;
    }
    return {
      id: s.id,
      weekStart: s.weekStart,
      weekNumber: weekNumber(s.weekStart),
      rangeLabel: weekRangeLabel(s.weekStart),
      total: s.totalHours,
      overtime: s.overtimeHours,
      status: s.status,
      revision: s.revision,
      whereItIs,
    };
  });
}

/** ts.requestCorrection: for a locked week; notifies company admins. */
export async function requestCorrection(tx: Tx, ctx: ActionContext, input: { timesheetId: string; reason: string }) {
  const reason = z.string().trim().min(3).max(1000).parse(input.reason);
  const [sheet] = await tx.select().from(timesheets).where(eq(timesheets.id, input.timesheetId));
  if (!sheet || sheet.membershipId !== ctx.membershipId) throw new Error('Timesheet not found');
  if (sheet.status !== 'locked') throw new Error('Only approved weeks need a correction request');
  const [cr] = await tx
    .insert(correctionRequests)
    .values({ companyId: ctx.companyId, timesheetId: sheet.id, reason })
    .returning();
  const admins = await membersWithRole(tx, ctx.companyId, 'company_admin');
  await emit(tx, ctx, 'timesheet.correction_requested', {
    correctionId: cr.id,
    email: email(admins.map((a) => a.email), 'correction_requested', {
      employeeName: ctx.name,
      week: weekNumber(sheet.weekStart),
      reason,
      path: '/timesheet/admin/users',
    }),
  });
  return { ok: true as const };
}
