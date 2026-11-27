import { sql } from 'drizzle-orm';
import { boolean, date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, memberships } from './platform';

// HR portal (migration 0036): employee records, leave types and leave requests. Attendance is not
// stored: it is worked out from timesheets, approved leave and the holiday calendar.

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () =>
  uuid('company_id')
    .notNull()
    .references(() => companies.id);

/** One record per person in the company (their membership). */
export const hrEmployees = pgTable(
  'hr_employees',
  {
    id: id(),
    companyId: companyId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    employeeCode: text('employee_code'),
    department: text('department'),
    designation: text('designation'),
    employmentType: text('employment_type').notNull().default('permanent'), // permanent | contract | trainee | intern
    joiningDate: date('joining_date'),
    dateOfBirth: date('date_of_birth'),
    phone: text('phone'),
    address: text('address'),
    emergencyName: text('emergency_name'),
    emergencyPhone: text('emergency_phone'),
    status: text('status').notNull().default('active'), // active | left
    leftOn: date('left_on'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('hr_employees_member').on(t.companyId, t.membershipId)],
);

/** Leave types the company gives (Casual, Sick, Earned) with days per year. */
export const hrLeaveTypes = pgTable(
  'hr_leave_types',
  {
    id: id(),
    companyId: companyId(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    daysPerYear: numeric('days_per_year', { precision: 5, scale: 1, mode: 'number' }).notNull(),
    paid: boolean('paid').notNull().default(true),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('hr_leave_types_code').on(t.companyId, t.code)],
);

/** A leave request; approved leave shows in Timesheet and attendance. status: pending | approved | rejected | cancelled. */
export const hrLeaveRequests = pgTable(
  'hr_leave_requests',
  {
    id: id(),
    companyId: companyId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => hrLeaveTypes.id),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    halfDay: boolean('half_day').notNull().default(false),
    days: numeric('days', { precision: 5, scale: 1, mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => memberships.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hr_leave_person').on(t.companyId, t.membershipId, t.fromDate), index('hr_leave_status').on(t.companyId, t.status)],
);
