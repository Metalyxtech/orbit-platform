import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';
import { projects } from './timesheet';

// Timesheet roster and overtime (migration 0034): shifts, the published roster per person per day,
// public holidays, overtime asked for in advance, and the overtime rates used for payroll.

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () =>
  uuid('company_id')
    .notNull()
    .references(() => companies.id);

/** Shift types the company works (Day 08:00-17:00, Night, Half day). `hours` is paid time, after the break. */
export const tsShifts = pgTable(
  'ts_shifts',
  {
    id: id(),
    companyId: companyId(),
    name: text('name').notNull(),
    startTime: text('start_time').notNull(), // 'HH:MM'
    endTime: text('end_time').notNull(), // 'HH:MM', may be past midnight (night shift)
    breakMinutes: integer('break_minutes').notNull().default(0),
    hours: numeric('hours', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    color: text('color').notNull().default('#2f5d8a'),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('ts_shifts_company').on(t.companyId, t.position)],
);

/**
 * One person's plan for one day: a shift, a day off or leave, plus overtime planned by the manager
 * (pre-approved). Draft until the manager publishes the week; people see published days only.
 */
export const tsRoster = pgTable(
  'ts_roster',
  {
    id: id(),
    companyId: companyId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    workDate: date('work_date').notNull(),
    kind: text('kind').notNull(), // shift | off | leave
    shiftId: uuid('shift_id').references(() => tsShifts.id),
    plannedOt: numeric('planned_ot', { precision: 4, scale: 2, mode: 'number' }).notNull().default(0),
    note: text('note'),
    published: boolean('published').notNull().default(false),
    updatedBy: uuid('updated_by').references(() => memberships.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ts_roster_day').on(t.companyId, t.membershipId, t.workDate), index('ts_roster_date').on(t.companyId, t.workDate)],
);

/** Public holidays: work on them counts as off-day overtime. */
export const tsHolidays = pgTable(
  'ts_holidays',
  {
    id: id(),
    companyId: companyId(),
    holidayDate: date('holiday_date').notNull(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('ts_holidays_day').on(t.companyId, t.holidayDate)],
);

/** Overtime asked for before it is worked. status: pending | approved | rejected | cancelled. */
export const tsOtRequests = pgTable(
  'ts_ot_requests',
  {
    id: id(),
    companyId: companyId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    workDate: date('work_date').notNull(),
    hours: numeric('hours', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => memberships.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ts_ot_requests_person').on(t.companyId, t.membershipId, t.workDate), index('ts_ot_requests_status').on(t.companyId, t.status)],
);

/** Overtime rates for payroll: working-day overtime and off-day (weekly off, rostered off, holiday) overtime. */
export const tsOtSettings = pgTable('ts_ot_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  workdayRate: numeric('workday_rate', { precision: 3, scale: 2, mode: 'number' }).notNull().default(1.5),
  offdayRate: numeric('offday_rate', { precision: 3, scale: 2, mode: 'number' }).notNull().default(2),
});
