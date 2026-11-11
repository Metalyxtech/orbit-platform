import { z } from 'zod';
import { audit, writePortalRole, type ActionContext, type SessionContext } from '@orbit/core';
import type { Tx } from '@orbit/db';
import { checkLibrary, FIELD_LIBRARY, INDUSTRY_INFO } from '../industries';
import { VIEW_ONLY_ROLES, PROC_ROLES, STAGES, TEMPLATES, configFromTemplate, roleLabel, type ProcConfig, type ProcRole, type StageKey } from '../config';
import { purchaseTeam } from './team';
import { PORTAL, loadConfig, requireAdmin, saveConfig } from './shared';

const roleIds = PROC_ROLES.map((r) => r.id) as [ProcRole, ...ProcRole[]];

export async function adminConfig(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  return {
    config: await loadConfig(tx, ctx.companyId),
    templates: Object.entries(TEMPLATES).map(([id, t]) => ({
      id,
      name: t.name,
      sector: INDUSTRY_INFO[id]?.sector ?? 'Services and general',
      desc: INDUSTRY_INFO[id]?.desc ?? '',
      header: t.header.map((f) => f.label),
      line: t.line.map((f) => f.label),
      options: t.options.map((o) => o.label),
    })),
    checks: checkLibrary(TEMPLATES).map((o) => ({ id: o.id, label: o.label, desc: o.desc, from: o.from })),
    fieldLibrary: FIELD_LIBRARY,
  };
}

async function update(
  tx: Tx,
  ctx: ActionContext,
  action: string,
  change: (c: ProcConfig) => ProcConfig,
  detail?: Record<string, unknown> | ((before: ProcConfig, after: ProcConfig) => Record<string, unknown>),
) {
  requireAdmin(ctx);
  const before = await loadConfig(tx, ctx.companyId);
  const next = change(before);
  const data = typeof detail === 'function' ? detail(before, next) : detail;
  await saveConfig(tx, ctx.companyId, next);
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: `procurement.${action}`, entity: 'proc_settings', entityId: ctx.companyId, data: data ?? null, requestId: ctx.requestId });
  return next;
}

/** Replaces form, stages and industry options with a template. Approval levels, money and numbering are kept. */
export async function applyTemplate(tx: Tx, ctx: ActionContext, raw: { template: string }) {
  const { template } = z.object({ template: z.enum(Object.keys(TEMPLATES) as [string, ...string[]]) }).parse(raw);
  await update(tx, ctx, 'template', (c) => ({ ...configFromTemplate(template, c), covers: c.covers }), (b, a) => ({ summary: [`Industry form changed from ${TEMPLATES[b.template]?.name ?? 'custom'} to ${TEMPLATES[a.template]?.name}`] }));
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
  }), workflowChanges);
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
  await update(tx, ctx, 'form', (c) => ({ ...c, form: input }), (b, a) => ({ summary: fieldChanges(b.form, a.form) }));
  return { ok: true as const };
}

const levelsInput = z
  .array(
    z.object({
      id: z.string().min(1).max(20),
      name: z.string().trim().min(1, 'Name every level').max(60),
      role: z.enum(roleIds).refine((r) => !VIEW_ONLY_ROLES.includes(r), 'The GM does not approve: give the level to the purchase manager (the GM can stop a request and comment)'),
      min: z.number().min(0),
      pr: z.boolean(),
      po: z.boolean(),
    }),
  )
  .max(8);

export async function saveLevels(tx: Tx, ctx: ActionContext, raw: z.input<typeof levelsInput>) {
  const levels = levelsInput.parse(raw);
  await update(tx, ctx, 'levels', (c) => ({ ...c, levels }), (_b, a) => ({ summary: a.levels.map((l) => `${l.name} (${roleLabel(l.role)}) from ${a.money.currency}${l.min.toLocaleString('en-US')}${l.pr ? ', requisitions' : ''}${l.po ? ', POs' : ''}`) }));
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
  await update(tx, ctx, 'money', (c) => ({ ...c, money: { currency: m.currency, taxName: m.taxName, taxRate: m.taxRate, tolerance: m.tolerance }, numbering: { prPrefix: m.prPrefix, poPrefix: m.poPrefix } }), (b, a) => ({
    summary: [
      ...(['currency', 'taxName', 'taxRate', 'tolerance'] as const).filter((k) => b.money[k] !== a.money[k]).map((k) => `${k}: ${b.money[k]} → ${a.money[k]}`),
      ...(['prPrefix', 'poPrefix'] as const).filter((k) => b.numbering[k] !== a.numbering[k]).map((k) => `${k}: ${b.numbering[k]} → ${a.numbering[k]}`),
    ],
  }));
  return { ok: true as const };
}

