// Production portal: roles, statuses, settings and small helpers. Pure data and functions,
// safe to import from client components. Trade forms live in ./trades.

/** 'qc' is kept only for old saved roles: inspection is done in the Quality portal. */
export type ProdRole = 'engineer' | 'manager' | 'supervisor' | 'qc' | 'store' | 'gm' | 'admin';

export const PROD_ROLES: { id: ProdRole; label: string; detail: string }[] = [
  { id: 'engineer', label: 'Production engineer', detail: 'Plans work orders: trade form, materials and operations' },
  { id: 'manager', label: 'Production manager', detail: 'Releases work orders and watches progress' },
  { id: 'supervisor', label: 'Supervisor', detail: 'Receives work orders, requests material and reports daily output' },
  { id: 'store', label: 'Production store keeper', detail: 'Production store: receives material with MTC, issues from stock or asks Purchase, dispatches' },
  { id: 'gm', label: 'General manager', detail: 'Company-wide view of output and delays' },
  { id: 'admin', label: 'Production admin', detail: 'Everything, plus production settings' },
];
export const roleLabel = (r: string) => PROD_ROLES.find((x) => x.id === r)?.label ?? r;

export type WoStatus = 'draft' | 'pending_release' | 'released' | 'in_progress' | 'final_qc' | 'completed' | 'dispatched' | 'cancelled';
type Tone = 'grey' | 'steel' | 'ok' | 'warn' | 'bad' | 'hivis';
export const WO_STATUS: Record<WoStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  pending_release: { label: 'Waiting release', tone: 'hivis' },
  released: { label: 'Released', tone: 'steel' },
  in_progress: { label: 'In production', tone: 'warn' },
  final_qc: { label: 'With QC', tone: 'hivis' },
  completed: { label: 'Ready to dispatch', tone: 'ok' },
  dispatched: { label: 'Dispatched', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
};
/** Order of the work-order track shown on the page. */
export const WO_FLOW: WoStatus[] = ['draft', 'pending_release', 'released', 'in_progress', 'final_qc', 'completed', 'dispatched'];
export const OPEN_STATUSES: WoStatus[] = ['draft', 'pending_release', 'released', 'in_progress', 'final_qc'];
/** On the shop floor: production can be reported. */
export const ACTIVE: WoStatus[] = ['released', 'in_progress'];

/** Material request (MR) from the shop floor. */
export const MR_STATUS: Record<'store' | 'engineer' | 'manager' | 'purchase' | 'ready' | 'issued' | 'rejected' | 'cancelled', { label: string; tone: Tone; who: string }> = {
  store: { label: 'With production store', tone: 'hivis', who: 'Production store keeper' },
  engineer: { label: 'Production engineer approval', tone: 'warn', who: 'Production engineer' },
  manager: { label: 'Production manager approval', tone: 'warn', who: 'Production manager' },
  purchase: { label: 'With Purchase', tone: 'steel', who: 'Purchase' },
  ready: { label: 'Arrived, to issue', tone: 'hivis', who: 'Production store keeper' },
  issued: { label: 'Issued', tone: 'ok', who: '' },
  rejected: { label: 'Rejected', tone: 'bad', who: '' },
  cancelled: { label: 'Cancelled', tone: 'grey', who: '' },
};
/** The path of a material request. */
export const MR_FLOW = ['store', 'engineer', 'manager', 'purchase', 'ready', 'issued'] as const;

/** Store receipt (material into the production store). */
export const RECEIPT_STATUS: Record<'qc' | 'accepted' | 'rejected', { label: string; tone: Tone }> = {
  qc: { label: 'With QC', tone: 'hivis' },
  accepted: { label: 'In stock', tone: 'ok' },
  rejected: { label: 'QC rejected', tone: 'bad' },
};
/** MTC / test certificates and delivery documents: PDF or photos, up to 25 MB each. */
export const RECEIPT_DOCS = { maxFiles: 20, maxBytes: 25 * 1024 * 1024, types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], accept: '.pdf,.png,.jpg,.jpeg,.webp' };

export type OpStatus = 'pending' | 'running' | 'awaiting_qc' | 'done' | 'rework';
export const OP_STATUS: Record<OpStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Not started', tone: 'grey' },
  running: { label: 'Running', tone: 'warn' },
  awaiting_qc: { label: 'Waiting QC', tone: 'hivis' },
  done: { label: 'Done', tone: 'ok' },
  rework: { label: 'Rework', tone: 'bad' },
};

export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export const PRIORITIES: { id: Priority; label: string; tone: Tone }[] = [
  { id: 'low', label: 'Low', tone: 'grey' },
  { id: 'normal', label: 'Normal', tone: 'steel' },
  { id: 'high', label: 'High', tone: 'warn' },
  { id: 'urgent', label: 'Urgent', tone: 'bad' },
];
export const SHIFTS = ['General', 'Shift A', 'Shift B', 'Shift C'];

export interface ProdConfig {
  /** Trades this company works in (ids from ./trades). Empty = all. */
  trades: string[];
  /** Report output above the work-order quantity (e.g. scrap allowance), in %. */
  overrunPct: number;
  /** A work order needs the production manager's release before the floor starts. */
  requireRelease: boolean;
  /** Final QC must pass before dispatch. */
  requireFinalQc: boolean;
  /** Roles each company admin also covers (membershipId -> roles). Not set = roles nobody else holds. */
  adminCovers?: Record<string, ProdRole[]>;
}
export const DEFAULT_CONFIG: ProdConfig = { trades: [], overrunPct: 5, requireRelease: true, requireFinalQc: true };

/** Roles a production admin can also cover: they then get those roles' tasks. */
export const COVER_ROLES: ProdRole[] = ['engineer', 'manager', 'supervisor', 'store', 'gm'];

/**
 * Roles this admin covers: what the company admin chose, or else every role nobody else holds
 * (so no task is left without someone). `holders` are the roles of people with Production access.
 */
export function adminCoversFor(cfg: Pick<ProdConfig, 'adminCovers'>, membershipId: string, holders: string[]): ProdRole[] {
  return cfg.adminCovers?.[membershipId] ?? COVER_ROLES.filter((r) => !holders.includes(r));
}

export const fmtQty = (v: number) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(typeof d === 'string' && d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';
/** Percent complete, capped at 100. */
export const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);

/**
 * Workshop drawings on a work order: PDFs and CAD files (DWG / DXF) up to 100 MB, photos and scans
 * up to 20 MB, or links for anything bigger. Up to 30 per work order.
 */
export const DRAWINGS = {
  maxFiles: 30,
  maxBytes: 100 * 1024 * 1024,
  maxImageBytes: 20 * 1024 * 1024,
  types: ['application/pdf', 'application/acad', 'image/vnd.dxf', 'image/png', 'image/jpeg', 'image/webp'],
  accept: '.pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp',
};
/** Browsers rarely know CAD files: decide the type from the extension when needed. */
export function drawingType(fileName: string, browserType: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'dwg') return 'application/acad';
  if (ext === 'dxf') return 'image/vnd.dxf';
  if (ext === 'pdf') return 'application/pdf';
  return browserType;
}
/** Size limit for one drawing of this type (0 = not allowed). */
export const drawingLimit = (type: string) => (!DRAWINGS.types.includes(type) ? 0 : type.startsWith('image/') && type !== 'image/vnd.dxf' ? DRAWINGS.maxImageBytes : DRAWINGS.maxBytes);
export const fmtBytes = (n: number | null | undefined) => (!n ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
