import type { Industry } from '@orbit/core';
import { portalModules } from './portals';

/**
 * Portals each company type can have. Manufacturing keeps the original set; Production (machining,
 * moulding, press tool) gets its own set, and its own forms inside the shared portals. Add a
 * type's portal here and it shows in sign-up, Add company and Company portals for that type only.
 */
export const INDUSTRY_PORTALS: Record<Industry, string[]> = {
  manufacturing: ['timesheet', 'hr', 'procurement', 'sales', 'production', 'quality'],
  production: ['timesheet', 'hr', 'procurement', 'sales', 'production', 'quality'],
};

/** Standard (non-custom) portal modules a company of this type can switch on. */
export const portalsForIndustry = (industry: Industry) => Object.values(portalModules).filter((m) => !m.manifest.custom && INDUSTRY_PORTALS[industry].includes(m.manifest.id));

/** What each portal does for this type of company, shown wherever a company picks its portals. */
export const PORTAL_DETAIL: Record<Industry, Record<string, string>> = {
  manufacturing: {
    timesheet: 'Weekly timesheets, shift roster, overtime and project hours',
    hr: 'Employee records, leave approval and attendance from timesheets',
    procurement: 'Requisitions, supplier quotes, purchase orders, stock and receipts with MTC',
    sales: 'Enquiries, project documents, estimating, quotations, orders and collections',
    production: 'Fabrication work orders: steel structures, piping, sheet metal, welding',
    quality: 'Material and stage inspections, NCRs and final inspection reports',
  },
  production: {
    timesheet: 'Shift timesheets, roster and overtime for operators',
    hr: 'Employee records, leave approval and attendance from timesheets',
    procurement: 'Raw material by grade and lot, purchase orders, stock and receipts',
    sales: 'RFQs, part-number quotations, delivery schedules and invoices',
    production: 'Machining, moulding and press tool job cards with shots, strokes, cycle time and rejects',
    quality: 'First-off, in-process and final inspection (AQL), rejection analysis',
  },
};
