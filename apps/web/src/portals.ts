import type { ReactNode } from 'react';
import type { PortalManifest } from '@orbit/core/portals';
import { timesheetManifest } from '@orbit/portal-timesheet/manifest';
import { timesheetRoutes } from '@orbit/portal-timesheet/routes';

type Screen = (props: { searchParams: Record<string, string | string[] | undefined> }) => Promise<ReactNode>;

/** Portal registry: add new portals here (copy portals/_template). */
export const portalModules: Record<string, { manifest: PortalManifest; routes: Record<string, Screen> }> = {
  timesheet: { manifest: timesheetManifest, routes: timesheetRoutes },
};

export const BRAND = 'Orbit';
