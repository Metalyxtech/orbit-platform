import { z } from 'zod';
import type { MemberRole } from './workflow/types';

/** One settings field. The Company Admin settings form is generated from these (Screen 11.4). */
export type SettingsField = { key: string; label: string; help?: string } & (
  | { type: 'segmented'; options: { value: string | number; label: string }[] }
  | { type: 'select'; options: { value: string | number; label: string }[]; multiple?: boolean }
  | { type: 'number'; min: number; max: number; step: number; unit?: string }
  | { type: 'time' }
  | { type: 'toggle' }
);

export interface SettingsSchema {
  groups: { title: string; fields: SettingsField[] }[];
}

export interface PortalNavItem {
  path: string; // relative to /<portal>
  label: string;
  section: 'main' | 'admin';
  roles?: MemberRole[]; // omitted = everyone
  badge?: 'approvals';
}

export interface PortalManifest {
  id: string; // url segment, e.g. 'timesheet'
  name: string;
  workflowKind: string; // e.g. 'timesheet.submit'
  defaultWorkflowKey: string;
  nav: PortalNavItem[];
  settingsSchema: SettingsSchema;
}

/** Builds the server-side validator for a settings schema. */
export function settingsValidator(schema: SettingsSchema) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of schema.groups.flatMap((g) => g.fields)) {
    switch (f.type) {
      case 'number':
        shape[f.key] = z.coerce
          .number()
          .min(f.min)
          .max(f.max)
          .refine((v) => Math.abs(v / f.step - Math.round(v / f.step)) < 1e-9, `Use steps of ${f.step}`);
        break;
      case 'toggle':
        shape[f.key] = z.boolean();
        break;
      case 'time':
        shape[f.key] = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
        break;
      case 'segmented':
      case 'select': {
        const values = f.options.map((o) => o.value);
        const one = z.union(values.map((v) => z.literal(v)) as [z.ZodLiteral, z.ZodLiteral, ...z.ZodLiteral[]]);
        shape[f.key] = f.type === 'select' && f.multiple ? z.array(one) : one;
        break;
      }
    }
  }
  return z.object(shape);
}

const registry = new Map<string, PortalManifest>();

export function registerPortal(manifest: PortalManifest) {
  registry.set(manifest.id, manifest);
}

export function getPortal(id: string) {
  return registry.get(id);
}

export function listPortals() {
  return [...registry.values()];
}
