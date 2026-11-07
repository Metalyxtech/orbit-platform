import type { ReactNode } from 'react';
import type { SessionContext } from '@orbit/core';
import type { PortalManifest } from '@orbit/core/portals';
import type { Tx } from '@orbit/db';
import { custom1Manifest } from '@orbit/portal-custom-1/manifest';
import { custom1Routes } from '@orbit/portal-custom-1/routes';
import { procurementManifest } from '@orbit/portal-procurement/manifest';
import { procurementRoutes } from '@orbit/portal-procurement/routes';
import { requests as procRequests } from '@orbit/portal-procurement/server';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';
import { timesheetRoutes } from '@orbit/portal-timesheet/routes';
import { approvals } from '@orbit/portal-timesheet/server';

type Screen = (props: { searchParams: Record<string, string | string[] | undefined> }) => Promise<ReactNode>;

/** One thing waiting for the signed-in person (shown in the notification pop-up). */
export interface InboxItem {
  id: string;
  portal: string;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}

export interface PortalModule {
  manifest: PortalManifest;
  routes: Record<string, Screen>;
  /** Number shown on the menu badge (things waiting for this person). */
  queueCount?: (tx: Tx, ctx: SessionContext) => Promise<number>;
  /** The items behind that count, for the notification pop-up. */
  inboxItems?: (tx: Tx, ctx: SessionContext) => Promise<InboxItem[]>;
}

/** Portal registry: add new portals here (copy portals/_template). */
export const portalModules: Record<string, PortalModule> = {
  timesheet: {
    manifest: timesheetManifest,
    routes: timesheetRoutes,
    queueCount: (tx, ctx) => (ctx.role === 'employee' ? Promise.resolve(0) : approvals.countMine(tx, ctx)),
    inboxItems: async (tx, ctx) =>
      ctx.role === 'employee'
        ? []
        : (await approvals.mine(tx, ctx)).map((r) => ({
            id: `ts:${r.taskId}`,
            portal: 'Timesheet',
            title: `Approve ${r.employee}, week ${r.week}`,
            detail: `${r.total.toFixed(1)} h · ${r.stepLabel}${r.overdue ? ' · overdue' : ''}`,
            href: '/timesheet/approvals',
            urgent: r.overdue,
          })),
  },
  procurement: {
    manifest: procurementManifest,
    routes: procurementRoutes,
    queueCount: (tx, ctx) => procRequests.countMyQueue(tx, ctx),
    inboxItems: async (tx, ctx) =>
      (await procRequests.myQueue(tx, ctx)).map((r) => ({
        id: `pr:${r.id}:${r.stage}`,
        portal: 'Purchase',
        title: `${r.number} ${r.title}`,
        detail: `${r.stageLabel} · waiting ${r.daysInStage} d${r.late ? ' · past need-by' : ''}`,
        href: `/procurement/request?id=${r.id}`,
        urgent: r.late,
      })),
  },
  // Custom portals: one per custom customer, each in its own folder (portals/custom-*).
  'custom-1': { manifest: custom1Manifest, routes: custom1Routes },
};

/** Built for one customer: hidden from sign-up, plans and portal requests (Super Admin turns it on). */
export const isCustomPortal = (id: string) => !!portalModules[id]?.manifest.custom;
/** The normal portals every customer can choose. */
export const standardPortals = () => Object.values(portalModules).filter((m) => !m.manifest.custom);

export const BRAND = 'Orbit';
