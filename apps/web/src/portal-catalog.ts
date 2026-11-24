// What each SteelConnect360 portal does, for people who have not signed up yet
// (sign-in page showcase and the "email me the details" message). Safe to import from client components.

import type { IconName } from '@orbit/ui';

export interface PortalInfo {
  id: string;
  name: string;
  icon: IconName;
  /** One line under the name. */
  tagline: string;
  /** What you get, in a few short points. */
  features: string[];
  /** Accent for the tile (on the dark brand panel). */
  accent: string;
}

export const PORTAL_CATALOG: PortalInfo[] = [
  {
    id: 'sales',
    name: 'Sales',
    icon: 'target',
    tagline: 'From enquiry to collected payment',
    features: ['Enquiry pipeline and customers', 'Costing and quotations with approvals', 'Sales orders, invoices and collections', 'Targets and a GM sales dashboard'],
    accent: '#4FA3E0',
  },
  {
    id: 'procurement',
    name: 'Purchase',
    icon: 'cart',
    tagline: 'Requisition to invoice, approved on time',
    features: ['Requisitions with approval rules', 'Supplier quotes and purchase orders', 'Stock register, entries and ledger', 'Goods received and invoice matching'],
    accent: '#E0A24F',
  },
  {
    id: 'production',
    name: 'Production',
    icon: 'wrench',
    tagline: 'Work orders on the shop floor',
    features: ['Work orders and a shop-floor board', 'Trade forms and workshop drawings', 'Daily production reports and output log', 'Material requests, issue and dispatch'],
    accent: '#D95F14',
  },
  {
    id: 'quality',
    name: 'Quality (QC)',
    icon: 'badge',
    tagline: 'Inspect every job before it ships',
    features: ['Incoming and final inspections', 'Non-conformance reports (NCRs)', 'QC manager approval and final reports', 'Quality dashboard'],
    accent: '#3FB68B',
  },
  {
    id: 'timesheet',
    name: 'Timesheet',
    icon: 'clock',
    tagline: 'Weekly hours with approval routes',
    features: ['Weekly timesheets on phone or desktop', 'Supervisor and PM approvals', 'Overtime rules and reminders', 'Project and cost-code reports'],
    accent: '#9B8AF0',
  },
  {
    id: 'custom',
    name: 'Custom portal',
    icon: 'puzzle',
    tagline: 'Built around your own process',
    features: ['Your forms, stages and approvals', 'Same login and company data', 'Set up with our team'],
    accent: '#8A949C',
  },
];

export const catalogPortal = (id: string) => PORTAL_CATALOG.find((p) => p.id === id);
