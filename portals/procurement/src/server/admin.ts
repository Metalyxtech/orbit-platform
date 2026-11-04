import { z } from 'zod';
import { audit, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import type { Tx } from '@orbit/db';
import { PROC_ROLES, TEMPLATES, configFromTemplate, type ProcConfig, type ProcRole, type StageKey } from '../config';
import { purchaseTeam } from './team';
import { PORTAL, loadConfig, requireAdmin, saveConfig } from './shared';

const roleIds = PROC_ROLES.map((r) => r.id) as [ProcRole, ...ProcRole[]];

export async function adminConfig(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  return {
    config: await loadConfig(tx, ctx.companyId),
    templates: Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, header: t.header.map((f) => f.label), line: t.line.map((f) => f.label), options: t.options.map((o) => o.label) })),
  };
}

async function update(tx: Tx, ctx: ActionContext, action: string, change: (c: ProcConfig) => ProcConfig) {
  requireAdmin(ctx);
  const next = change(await loadConfig(tx, ctx.companyId));
  await saveConfig(tx, ctx.companyId, next);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: `procurement.${action}`, entity: 'proc_settings', entityId: ctx.companyId, requestId: ctx.requestId });
  return next;
}

/** Replaces form, stages and industry options with a template. Approval levels, money and numbering are kept. */
export async function applyTemplate(tx: Tx, ctx: ActionContext, raw: { template: string }) {
  const { template } = z.object({ template: z.enum(Object.keys(TEMPLATES) as [string, ...string[]]) }).parse(raw);
  await update(tx, ctx, 'template', (c) => configFromTemplate(template, c));
  return { ok: true as const };
}

const workflowInput = z.object({
  flow: z.object({ stock_check: z.boolean(), pr_approval: z.boolean(), po_approval: z.boolean(), receiving: z.boolean(), inspection: z.boolean(), invoice: z.boolean() }),
  stageCfg: z.record(z.string(), z.object({ label: z.string().trim().max(60).optional(), role: z.enum(roleIds).optional() })),
  minQuotes: z.number().int().min(1).max(6),
  options: z.record(z.string(), z.boolean()),
});

export async function saveWorkflow(tx: Tx, ctx: ActionContext, raw: z.input<typeof workflowInput>) {
  const input = workflowInput.parse(raw);
  await update(tx, ctx, 'workflow', (c) => ({
    ...c,
    flow: input.flow,
    stageCfg: Object.fromEntries(Object.entries(input.stageCfg).map(([k, v]) => [k, { label: v.label || undefined, role: v.role }])) as ProcConfig['stageCfg'],
    minQuotes: input.minQuotes,
    options: c.options.map((o) => ({ ...o, on: input.options[o.id] ?? o.on })),
  }));
  return { ok: true as const };
}

const fieldInput = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().trim().min(1, 'Every field needs a label').max(80),
  type: z.enum(['text', 'number', 'select', 'date', 'check']),
  options: z.string().max(500),
  required: z.boolean(),
});
const formInput = z.object({ name: z.string().trim().min(2).max(100), unit: z.string().trim().min(1).max(20), header: z.array(fieldInput).max(20), line: z.array(fieldInput).max(12) });

export async function saveForm(tx: Tx, ctx: ActionContext, raw: z.input<typeof formInput>) {
  const input = formInput.parse(raw);
  for (const f of [...input.header, ...input.line]) if (f.type === 'select' && !f.options.split(',').some((o) => o.trim())) throw new Error(`Add the choices for the dropdown "${f.label}"`);
  await update(tx, ctx, 'form', (c) => ({ ...c, form: input }));
  return { ok: true as const };
}

const levelsInput = z
  .array(z.object({ id: z.string().min(1).max(20), name: z.string().trim().min(1, 'Name every level').max(60), role: z.enum(roleIds), min: z.number().min(0), pr: z.boolean(), po: z.boolean() }))
  .max(8);

export async function saveLevels(tx: Tx, ctx: ActionContext, raw: z.input<typeof levelsInput>) {
  const levels = levelsInput.parse(raw);
  await update(tx, ctx, 'levels', (c) => ({ ...c, levels }));
  return { ok: true as const };
}

const moneyInput = z.object({
  currency: z.string().trim().min(1).max(5),
  taxName: z.string().trim().min(1).max(20),
  taxRate: z.number().min(0).max(50),
  tolerance: z.number().min(0).max(20),
  prPrefix: z.string().trim().regex(/^[A-Z0-9]{1,6}$/, 'Prefixes use 1 to 6 capital letters or digits'),
  poPrefix: z.string().trim().regex(/^[A-Z0-9]{1,6}$/, 'Prefixes use 1 to 6 capital letters or digits'),
});

export async function saveMoney(tx: Tx, ctx: ActionContext, raw: z.input<typeof moneyInput>) {
  const m = moneyInput.parse(raw);
  await update(tx, ctx, 'money', (c) => ({ ...c, money: { currency: m.currency, taxName: m.taxName, taxRate: m.taxRate, tolerance: m.tolerance }, numbering: { prPrefix: m.prPrefix, poPrefix: m.poPrefix } }));
  return { ok: true as const };
}

export async function rolesOverview(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  const [team, config] = await Promise.all([purchaseTeam(tx, ctx), loadConfig(tx, ctx.companyId)]);
  // Roles the workflow needs: stage owners and approval levels.
  const needed = new Set<ProcRole>(['requester', 'buyer', 'store']);
  if (config.flow.inspection) needed.add('qc');
  if (config.flow.invoice) needed.add('accounts');
  for (const l of config.levels) needed.add(l.role);
  for (const v of Object.values(config.stageCfg)) if (v?.role) needed.add(v.role);
  return { team, needed: [...needed] };
}

export async function setPurchaseRole(tx: Tx, ctx: ActionContext, raw: { membershipId: string; role: string }) {
  requireAdmin(ctx);
  const input = z.object({ membershipId: z.uuid(), role: z.enum(roleIds) }).parse(raw);
  const team = await purchaseTeam(tx, ctx);
  const m = team.find((x) => x.membershipId === input.membershipId);
  if (!m) throw new Error('Person not found');
  if (m.companyRole === 'company_admin') throw new Error('Company admins are always purchase admins');
  if (input.role === 'admin') throw new Error('Make the person a company admin to give them purchase admin');
  const ok = await writePortalRole(tx, { companyId: ctx.companyId, membershipId: m.membershipId, portal: PORTAL, role: input.role });
  if (!ok) throw new Error('Purchase roles switch on after the latest database update.');
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'procurement.role', entity: 'memberships', entityId: m.membershipId, data: { role: input.role }, requestId: ctx.requestId });
  return { role: input.role };
}

export type StageKeyList = StageKey[];
