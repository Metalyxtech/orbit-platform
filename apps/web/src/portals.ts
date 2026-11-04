import type { ReactNode } from 'react';
import type { SessionContext } from '@orbit/core';
import type { PortalManifest } from '@orbit/core/portals';
import type { Tx } from '@orbit/db';
import { procurementManifest } from '@orbit/portal-procurement/manifest';
import { procurementRoutes } from '@orbit/portal-procurement/routes';
import { requests as procRequests } from '@orbit/portal-procurement/server';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';
import { timesheetRoutes } from '@orbit/portal-timesheet/routes';
import { approvals } from '@orbit/portal-timesheet/server';

type Screen = (props: { searchParams: Record<string, string | string[] | undefined> }) => Promise<ReactNode>;

export interface PortalModule {
  manifest: PortalManifest;
  routes: Record<string, Screen>;
  /** Number shown on the menu badge (things waiting for this person). */
  queueCount?: (tx: Tx, ctx: SessionContext) => Promise<number>;
}

/** Portal registry: add new portals here (copy portals/_template). */
export const portalModules: Record<string, PortalModule> = {
  timesheet: {
    manifest: timesheetManifest,
    routes: timesheetRoutes,
    queueCount: (tx, ctx) => (ctx.role === 'employee' ? Promise.resolve(0) : approvals.countMine(tx, ctx)),
  },
  procurement: { manifest: procurementManifest, routes: procurementRoutes, queueCount: (tx, ctx) => procRequests.countMyQueue(tx, ctx) },
};

export const BRAND = 'Orbit';
