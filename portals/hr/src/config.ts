// HR portal settings, roles and the leave-day count. Pure data and functions, safe in client components.

export const HR_ROLES = [
  { id: 'employee', label: 'Employee', detail: 'Own profile, leave balance and requests, own attendance' },
  { id: 'hr', label: 'HR officer', detail: 'Employee records, leave types, everyone’s leave and attendance' },
  { id: 'admin', label: 'HR admin', detail: 'Everything in HR' },
] as const;
export type HrRole = (typeof HR_ROLES)[number]['id'];

export const EMPLOYMENT_TYPES = [
  { id: 'permanent', label: 'Permanent' },
  { id: 'contract', label: 'Contract' },
  { id: 'trainee', label: 'Trainee' },
  { id: 'intern', label: 'Intern' },
] as const;

/** Leave types a company starts with; HR can change them. */
export const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual leave', daysPerYear: 12, paid: true },
  { code: 'SL', name: 'Sick leave', daysPerYear: 12, paid: true },
  { code: 'EL', name: 'Earned leave', daysPerYear: 15, paid: true },
  { code: 'LOP', name: 'Loss of pay', daysPerYear: 0, paid: false },
];

export const LEAVE_STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'grey' }> = {
  pending: { label: 'Waiting', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

/** Attendance marks: what each letter means, for the grid legend. */
export const MARKS: Record<string, { label: string; tone: string }> = {
  P: { label: 'Present', tone: 'ok' },
  HD: { label: 'Half day worked', tone: 'warn' },
  L: { label: 'Leave', tone: 'steel' },
  HL: { label: 'Half-day leave', tone: 'steel' },
  H: { label: 'Holiday', tone: 'grey' },
  WO: { label: 'Weekly off', tone: 'grey' },
  A: { label: 'Absent', tone: 'bad' },
  '-': { label: 'Not yet / not joined', tone: 'grey' },
};

const DAY = 86_400_000;
/**
 * Leave days a request uses: the working days between the dates, leaving out the weekly off and
 * public holidays. A half day is 0.5 (one date only).
 */
export function leaveDays(from: string, to: string, halfDay: boolean, weeklyOff: number[], holidays: Set<string>) {
  if (halfDay) return 0.5;
  let n = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const d = new Date(t);
    if (!weeklyOff.includes(d.getUTCDay()) && !holidays.has(d.toISOString().slice(0, 10))) n++;
  }
  return n;
}
