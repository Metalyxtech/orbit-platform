import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit, settingsValidator, upsertWeeklyReminder, type ActionContext, type SessionContext } from '@orbit/core';
import {
  companyPortals,
  correctionRequests,
  costCodes,
  memberships,
  projects,
  timesheetEntries,
  timesheets,
  tsSettings,
  users,
  workflowDefinitions,
  type Tx,
} from '@orbit/db';
import { addDays, weekNumber, weekStartFor } from '../calc';
import { timesheetManifest } from '../manifest';
import { assertRole, boundWorkflow, loadSettings, membersById } from './shared';

// ---------- Timesheet settings (form generated from manifest.settingsSchema) ----------

export async function getSettings(tx: Tx, ctx: SessionContext) {
  assertRole(ctx, 'company_admin');
  const [settings, wf] = await Promise.all([loadSettings(tx, ctx.companyId), boundWorkflow(tx, ctx.companyId)]);
  return {
    values: settings,
    workflow: { id: wf.id, name: wf.name, version: wf.version, description: wf.description },
    workflows: await listWorkflows(tx),
    timezone: ctx.timezone,
  };
}

// ---------- Approval workflow (chosen from the Orbit library) ----------

/** Latest version of every Timesheet workflow in the library. */
export async function listWorkflows(tx: Tx) {
  const rows = await tx
    .select({ id: workflowDefinitions.id, key: workflowDefinitions.key, version: workflowDefinitions.version, name: workflowDefinitions.name, description: workflowDefinitions.description, definition: workflowDefinitions.definition })
    .from(workflowDefinitions)
    .where(sql`${workflowDefinitions.key} like 'timesheet.%'`)
    .orderBy(asc(workflowDefinitions.key), desc(workflowDefinitions.version));
  const latest = rows.filter((r, i) => i === 0 || rows[i - 1].key !== r.key);
  return latest.map(({ definition, ...r }) => ({
    ...r,
    steps: (definition as { steps: { name: string; reason?: string }[] }).steps.map((st) => (st.reason ? `${st.name} (${st.reason.toLowerCase()})` : st.name)),
  }));
}

/** Binds a library workflow to this company's Timesheet portal. Timesheets already in approval keep their route. */
export async function setWorkflow(tx: Tx, ctx: ActionContext, input: { workflowDefinitionId: string }) {
  assertRole(ctx, 'company_admin');
  const id = z.uuid().parse(input.workflowDefinitionId);
  const [def] = await tx.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, id));
  if (!def || !def.key.startsWith('timesheet.')) throw new Error('Choose a Timesheet workflow');
  await tx
    .insert(companyPortals)
    .values({ companyId: ctx.companyId, portal: timesheetManifest.id, enabled: true, workflowDefinitionId: id })
    .onConflictDoUpdate({ target: [companyPortals.companyId, companyPortals.portal], set: { workflowDefinitionId: id } });
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'workflow.bind',
    entity: 'company_portals',
    entityId: ctx.companyId,
    data: { key: def.key, version: def.version },
    requestId: ctx.requestId,
  });
  return { ok: true as const };
}

const validator = settingsValidator(timesheetManifest.settingsSchema);

/** tsSettings.update: validated with Zod, audited, and the weekly reminder timer is moved. */
export async function updateSettings(tx: Tx, ctx: ActionContext, raw: unknown) {
  assertRole(ctx, 'company_admin');
  const v = validator.parse(raw) as Omit<typeof tsSettings.$inferInsert, 'companyId'>;
  const before = await loadSettings(tx, ctx.companyId);
  await tx
    .insert(tsSettings)
    .values({ ...v, companyId: ctx.companyId })
    .onConflictDoUpdate({ target: tsSettings.companyId, set: v });
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'ts_settings.update',
    entity: 'ts_settings',
    entityId: ctx.companyId,
    data: { before, after: v },
    requestId: ctx.requestId,
  });
  ctx.effects.after.push(() =>
    upsertWeeklyReminder(ctx.companyId, v.reminderDow ?? 6, v.reminderTime ?? '16:00', ctx.timezone),
  );
  return { ok: true as const };
}

// ---------- Projects and cost codes ----------

export async function listProjects(tx: Tx, ctx: SessionContext) {
  assertRole(ctx, 'company_admin');
  const rows = await tx
    .select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status, pmId: projects.pmId })
    .from(projects)
    .orderBy(asc(projects.code));
  const counts = await tx
    .select({ projectId: costCodes.projectId, n: sql<number>`count(*)::int` })
    .from(costCodes)
    .groupBy(costCodes.projectId);
  const pms = await membersById(tx, rows.map((r) => r.pmId).filter((x): x is string => !!x));
  return rows.map((r) => ({
    ...r,
    costCodes: counts.find((c) => c.projectId === r.id)?.n ?? 0,
    pm: r.pmId ? (pms.get(r.pmId)?.name ?? '') : 'Company admin',
  }));
}

export interface CsvPreviewRow {
  line: number;
  projectCode: string;
  projectName: string;
  pmEmail: string;
  costCode: string;
  costCodeName: string;
  errors: string[];
}

