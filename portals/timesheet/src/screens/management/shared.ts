/** Small helpers shared by the Timesheet management views. */
export type ViewProps = { params?: Record<string, string | undefined> };

export const fmtH = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const STATUS = [
  { key: 'locked', name: 'Approved', color: '#3a9a6b' },
  { key: 'in_approval', name: 'Waiting for approval', color: '#2f5d8a' },
  { key: 'returned', name: 'Returned', color: '#e07b39' },
  { key: 'draft', name: 'Draft (not submitted)', color: '#9aa3ab' },
] as const;

export const ON_TIME_SERIES = [
  { name: 'On time', color: '#2f5d8a' },
  { name: 'Overdue', color: '#c94f6d' },
];

export const waited = (h: number) => (h < 24 ? `${h} h` : `${Math.floor(h / 24)} d ${h % 24} h`);

export const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
