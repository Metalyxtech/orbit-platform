import { portalRoleFor, readPortalRoles, type SessionContext } from '@orbit/core';
import type { Tx } from '@orbit/db';
import { portalModules } from './portals';

/** This person's role inside each portal that has portal roles (null for portals without them). */
export async function portalRolesFor(tx: Tx, ctx: SessionContext, portals: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const p of portals) {
    const m = portalModules[p]?.manifest;
    if (!m?.portalRoles) {
      out[p] = null;
      continue;
    }
    const stored = (await readPortalRoles(tx, p, [ctx.membershipId])).get(ctx.membershipId);
    out[p] = portalRoleFor(m, ctx.role, stored);
  }
  return out;
}

/** Queue badge count per portal. */
export async function queueCounts(tx: Tx, ctx: SessionContext, portals: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const p of portals) out[p] = (await portalModules[p]?.queueCount?.(tx, ctx)) ?? 0;
  return out;
}
