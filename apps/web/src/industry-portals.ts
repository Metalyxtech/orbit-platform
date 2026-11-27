import type { Industry } from '@orbit/core';
import { portalModules } from './portals';

/**
 * Portals each company type can have. Manufacturing keeps the original set; Production (machining,
 * moulding, press tool) gets its own set, and its own forms inside the shared portals. Add a
 * type's portal here and it shows in sign-up, Add company and Company portals for that type only.
 */
export const INDUSTRY_PORTALS: Record<Industry, string[]> = {
  manufacturing: ['timesheet', 'procurement', 'sales', 'production', 'quality'],
  production: ['timesheet', 'procurement', 'sales', 'production', 'quality'],
};

/** Standard (non-custom) portal modules a company of this type can switch on. */
export const portalsForIndustry = (industry: Industry) => Object.values(portalModules).filter((m) => !m.manifest.custom && INDUSTRY_PORTALS[industry].includes(m.manifest.id));
