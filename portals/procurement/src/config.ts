// Purchase portal configuration types, roles, stages and industry templates.
// Pure data, safe to import from client components.
import { MORE_TEMPLATES } from './industries';

/** 'qc' is kept only for old saved roles: inspection now happens in the Quality portal. */
export type ProcRole = 'requester' | 'buyer' | 'store' | 'qc' | 'manager' | 'gm' | 'accounts' | 'admin';

export const PROC_ROLES: { id: ProcRole; label: string; detail: string }[] = [
  { id: 'requester', label: 'Site engineer', detail: 'Raises material requests and follows them to delivery' },
  { id: 'buyer', label: 'Purchase engineer', detail: 'Checks stock, collects quotes, awards and issues POs' },
  { id: 'store', label: 'Purchase store keeper', detail: 'Main store: stock entry, matches requests with stock, goods receipt with MTC documents, issue' },
  { id: 'manager', label: 'Purchase manager', detail: 'Approves requests and monitors purchasing' },
  { id: 'gm', label: 'General manager', detail: 'High-value approvals and company-wide view' },
  { id: 'accounts', label: 'Accounts', detail: 'Matches supplier invoices to PO and receipt' },
  { id: 'admin', label: 'Purchase admin', detail: 'Workflow, forms, approval rules and roles' },
];
export const roleLabel = (r: string) => PROC_ROLES.find((x) => x.id === r)?.label ?? r;

export type StageKey = 'stock_check' | 'pr_approval' | 'rfq' | 'po_approval' | 'issue' | 'receiving' | 'inspection' | 'invoice' | 'stock_issue';
export type Stage = 'draft' | StageKey | 'closed' | 'rejected';
export type OptionalStage = 'stock_check' | 'pr_approval' | 'po_approval' | 'receiving' | 'inspection' | 'invoice';

/** Order a request moves in. stock_issue is a branch (whole request covered by stock). */
export const ORDER: Stage[] = ['draft', 'stock_check', 'pr_approval', 'rfq', 'po_approval', 'issue', 'receiving', 'inspection', 'invoice', 'closed'];
export const WORK: StageKey[] = ['stock_check', 'pr_approval', 'rfq', 'po_approval', 'issue', 'receiving', 'inspection', 'invoice'];

export const STAGES: Record<StageKey, { label: string; role: ProcRole | 'approval'; optional: boolean; what: string }> = {
  stock_check: { label: 'Stock check', role: 'buyer', optional: true, what: 'The purchase engineer or purchase store keeper compares each line with the main store, reserves what is available and buys only the shortfall.' },
  pr_approval: { label: 'Requisition approval', role: 'approval', optional: true, what: 'Approval levels sign off the estimated value of what will be bought.' },
  rfq: { label: 'Sourcing and quotes', role: 'buyer', optional: false, what: 'Enter supplier quotes, compare them line by line and award one supplier.' },
  po_approval: { label: 'PO approval', role: 'approval', optional: true, what: 'Approval levels sign off the awarded value.' },
  issue: { label: 'Issue PO', role: 'buyer', optional: false, what: 'A PO number is generated and the order goes to the supplier.' },
  receiving: { label: 'Goods receipt', role: 'store', optional: true, what: 'Record delivery notes, where the goods arrived (purchase or production store) and the MTC / test certificates; partial deliveries keep the step open.' },
  inspection: { label: 'Quality inspection', role: 'qc', optional: true, what: 'Done in the Quality portal (QC engineer, then QC manager). Without the Quality portal this step is skipped.' },
  invoice: { label: 'Invoice match', role: 'accounts', optional: true, what: 'Three-way match of PO, receipt and invoice within the tolerance.' },
  stock_issue: { label: 'Issue from stock', role: 'store', optional: false, what: 'When stock covers the whole request, the storekeeper issues it and the request closes without a PO.' },
};

/** Other roles that may also act on a stage (the purchase store keeper matches requests with stock). */
export const STAGE_HELPERS: Partial<Record<StageKey, ProcRole[]>> = { stock_check: ['store'] };

/** Where goods were received. Material for a production request goes to the production store either way. */
export type ReceivedAt = 'purchase' | 'production';
export const RECEIVED_AT: Record<ReceivedAt, string> = { purchase: 'Purchase (main) store', production: 'Production store' };

/** A request raised by another portal (production material request), kept in the request header. */
export interface RequestOrigin {
  portal: 'production';
  id: string;
  ref: string;
  workOrder: string;
}
export const originOf = (header: unknown): RequestOrigin | null => {
  const o = (header as { _from?: RequestOrigin } | null)?._from;
  return o && o.portal === 'production' && typeof o.id === 'string' ? o : null;
};

export type FieldType = 'text' | 'number' | 'select' | 'date' | 'check';
export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  /** Dropdown choices, comma separated. */
  options: string;
  required: boolean;
}