const HEADER = ['project_code', 'project_name', 'pm_email', 'cost_code', 'cost_code_name'];

/** Minimal RFC 4180 parser (quoted fields, commas and new lines inside quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

/** costCodes.importCsv: dryRun returns a per-row preview with errors; otherwise upserts. */
export async function importCsv(tx: Tx, ctx: ActionContext, input: { csv: string; dryRun: boolean }) {
  assertRole(ctx, 'company_admin');
  const rows = parseCsv(z.string().max(1_000_000).parse(input.csv));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase());
  if (!header || HEADER.some((h, i) => header[i] !== h)) {
    return { ok: false as const, error: `The first line must be: ${HEADER.join(',')}`, preview: [] };
  }

  const people = await tx
    .select({ id: memberships.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.companyId, ctx.companyId));
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.id]));

  const seen = new Set<string>();
  const preview: CsvPreviewRow[] = rows.map((r, i) => {
    const [projectCode = '', projectName = '', pmEmail = '', costCode = '', costCodeName = ''] = r.map((c) => c.trim());
    const errors: string[] = [];
    if (!projectCode) errors.push('project_code is empty');
    if (!projectName) errors.push('project_name is empty');
    if (pmEmail && !byEmail.has(pmEmail.toLowerCase())) errors.push(`${pmEmail} is not a user in this company`);
    if (!costCode) errors.push('cost_code is empty');
    if (!costCodeName) errors.push('cost_code_name is empty');
    const key = `${projectCode}/${costCode}`;
    if (seen.has(key)) errors.push('Duplicate row');
    seen.add(key);
    return { line: i + 2, projectCode, projectName, pmEmail, costCode, costCodeName, errors };
  });

  const hasErrors = preview.some((p) => p.errors.length);
  if (input.dryRun || hasErrors) return { ok: !hasErrors, preview, imported: 0 };

  let imported = 0;
  for (const p of preview) {
    const pmId = p.pmEmail ? byEmail.get(p.pmEmail.toLowerCase()) : null;
    const [proj] = await tx
      .insert(projects)
      .values({ companyId: ctx.companyId, code: p.projectCode, name: p.projectName, pmId })
      .onConflictDoUpdate({ target: [projects.companyId, projects.code], set: { name: p.projectName, pmId } })
      .returning();
    const [existing] = await tx
      .select({ id: costCodes.id })
      .from(costCodes)
      .where(and(eq(costCodes.projectId, proj.id), eq(costCodes.code, p.costCode)));
    if (existing) await tx.update(costCodes).set({ name: p.costCodeName, active: true }).where(eq(costCodes.id, existing.id));
    else await tx.insert(costCodes).values({ companyId: ctx.companyId, projectId: proj.id, code: p.costCode, name: p.costCodeName });
    imported++;
  }
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'cost_codes.import_csv',
    entity: 'cost_codes',
    data: { rows: imported },
    requestId: ctx.requestId,
  });
  return { ok: true as const, preview, imported };
}

// ---------- Users ----------

export async function listUsers(tx: Tx, ctx: SessionContext) {
  assertRole(ctx, 'company_admin');
  const rows = await tx
    .select({
      membershipId: memberships.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      title: memberships.title,
      status: memberships.status,
      supervisorId: memberships.supervisorId,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.companyId, ctx.companyId))
    .orderBy(asc(memberships.status), asc(users.name));
  const names = new Map(rows.map((r) => [r.membershipId, r.name]));
  return rows.map((r) => ({ ...r, supervisor: r.supervisorId ? (names.get(r.supervisorId) ?? '') : '' }));
}

const memberUpdate = z.object({
  membershipId: z.uuid(),
  role: z.enum(['employee', 'supervisor', 'project_manager', 'company_admin']).optional(),
  status: z.enum(['pending', 'active', 'disabled']).optional(),
  title: z.string().max(100).nullable().optional(),
  supervisorId: z.uuid().nullable().optional(),
});

export async function updateMember(tx: Tx, ctx: ActionContext, raw: z.input<typeof memberUpdate>) {
  assertRole(ctx, 'company_admin');
  const { membershipId, ...set } = memberUpdate.parse(raw);
  if (set.supervisorId === membershipId) throw new Error('A person cannot be their own supervisor');
  await tx.update(memberships).set(set).where(and(eq(memberships.id, membershipId), eq(memberships.companyId, ctx.companyId)));
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'membership.update',
    entity: 'memberships',
    entityId: membershipId,
    data: set,
    requestId: ctx.requestId,
  });
  return { ok: true as const };
}

const memberAdd = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['employee', 'supervisor', 'project_manager', 'company_admin']),
  title: z.string().trim().max(100).optional(),
  supervisorId: z.uuid().nullable().optional(),
});

