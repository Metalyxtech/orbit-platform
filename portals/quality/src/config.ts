// Quality portal: roles, statuses and helpers. Pure data, safe in client components.

export type QcRole = 'inspector' | 'manager' | 'gm' | 'admin';

export const QC_ROLES: { id: QcRole; label: string; detail: string }[] = [
  { id: 'inspector', label: 'QC engineer / inspector', detail: 'Inspects incoming material and finished work; writes the report' },
  { id: 'manager', label: 'QC manager', detail: 'Gives final approval of every inspection report' },
  { id: 'gm', label: 'General manager', detail: 'Quality dashboard and final reports' },
  { id: 'admin', label: 'Quality admin', detail: 'Everything, plus quality settings' },
];
export const roleLabel = (r: string) => QC_ROLES.find((x) => x.id === r)?.label ?? r;

/** Quality settings kept in qc_settings.config. */
export interface QcConfig {
  /** Roles each company admin also covers (membershipId -> roles). Not set = roles nobody else holds. */
  adminCovers?: Record<string, QcRole[]>;
}
/** Roles with tasks a quality admin can also cover: they then get those inspections in My tasks. */
export const COVER_ROLES: QcRole[] = ['inspector', 'manager'];
/** What the company admin chose, or else every role nobody else holds. */
export function adminCoversFor(cfg: QcConfig, membershipId: string, holders: string[]): QcRole[] {
  return cfg.adminCovers?.[membershipId] ?? COVER_ROLES.filter((r) => !holders.includes(r));
}

export type QcStatus = 'pending' | 'submitted' | 'approved' | 'cancelled';
type Tone = 'grey' | 'steel' | 'ok' | 'warn' | 'bad' | 'hivis';
export const QC_STATUS: Record<QcStatus, { label: string; tone: Tone }> = {
  pending: { label: 'With QC engineer', tone: 'hivis' },
  submitted: { label: 'With QC manager', tone: 'warn' },
  approved: { label: 'Final', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};
export const SOURCES = { purchase: 'Incoming material (Purchase)', production: 'Finished work (Production)', store: 'Material at the production store' } as const;
export type QcSource = keyof typeof SOURCES;
export const SOURCE_IDS = Object.keys(SOURCES) as QcSource[];
/** The portal a result goes back to. */
export const SOURCE_PORTAL: Record<QcSource, string> = { purchase: 'Purchase', production: 'Production', store: 'the production store' };
/** Short kind of inspection, for lists and charts. */
export const SOURCE_KIND: Record<QcSource, string> = { purchase: 'Incoming material', production: 'Finished work', store: 'Shop-floor receipt' };
export const SOURCE_COLOR: Record<QcSource, string> = { purchase: 'var(--steel)', production: 'var(--hivis)', store: 'var(--ok)' };

export interface Finding {
  item: string;
  ok: boolean;
  note?: string;
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(typeof d === 'string' && d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
/** Hours between two instants, rounded to one decimal. */
export const hoursBetween = (a: Date | string, b: Date | string) => Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 36e5) * 10) / 10;