/** Industry-specific control, switched on or off by the admin. */
export interface IndustryOption {
  id: string;
  label: string;
  desc: string;
  on: boolean;
  /** Extra field the storekeeper fills at receipt, per delivery (header) or per line. */
  receiptField?: { where: 'header' | 'line'; label: string };
  /** Receipt cannot be saved until documents are confirmed. */
  docsRequired?: boolean;
  /** Confirmation the buyer must tick before issuing the PO. */
  issueCheck?: string;
  /** Confirmation the inspector must tick to pass. */
  qcCheck?: string;
}

export interface ApprovalLevel {
  id: string;
  name: string;
  role: ProcRole;
  /** Applies when the value is at least this amount. */
  min: number;
  pr: boolean;
  po: boolean;
}

export interface ProcConfig {
  template: string;
  form: { name: string; unit: string; header: FormField[]; line: FormField[] };
  options: IndustryOption[];
  flow: Record<OptionalStage, boolean>;
  stageCfg: Partial<Record<StageKey, { label?: string; role?: ProcRole }>>;
  minQuotes: number;
  levels: ApprovalLevel[];
  money: { currency: string; taxName: string; taxRate: number; tolerance: number };
  numbering: { prPrefix: string; poPrefix: string };
  /** Roles a purchase admin also covers (membershipId -> roles), when nobody else holds them. */
  covers?: Record<string, ProcRole[]>;
}

const f = (id: string, label: string, type: FieldType = 'text', options = '', required = false): FormField => ({ id, label, type, options, required });
const flowOn = (o: Partial<Record<OptionalStage, boolean>> = {}): Record<OptionalStage, boolean> => ({
  stock_check: true,
  pr_approval: true,
  po_approval: true,
  receiving: true,
  inspection: true,
  invoice: true,
  ...o,
});

export interface IndustryTemplate {
  name: string;
  unit: string;
  minQuotes: number;
  flow: Record<OptionalStage, boolean>;
  header: FormField[];
  line: FormField[];
  options: IndustryOption[];
}

/** Industry templates. A company gets a copy; its admin edits the copy. */
export const TEMPLATES: Record<string, IndustryTemplate> = {
  general: {
    name: 'General purchasing',
    unit: 'nos',
    minQuotes: 2,
    flow: flowOn({ inspection: false }),
    header: [f('dept', 'Department', 'select', 'Operations,Maintenance,Admin,IT'), f('costcentre', 'Cost centre')],
    line: [f('spec', 'Specification'), f('brand', 'Brand / approved equal')],
    options: [],
  },
  fab: {
    name: 'Steel fabrication',
    unit: 't',
    minQuotes: 2,
    flow: flowOn(),
    header: [f('dwg', 'Drawing / model ref', 'text', '', true), f('bay', 'Fabrication bay', 'select', 'Bay 1,Bay 2,Bay 3'), f('mtc', 'Mill test certificates required', 'check')],
    line: [f('prof', 'Profile / section', 'text', '', true), f('grade', 'Grade', 'select', 'S275,S355,A36,A572 Gr 50,E250,E350'), f('len', 'Length (mm)', 'number'), f('heat', 'Heat no.')],
    options: [
      { id: 'heat', label: 'Heat number traceability at receipt', desc: 'The storekeeper records the heat number of every line received.', on: true, receiptField: { where: 'line', label: 'Heat no.' } },
      { id: 'mtc', label: 'Mill test certificate mandatory', desc: 'A receipt cannot be saved until MTCs are confirmed.', on: true, docsRequired: true },
    ],
  },
  rebar: {
    name: 'Rebar and reinforcement',
    unit: 't',
    minQuotes: 2,
    flow: flowOn({ pr_approval: false }),
    header: [f('bbs', 'BBS reference', 'text', '', true), f('pour', 'Pour / element'), f('cert', 'Test certificates required', 'check')],
    line: [f('dia', 'Bar dia (mm)', 'select', '8,10,12,16,20,25,32,40', true), f('mark', 'Bar mark'), f('shape', 'Shape code'), f('cut', 'Cut length (mm)', 'number'), f('rgrade', 'Grade', 'select', 'B500B,B500C,Fe500D,Gr 60')],
    options: [
      { id: 'wb', label: 'Weighbridge check at receipt', desc: 'The storekeeper records the weighbridge weight of each delivery.', on: true, receiptField: { where: 'header', label: 'Weighbridge weight (t)' } },
      { id: 'tc', label: 'Test certificate mandatory', desc: 'Receipts need mill test certificates for every heat.', on: true, docsRequired: true },
      { id: 'bbslock', label: 'Lock BBS revision on PO', desc: 'The buyer confirms the BBS revision before the PO is issued.', on: true, issueCheck: 'BBS revision confirmed on PO' },
    ],
  },
  construction: {
    name: 'Building construction',
    unit: 'nos',
    minQuotes: 2,
    flow: flowOn({ inspection: false }),
    header: [f('pkg', 'Work package', 'select', 'Civil,Structure,Finishes,External works'), f('zone', 'Zone / level'), f('win', 'Delivery window', 'select', 'Morning,Afternoon,Night shift')],
    line: [f('spec', 'Specification'), f('brand', 'Brand / approved equal')],
    options: [
      { id: 'slot', label: 'Delivery slot booking', desc: 'Receipts record the gate and time slot used.', on: false, receiptField: { where: 'header', label: 'Delivery slot / gate' } },
    ],
  },
  mep: {
    name: 'MEP services',
    unit: 'nos',
    minQuotes: 2,
    flow: flowOn(),
    header: [f('sys', 'System', 'select', 'HVAC,Electrical,Plumbing,Fire protection,ELV', true), f('sub', 'Submittal ref', 'text', '', true), f('cons', 'Consultant approval received', 'check')],
    line: [f('tag', 'Equipment tag'), f('make', 'Make'), f('model', 'Model'), f('rating', 'Rating')],
    options: [
      { id: 'subm', label: 'Consultant submittal approval before PO', desc: 'The PO cannot be issued until the consultant has approved the submittal.', on: true, issueCheck: 'Consultant approval of submittal received' },
      { id: 'serial', label: 'Serial number capture', desc: 'The storekeeper records serial numbers for each line at receipt.', on: true, receiptField: { where: 'line', label: 'Serial no(s).' } },
      { id: 'warranty', label: 'Warranty and O&M documents at receipt', desc: 'Receipts need warranty certificates and O&M manuals.', on: true, docsRequired: true },
    ],
  },
  process: {
    name: 'Process plant / EPC',
    unit: 'nos',
    minQuotes: 3,
    flow: flowOn(),
    header: [f('pkgno', 'Package no.', 'text', '', true), f('wbs', 'WBS code', 'text', '', true), f('disc', 'Discipline', 'select', 'Mechanical,Piping,Electrical,Instrumentation,Civil'), f('insp', 'Inspection level', 'select', 'Level 1 document review,Level 2 witness,Level 3 full QC')],
    line: [f('ds', 'Spec / datasheet', 'text', '', true), f('tagno', 'Tag no.'), f('mat', 'Material')],
    options: [
      { id: 'vdr', label: 'Vendor document review before PO', desc: 'The buyer confirms vendor drawings and datasheets are accepted before issuing.', on: true, issueCheck: 'Vendor documents reviewed and accepted' },
      { id: 'tpi', label: 'Third-party inspection hold point', desc: 'QC confirms the third-party inspector witnessed the inspection.', on: true, qcCheck: 'Third-party inspector witnessed' },
      { id: 'tagqr', label: 'Tag number capture at receipt', desc: 'The storekeeper records the tag or serial number per line.', on: true, receiptField: { where: 'line', label: 'Tag / serial no.' } },
    ],
  },
};