/** Adds a person to this company. They sign in with that email and land straight in the company. */
export async function addMember(tx: Tx, ctx: ActionContext, raw: z.input<typeof memberAdd>) {
  assertRole(ctx, 'company_admin');
  const input = memberAdd.parse(raw);
  // users is identity (no RLS). A placeholder WorkOS id is replaced at first sign-in, matched by email.
  await tx
    .insert(users)
    .values({ workosUserId: `invited|${input.email}`, email: input.email, name: input.name })
    .onConflictDoNothing({ target: users.email });
  const [user] = await tx.select().from(users).where(eq(users.email, input.email));
  const [existing] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.companyId, ctx.companyId), eq(memberships.userId, user.id)));
  if (existing) throw new Error(`${input.email} is already in this company`);
  const [m] = await tx
    .insert(memberships)
    .values({
      companyId: ctx.companyId,
      userId: user.id,
      role: input.role,
      title: input.title || null,
      supervisorId: input.supervisorId ?? null,
      status: 'active',
    })
    .returning({ id: memberships.id });
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'membership.add',
    entity: 'memberships',
    entityId: m.id,
    data: { email: input.email, role: input.role },
    requestId: ctx.requestId,
  });
  return { ok: true as const };
}

// ---------- Correction requests ----------

export async function listCorrections(tx: Tx, ctx: SessionContext) {
  assertRole(ctx, 'company_admin');
  const rows = await tx
    .select({
      id: correctionRequests.id,
      reason: correctionRequests.reason,
      createdAt: correctionRequests.createdAt,
      weekStart: timesheets.weekStart,
      employee: users.name,
    })
    .from(correctionRequests)
    .innerJoin(timesheets, eq(timesheets.id, correctionRequests.timesheetId))
    .innerJoin(memberships, eq(memberships.id, timesheets.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(correctionRequests.status, 'open'))
    .orderBy(desc(correctionRequests.createdAt));
  return rows.map((r) => ({ ...r, week: weekNumber(r.weekStart), createdAt: r.createdAt.toISOString() }));
}

/** Approving reopens the week as a new revision (draft copy); the approved version stays on record. */
export async function decideCorrection(tx: Tx, ctx: ActionContext, input: { id: string; approve: boolean }) {
  assertRole(ctx, 'company_admin');
  const [cr] = await tx.select().from(correctionRequests).where(eq(correctionRequests.id, input.id)).for('update');
  if (!cr || cr.status !== 'open') throw new Error('This request was already decided');
  await tx
    .update(correctionRequests)
    .set({ status: input.approve ? 'approved' : 'declined', decidedBy: ctx.membershipId, decidedAt: new Date() })
    .where(eq(correctionRequests.id, cr.id));
  if (!input.approve) return { ok: true as const };

  const [old] = await tx.select().from(timesheets).where(eq(timesheets.id, cr.timesheetId));
  const [copy] = await tx
    .insert(timesheets)
    .values({
      companyId: ctx.companyId,
      membershipId: old.membershipId,
      weekStart: old.weekStart,
      revision: old.revision + 1,
      totalHours: old.totalHours,
      overtimeHours: old.overtimeHours,
      maxDayHours: old.maxDayHours,
      note: old.note,
      createdStage: ctx.companyStage,
    })
    .returning();
  const entries = await tx.select().from(timesheetEntries).where(eq(timesheetEntries.timesheetId, old.id));
  if (entries.length) {
    await tx.insert(timesheetEntries).values(entries.map(({ id: _id, ...e }) => ({ ...e, timesheetId: copy.id })));
  }
  await audit(tx, {
    companyId: ctx.companyId,
    actorId: ctx.membershipId,
    action: 'timesheet.correction_approved',
    entity: 'timesheets',
    entityId: copy.id,
    data: { from: old.id, revision: copy.revision },
    requestId: ctx.requestId,
  });
  return { ok: true as const };
}

// ---------- Team overview ----------

export async function teamOverview(tx: Tx, ctx: SessionContext, input: { weekStart?: string }) {
  assertRole(ctx, 'supervisor', 'project_manager');
  const settings = await loadSettings(tx, ctx.companyId);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone });
  const weekStart = weekStartFor(input.weekStart ?? addDays(today, -7), settings.weekStart);
  const team = await tx
    .select({ membershipId: memberships.id, name: users.name, title: memberships.title })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.companyId, ctx.companyId),
        eq(memberships.status, 'active'),
        ctx.role === 'company_admin' ? undefined : eq(memberships.supervisorId, ctx.membershipId),
      ),
    )
    .orderBy(asc(users.name));
  const sheets = team.length
    ? await tx
        .select()
        .from(timesheets)
        .where(and(eq(timesheets.weekStart, weekStart), inArray(timesheets.membershipId, team.map((t) => t.membershipId))))
        .orderBy(desc(timesheets.revision))
    : [];
  return {
    weekStart,
    week: weekNumber(weekStart),
    rows: team.map((m) => {
      const s = sheets.find((x) => x.membershipId === m.membershipId);
      return { ...m, status: s?.status ?? ('not_started' as const), total: s?.totalHours ?? 0, overtime: s?.overtimeHours ?? 0 };
    }),
  };
}
