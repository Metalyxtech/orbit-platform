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
  /** For portals with their own roles (see PortalManifest.portalRoles): who sees this item. */
  portalRoles?: string[];
  badge?: 'approvals';
  /** Drop-down in the sidebar this page sits in (omitted = a main menu item). */
  menu?: string;
}

/** A role inside one portal (for example Purchase: buyer, storekeeper), set per person by the company admin. */
export interface PortalRoleDef {
  id: string;
  label: string;
  detail: string;
}

export interface PortalManifest {
  id: string; // url segment, e.g. 'timesheet'
  name: string;
  workflowKind: string; // e.g. 'timesheet.submit'
  defaultWorkflowKey: string;
  nav: PortalNavItem[];
  settingsSchema: SettingsSchema;
  /** Roles inside this portal. Omitted = the portal uses the company roles only. */
  portalRoles?: PortalRoleDef[];
  /** The portal role a person has when the admin has not set one. */
  defaultPortalRole?: (role: MemberRole) => string;
}

/** The portal role this person acts as: the admin's choice, or the portal's default for their company role. */
export function portalRoleFor(manifest: PortalManifest, role: MemberRole, stored: string | null | undefined): string | null {
  if (!manifest.portalRoles) return null;
  const fallback = manifest.defaultPortalRole?.(role) ?? manifest.portalRoles[0].id;
  if (role === 'company_admin') return fallback;
  return stored && manifest.portalRoles.some((r) => r.id === stored) ? stored : fallback;
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

/**
 * Portals a person without portal rows (joined before per-person portals) still gets. Newer
 * portals, such as Purchase, are opt-in: the company admin requests them per person.
 */
export const LEGACY_PORTALS = ['timesheet'];
/** True when a person with no portal rows can use this portal. */
export const legacyPortal = (portal: string) => LEGACY_PORTALS.includes(portal);

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