// Extra industries live in industries.ts; merged here so every caller sees one list.
Object.assign(TEMPLATES, MORE_TEMPLATES);

const DEFAULT_LEVELS: ApprovalLevel[] = [
  { id: 'l1', name: 'Purchase manager', role: 'manager', min: 0, pr: true, po: true },
  { id: 'l2', name: 'General manager', role: 'gm', min: 50000, pr: false, po: true },
];

/** A fresh company configuration from a template. */
export function configFromTemplate(key: string, keep?: Pick<ProcConfig, 'levels' | 'money' | 'numbering'>): ProcConfig {
  const t = TEMPLATES[key] ?? TEMPLATES.general;
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    template: TEMPLATES[key] ? key : 'general',
    form: { name: `${t.name} requisition`, unit: t.unit, header: copy(t.header), line: copy(t.line) },
    options: copy(t.options),
    flow: { ...t.flow },
    stageCfg: {},
    minQuotes: t.minQuotes,
    levels: keep ? copy(keep.levels) : copy(DEFAULT_LEVELS),
    money: keep ? { ...keep.money } : { currency: '$', taxName: 'Tax', taxRate: 10, tolerance: 2 },
    numbering: keep ? { ...keep.numbering } : { prPrefix: 'PR', poPrefix: 'PO' },
  };
}

export const stageLabel = (cfg: ProcConfig, s: Stage) =>
  s === 'draft' ? 'Draft' : s === 'closed' ? 'Closed' : s === 'rejected' ? 'Rejected' : (cfg.stageCfg[s]?.label ?? STAGES[s].label);

export const stageTone = (s: Stage): 'grey' | 'steel' | 'ok' | 'warn' | 'bad' | 'hivis' =>
  s === 'closed' ? 'ok' : s === 'rejected' ? 'bad' : s === 'pr_approval' || s === 'po_approval' ? 'warn' : s === 'receiving' || s === 'inspection' || s === 'invoice' ? 'hivis' : s === 'draft' ? 'grey' : 'steel';

export const OPEN_STAGES: Stage[] = ['stock_check', 'pr_approval', 'rfq', 'po_approval', 'issue', 'receiving', 'inspection', 'invoice', 'stock_issue'];
