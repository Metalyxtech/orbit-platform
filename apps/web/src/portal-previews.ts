// Sample workflow and dashboard for each portal, shown in the sign-in page preview.
// Illustrative data only (no real company). Safe to import from client components.

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'idle';

export interface WorkflowStep {
  label: string;
  /** Who acts at this step. */
  role: string;
  /** One short line on what happens. */
  note: string;
  /** 'approve' = an approval gate, 'auto' = the system does it, 'branch' = only when a rule applies. */
  kind?: 'approve' | 'auto' | 'branch';
}

export interface PortalPreview {
  /** Side menu of the mock portal screen. */
  nav: string[];
  workflow: { title: string; steps: WorkflowStep[]; rules: string[] };
  dashboard: {
    kpis: { label: string; value: string; delta: string; good: boolean }[];
    chart: { title: string; unit: string; labels: string[]; values: number[]; target?: number[]; /** Bottom of the y axis (default 0). */ min?: number };
    split: { title: string; parts: { label: string; value: number }[] };
    table: { title: string; cols: string[]; rows: { cells: string[]; status: string; tone: Tone }[] };
  };
}

export const PORTAL_PREVIEWS: Record<string, PortalPreview> = {
  sales: {
    nav: ['Dashboard', 'Pipeline', 'Enquiries', 'Quotations', 'Sales orders', 'Invoices', 'Customers', 'Targets'],
    workflow: {
      title: 'Enquiry to cash',
      steps: [
        { label: 'Enquiry logged', role: 'Sales executive', note: 'Customer, project and drawings in one record' },
        { label: 'Costing', role: 'Estimator', note: 'Material, labour and overheads build the price' },
        { label: 'Quote approval', role: 'Sales manager', note: 'Margin and discount checked before it goes out', kind: 'approve' },
        { label: 'GM sign-off', role: 'General manager', note: 'Only when discount is above 10%', kind: 'branch' },
        { label: 'Sales order', role: 'Sales manager', note: 'Won quote becomes an order and a work order', kind: 'auto' },
        { label: 'Invoice & collect', role: 'Accounts', note: 'Milestone invoices and payment follow-ups' },
      ],
      rules: ['Quotes not answered in 7 days trigger a follow-up reminder', 'Won orders flow straight to Production as work orders', 'Every price change is kept in the quote history'],
    },
    dashboard: {
      kpis: [
        { label: 'Open pipeline', value: '₹2.4 Cr', delta: '+12% vs last month', good: true },
        { label: 'Win rate', value: '38%', delta: '+4 pts', good: true },
        { label: 'Quotes awaiting reply', value: '12', delta: '3 over 7 days', good: false },
        { label: 'Collections due', value: '₹46 L', delta: '₹8 L overdue', good: false },
      ],
      chart: { title: 'Orders booked vs target', unit: '₹ L', labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'], values: [62, 71, 58, 84, 92, 78], target: [70, 70, 75, 75, 80, 80] },
      split: { title: 'Pipeline by stage', parts: [{ label: 'Enquiry', value: 34 }, { label: 'Costing', value: 22 }, { label: 'Quoted', value: 28 }, { label: 'Negotiation', value: 16 }] },
      table: {
        title: 'Latest quotations',
        cols: ['Quote', 'Customer', 'Value'],
        rows: [
          { cells: ['Q-1042', 'Harbour Steel Works', '₹18.6 L'], status: 'Approved', tone: 'ok' },
          { cells: ['Q-1041', 'Northgate Infra', '₹42.0 L'], status: 'GM review', tone: 'warn' },
          { cells: ['Q-1039', 'Bluewater Marine', '₹7.9 L'], status: 'Sent', tone: 'info' },
          { cells: ['Q-1036', 'Crestline Builders', '₹12.4 L'], status: 'Lost', tone: 'bad' },
        ],
      },
    },
  },
  procurement: {
    nav: ['Dashboard', 'Approvals', 'New requisition', 'All requests', 'Purchase orders', 'Stock register', 'Suppliers'],
    workflow: {
      title: 'Requisition to invoice',
      steps: [
        { label: 'Requisition', role: 'Site engineer', note: 'Items, quantities, project and need-by date' },
        { label: 'Department approval', role: 'Head of department', note: 'Checks need and budget', kind: 'approve' },
        { label: 'Supplier quotes', role: 'Purchase officer', note: 'Three quotes compared side by side' },
        { label: 'PO approval', role: 'General manager', note: 'Only for POs above ₹5 lakh', kind: 'branch' },
        { label: 'Goods received', role: 'Store keeper', note: 'Receipt against the PO, stock updated', kind: 'auto' },
        { label: 'Invoice matched', role: 'Accounts', note: 'PO, receipt and invoice must agree' },
      ],
      rules: ['Approval limits are set per role and per amount', 'Late approvals escalate after 24 hours', 'Stock ledger updates on every receipt and issue'],
    },
    dashboard: {
      kpis: [
        { label: 'Open requisitions', value: '18', delta: '5 urgent', good: false },
        { label: 'POs this month', value: '42', delta: '+9 vs last month', good: true },
        { label: 'Avg approval time', value: '1.6 days', delta: '−0.8 days', good: true },
        { label: 'Spend this month', value: '₹38 L', delta: '82% of budget', good: true },
      ],
      chart: { title: 'Monthly spend vs budget', unit: '₹ L', labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'], values: [31, 44, 39, 47, 41, 38], target: [45, 45, 45, 45, 46, 46] },
      split: { title: 'Spend by category', parts: [{ label: 'Steel plate', value: 46 }, { label: 'Consumables', value: 21 }, { label: 'Paint', value: 15 }, { label: 'Hardware', value: 18 }] },
      table: {
        title: 'Recent purchase orders',
        cols: ['PO', 'Supplier', 'Amount'],
        rows: [
          { cells: ['PO-2318', 'Metro Plates Ltd', '₹6.2 L'], status: 'GM approval', tone: 'warn' },
          { cells: ['PO-2317', 'Weldline Supplies', '₹84,500'], status: 'Received', tone: 'ok' },
          { cells: ['PO-2315', 'Coastal Paints', '₹1.3 L'], status: 'Ordered', tone: 'info' },
          { cells: ['PO-2311', 'Fastenal Traders', '₹42,000'], status: 'Invoiced', tone: 'ok' },
        ],
      },
    },
  },
  production: {
    nav: ['Dashboard', 'My tasks', 'Work orders', 'Shop-floor board', 'Daily report', 'Output log', 'Material requests', 'Trade forms'],
    workflow: {
      title: 'Work order to dispatch',
      steps: [
        { label: 'Work order released', role: 'Planning engineer', note: 'Drawings, BOM and due date attached', kind: 'approve' },
        { label: 'Material issued', role: 'Store', note: 'Issued against the work order, stock reduced', kind: 'auto' },
        { label: 'Fabrication', role: 'Shop-floor supervisor', note: 'Cutting, fit-up and welding by trade' },
        { label: 'Daily report', role: 'Supervisor', note: 'Output, manpower and delays logged every shift' },
        { label: 'QC hand-off', role: 'Quality', note: 'Inspection request raised automatically', kind: 'auto' },
        { label: 'Dispatch', role: 'Production manager', note: 'Released only after QC approval', kind: 'approve' },
      ],
      rules: ['Work orders come straight from won sales orders', 'Material shortages flag on the shop-floor board', 'Nothing dispatches without a QC final report'],
    },
    dashboard: {
      kpis: [
        { label: 'Active work orders', value: '27', delta: '4 due this week', good: true },
        { label: 'On-time delivery', value: '91%', delta: '+3 pts', good: true },
        { label: 'Output today', value: '14.2 t', delta: 'Target 15 t', good: false },
        { label: 'Material requests', value: '6', delta: '2 waiting on store', good: false },
      ],
      chart: { title: 'Daily output (tonnes)', unit: 't', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], values: [13.1, 15.4, 14.8, 16.2, 15.0, 11.6, 14.2], target: [15, 15, 15, 15, 15, 12, 15] },
      split: { title: 'Work orders by stage', parts: [{ label: 'Released', value: 22 }, { label: 'Fabrication', value: 41 }, { label: 'QC', value: 19 }, { label: 'Ready', value: 18 }] },
      table: {
        title: 'Shop-floor board',
        cols: ['Work order', 'Job', 'Progress'],
        rows: [
          { cells: ['WO-581', 'Pipe rack, Bay 3', '82%'], status: 'Welding', tone: 'info' },
          { cells: ['WO-579', 'Platform frames', '100%'], status: 'At QC', tone: 'warn' },
          { cells: ['WO-574', 'Tank supports', '45%'], status: 'Material short', tone: 'bad' },
          { cells: ['WO-570', 'Stair towers', '100%'], status: 'Dispatched', tone: 'ok' },
        ],
      },
    },
  },
  quality: {
    nav: ['Quality dashboard', 'My tasks', 'Inspections', 'New inspection', 'NCRs', 'Final reports', 'Settings'],
    workflow: {
      title: 'Inspection to final report',
      steps: [
        { label: 'Inspection request', role: 'Production', note: 'Raised from the work order with drawings', kind: 'auto' },
        { label: 'Inspection', role: 'QC inspector', note: 'Dimensional, weld and coating checks with photos' },
        { label: 'NCR raised', role: 'QC inspector', note: 'Only when a check fails', kind: 'branch' },
        { label: 'Rework & re-inspect', role: 'Production + QC', note: 'Root cause and corrective action recorded' },
        { label: 'QC manager approval', role: 'QC manager', note: 'Reviews results before release', kind: 'approve' },
        { label: 'Final report', role: 'System', note: 'PDF report ready to send with the dispatch', kind: 'auto' },
      ],
      rules: ['Checklists per product type, set by the QC manager', 'Open NCRs block dispatch of the job', 'Incoming material inspections link to the purchase order'],
    },
    dashboard: {
      kpis: [
        { label: 'Inspections this week', value: '64', delta: '+11 vs last week', good: true },
        { label: 'First-pass yield', value: '96.2%', delta: '+1.4 pts', good: true },
        { label: 'Open NCRs', value: '3', delta: '1 over 5 days', good: false },
        { label: 'Avg NCR closure', value: '2.1 days', delta: '−0.6 days', good: true },
      ],
      chart: { title: 'First-pass yield by week (%)', unit: '%', labels: ['W41', 'W42', 'W43', 'W44', 'W45', 'W46'], values: [92.4, 93.8, 94.1, 95.6, 94.9, 96.2], target: [95, 95, 95, 95, 95, 95], min: 88 },
      split: { title: 'NCRs by cause', parts: [{ label: 'Weld defect', value: 38 }, { label: 'Dimension', value: 27 }, { label: 'Coating', value: 21 }, { label: 'Material', value: 14 }] },
      table: {
        title: 'Recent inspections',
        cols: ['Report', 'Item', 'Type'],
        rows: [
          { cells: ['IR-904', 'Platform frames', 'Final'], status: 'Passed', tone: 'ok' },
          { cells: ['IR-903', 'Plate 20 mm lot', 'Incoming'], status: 'Passed', tone: 'ok' },
          { cells: ['IR-901', 'Tank supports', 'In-process'], status: 'NCR open', tone: 'bad' },
          { cells: ['IR-899', 'Pipe rack, Bay 3', 'Weld'], status: 'Awaiting QC mgr', tone: 'warn' },
        ],
      },
    },
  },
  timesheet: {
    nav: ['Dashboard', 'My week', 'My history', 'Approvals', 'Team overview', 'Reports', 'Projects'],
    workflow: {
      title: 'Week to payroll',
      steps: [
        { label: 'My week', role: 'Employee', note: 'Hours by day, project and cost code, on phone' },
        { label: 'Submit', role: 'Employee', note: 'Reminder if not submitted by the deadline', kind: 'auto' },
        { label: 'Supervisor approval', role: 'Supervisor', note: 'Approve, return with a note, or reject', kind: 'approve' },
        { label: 'PM approval', role: 'Project manager', note: 'Only when overtime is above 6 h or a day above 12 h', kind: 'branch' },
        { label: 'Approved & locked', role: 'System', note: 'Changes need a correction request', kind: 'auto' },
        { label: 'Export', role: 'HR / Payroll', note: 'Excel export by project, person or week' },
      ],
      rules: ['Overtime rules per company: by week or by day', 'Approvers get reminders and SLA escalations', 'Project hours feed job costing'],
    },
    dashboard: {
      kpis: [
        { label: 'Submitted this week', value: '142 / 150', delta: '95% on time', good: true },
        { label: 'Overtime', value: '86 h', delta: '+12 h vs last week', good: false },
        { label: 'Pending approvals', value: '9', delta: '2 past SLA', good: false },
        { label: 'Billable hours', value: '5,420 h', delta: '+6%', good: true },
      ],
      chart: { title: 'Hours by project this week', unit: 'h', labels: ['Refinery', 'Bridge', 'Plant 2', 'Marine', 'Yard', 'Office'], values: [1480, 1210, 960, 780, 610, 380] },
      split: { title: 'Hours by type', parts: [{ label: 'Normal', value: 78 }, { label: 'Overtime', value: 12 }, { label: 'Travel', value: 6 }, { label: 'Leave', value: 4 }] },
      table: {
        title: 'Waiting for approval',
        cols: ['Employee', 'Week', 'Hours'],
        rows: [
          { cells: ['R. Menon', 'W47', '58.5 h'], status: 'PM review', tone: 'warn' },
          { cells: ['A. George', 'W47', '48.0 h'], status: 'Supervisor', tone: 'info' },
          { cells: ['J. Thomas', 'W46', '52.0 h'], status: 'Returned', tone: 'bad' },
          { cells: ['V. Shenoy', 'W47', '45.0 h'], status: 'Approved', tone: 'ok' },
        ],
      },
    },
  },
  custom: {
    nav: ['Dashboard', 'My tasks', 'New request', 'All requests', 'Reports', 'Settings'],
    workflow: {
      title: 'Your process, your way',
      steps: [
        { label: 'Your form', role: 'Anyone you choose', note: 'Fields, attachments and checklists you define' },
        { label: 'Review', role: 'Your reviewer', note: 'Stages and owners set to match your team', kind: 'approve' },
        { label: 'Extra approval', role: 'Your manager', note: 'Rules by amount, type or department', kind: 'branch' },
        { label: 'Notify', role: 'System', note: 'Emails and reminders at every stage', kind: 'auto' },
        { label: 'Report', role: 'Management', note: 'Dashboards and Excel exports' },
      ],
      rules: ['Built with our team, usually live in 2–3 weeks', 'Same login, company data and approval engine', 'Links to your other SteelConnect360 portals'],
    },
    dashboard: {
      kpis: [
        { label: 'Requests this month', value: '58', delta: '+14%', good: true },
        { label: 'In progress', value: '14', delta: '3 waiting on you', good: false },
        { label: 'Avg cycle time', value: '2.4 days', delta: '−0.5 days', good: true },
        { label: 'SLA met', value: '97%', delta: '+2 pts', good: true },
      ],
      chart: { title: 'Requests per week', unit: '', labels: ['W42', 'W43', 'W44', 'W45', 'W46', 'W47'], values: [9, 12, 8, 14, 11, 15] },
      split: { title: 'Requests by type', parts: [{ label: 'Type A', value: 40 }, { label: 'Type B', value: 30 }, { label: 'Type C', value: 20 }, { label: 'Other', value: 10 }] },
      table: {
        title: 'Latest requests',
        cols: ['Ref', 'Raised by', 'Stage'],
        rows: [
          { cells: ['CR-118', 'Site office', 'Review'], status: 'In progress', tone: 'info' },
          { cells: ['CR-117', 'Workshop', 'Approval'], status: 'Waiting', tone: 'warn' },
          { cells: ['CR-115', 'Stores', 'Done'], status: 'Closed', tone: 'ok' },
        ],
      },
    },
  },
};