export async function rolesOverview(tx: Tx, ctx: SessionContext) {
  requireAdmin(ctx);
  const [team, config] = await Promise.all([purchaseTeam(tx, ctx), loadConfig(tx, ctx.companyId)]);
  // Roles the workflow needs: stage owners and approval levels.
  const needed = new Set<ProcRole>(['requester', 'buyer', 'store']);
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
  await audit(tx, { companyId: ctx.companyId, actorId: ctx.membershipId, action: 'procurement.role', entity: 'memberships', entityId: m.membershipId, data: { summary: [`${m.name}: ${roleLabel(m.purchaseRole)} → ${roleLabel(input.role)}`] }, requestId: ctx.requestId });
  return { role: input.role };
}

export type StageKeyList = StageKey[];

/** Adds an industry check from any industry to this company (switched on). */
export async function addIndustryCheck(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const { id } = z.object({ id: z.string().min(1).max(40) }).parse(raw);
  const lib = checkLibrary(TEMPLATES).find((o) => o.id === id);
  if (!lib) throw new Error('Unknown industry check');
  await update(tx, ctx, 'check.add', (c) => (c.options.some((o) => o.id === id) ? c : { ...c, options: [...c.options, { ...lib, from: undefined, on: true } as ProcConfig['options'][number]] }), { summary: [`Added industry check: ${lib.label}`] });
  return { ok: true as const };
}

/** Removes an industry check from this company. */
export async function removeIndustryCheck(tx: Tx, ctx: ActionContext, raw: { id: string }) {
  const { id } = z.object({ id: z.string().min(1).max(40) }).parse(raw);
  await update(tx, ctx, 'check.remove', (c) => ({ ...c, options: c.options.filter((o) => o.id !== id) }), (b) => ({ summary: [`Removed industry check: ${b.options.find((o) => o.id === id)?.label ?? id}`] }));
  return { ok: true as const };
}

/** Roles a purchase admin also covers, when nobody else in the company holds them. */
export async function setAdminCovers(tx: Tx, ctx: ActionContext, raw: { membershipId: string; roles: string[] }) {
  requireAdmin(ctx);
  const input = z.object({ membershipId: z.uuid(), roles: z.array(z.enum(roleIds)).max(8) }).parse(raw);
  const m = (await purchaseTeam(tx, ctx)).find((x) => x.membershipId === input.membershipId);
  if (!m) throw new Error('Person not found');
  if (m.companyRole !== 'company_admin') throw new Error('Only company admins can cover other purchase roles');
  const roles = [...new Set(input.roles.filter((r) => r !== 'admin'))];
  await update(tx, ctx, 'covers', (c) => ({ ...c, covers: { ...(c.covers ?? {}), [m.membershipId]: roles } }), { summary: [roles.length ? `${m.name} now also covers: ${roles.map(roleLabel).join(', ')}` : `${m.name} no longer covers other roles`] });
  return { roles };
}

// ---------- change summaries for the Change history page ----------

function workflowChanges(b: ProcConfig, a: ProcConfig) {
  const out: string[] = [];
  for (const k of Object.keys(a.flow) as (keyof ProcConfig['flow'])[]) if (b.flow[k] !== a.flow[k]) out.push(`${STAGES[k].label} switched ${a.flow[k] ? 'on' : 'off'}`);
  for (const k of Object.keys(STAGES) as StageKey[]) {
    const bl = b.stageCfg[k]?.label || STAGES[k].label;
    const al = a.stageCfg[k]?.label || STAGES[k].label;
    if (bl !== al) out.push(`Stage renamed: ${bl} → ${al}`);
    const br = b.stageCfg[k]?.role;
    const ar = a.stageCfg[k]?.role;
    if (br !== ar && ar) out.push(`${al} now handled by ${roleLabel(ar)}`);
  }
  if (b.minQuotes !== a.minQuotes) out.push(`Minimum quotes: ${b.minQuotes} → ${a.minQuotes}`);
  for (const o of a.options) {
    const was = b.options.find((x) => x.id === o.id)?.on;
    if (was !== undefined && was !== o.on) out.push(`${o.label} switched ${o.on ? 'on' : 'off'}`);
  }
  return { summary: out.length ? out : ['Saved with no changes'] };
}

function fieldChanges(b: ProcConfig['form'], a: ProcConfig['form']) {
  const out: string[] = [];
  for (const [sec, name] of [['header', 'request field'], ['line', 'line field']] as const) {
    const bl = b[sec].map((f) => f.label);
    const al = a[sec].map((f) => f.label);
    for (const l of al.filter((x) => !bl.includes(x))) out.push(`Added ${name}: ${l}`);
    for (const l of bl.filter((x) => !al.includes(x))) out.push(`Removed ${name}: ${l}`);
    for (const f of a[sec]) {
      const old = b[sec].find((x) => x.label === f.label);
      if (old && (old.type !== f.type || old.required !== f.required || old.options !== f.options)) out.push(`Changed ${name}: ${f.label}`);
    }
  }
  if (b.name !== a.name) out.push(`Form name: ${b.name} → ${a.name}`);
  if (b.unit !== a.unit) out.push(`Default unit: ${b.unit} → ${a.unit}`);
  return out.length ? out : ['Saved with no changes'];
}
