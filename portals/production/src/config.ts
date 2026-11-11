// Production portal: roles, statuses, settings and small helpers. Pure data and functions,
// safe to import from client components. Trade forms live in ./trades.

export type ProdRole = 'engineer' | 'manager' | 'supervisor' | 'qc' | 'store' | 'gm' | 'admin';

export const PROD_ROLES: { id: ProdRole; label: string; detail: string }[] = [
  { id: 'engineer', label: 'Production engineer', detail: 'Plans work orders: trade form, materials and operations' },
  { id: 'manager', label: 'Production manager', detail: 'Releases work orders, watches progress, closes NCRs' },
  { id: 'supervisor', label: 'Supervisor', detail: 'Reports daily output and hours on the shop floor' },
  { id: 'qc', label: 'QC inspector', detail: 'Inspects operations and the final product; raises NCRs' },
  { id: 'store', label: 'Store keeper', detail: 'Issues materials to work orders and dispatches finished goods' },
  { id: 'gm', label: 'General manager', detail: 'Company-wide view of output, delays and quality' },
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
  final_qc: { label: 'Final QC', tone: 'hivis' },
  completed: { label: 'Ready to dispatch', tone: 'ok' },
  dispatched: { label: 'Dispatched', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
};
/** Order of the work-order track shown on the page. */
export const WO_FLOW: WoStatus[] = ['draft', 'pending_release', 'released', 'in_progress', 'final_qc', 'completed', 'dispatched'];
export const OPEN_STATUSES: WoStatus[] = ['draft', 'pending_release', 'released', 'in_progress', 'final_qc'];
/** On the shop floor: production can be reported. */
export const ACTIVE: WoStatus[] = ['released', 'in_progress'];

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
}
export const DEFAULT_CONFIG: ProdConfig = { trades: [], overrunPct: 5, requireRelease: true, requireFinalQc: true };

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
