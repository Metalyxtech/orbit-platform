import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, companyStage, memberships } from './platform';

export const projectStatus = pgEnum('project_status', ['active', 'closed']);
export const overtimeMode = pgEnum('overtime_mode', ['week', 'day']);
export const timesheetStatus = pgEnum('timesheet_status', [
  'draft',
  'in_approval',
  'returned',
  'locked',
  'rejected',
]);
export const correctionStatus = pgEnum('correction_status', ['open', 'approved', 'declined']);

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const companyId = () =>
  uuid('company_id')
    .notNull()
    .references(() => companies.id);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    companyId: companyId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    pmId: uuid('pm_id').references(() => memberships.id),
    status: projectStatus('status').notNull().default('active'),
  },
  (t) => [uniqueIndex('projects_company_code').on(t.companyId, t.code)],
);

export const projectMembers = pgTable(
  'project_members',
  {
    companyId: companyId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.membershipId] })],
);

export const costCodes = pgTable(
  'cost_codes',
  {
    id: id(),
    companyId: companyId(),
    projectId: uuid('project_id').references(() => projects.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('cost_codes_project').on(t.companyId, t.projectId)],
);

export const tsSettings = pgTable('ts_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id),
  weekStart: integer('week_start').notNull().default(0), // 0 = Sunday, 1 = Monday
  stdDayHours: numeric('std_day_hours', { precision: 4, scale: 2, mode: 'number' })
    .notNull()
    .default(9.6),
  stdWeekHours: numeric('std_week_hours', { precision: 5, scale: 2, mode: 'number' })
    .notNull()
    .default(48),
  weeklyOff: integer('weekly_off').array().notNull().default(sql`'{5}'::int[]`),
  overtimeMode: overtimeMode('overtime_mode').notNull().default('week'),
  noteOverHours: numeric('note_over_hours', { precision: 4, scale: 2, mode: 'number' })
    .notNull()
    .default(12),
  stepHours: numeric('step_hours', { precision: 3, scale: 2, mode: 'number' })
    .notNull()
    .default(0.25),
  deadlineDow: integer('deadline_dow').notNull().default(0),
  deadlineTime: time('deadline_time').notNull().default('10:00'),
  reminderDow: integer('reminder_dow').notNull().default(6),
  reminderTime: time('reminder_time').notNull().default('16:00'),
  requireCostCode: boolean('require_cost_code').notNull().default(true),
  emailOnApprove: boolean('email_on_approve').notNull().default(true),
});

export const timesheets = pgTable(
  'timesheets',
  {
    id: id(),
    companyId: companyId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    weekStart: date('week_start').notNull(),
    revision: integer('revision').notNull().default(0),
    status: timesheetStatus('status').notNull().default('draft'),
    totalHours: numeric('total_hours', { precision: 6, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    overtimeHours: numeric('overtime_hours', { precision: 6, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    maxDayHours: numeric('max_day_hours', { precision: 4, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    note: text('note'),
    createdStage: companyStage('created_stage').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    returnComment: text('return_comment'),
    returnedBy: text('returned_by'),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('timesheets_company_member_week_rev').on(
      t.companyId,
      t.membershipId,
      t.weekStart,
      t.revision,
    ),
  ],
);

export const timesheetEntries = pgTable(
  'timesheet_entries',
  {
    id: id(),
    companyId: companyId(),
    timesheetId: uuid('timesheet_id')
      .notNull()
      .references(() => timesheets.id, { onDelete: 'cascade' }),
    rowKey: text('row_key').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    costCodeId: uuid('cost_code_id').references(() => costCodes.id),
    workDate: date('work_date').notNull(),
    hours: numeric('hours', { precision: 4, scale: 2, mode: 'number' }).notNull(),
    note: text('note'),
  },
  (t) => [
    check('hours_range', sql`${t.hours} BETWEEN 0 AND 24`),
    uniqueIndex('timesheet_entries_cell').on(t.timesheetId, t.rowKey, t.workDate),
  ],
);

export const correctionRequests = pgTable('correction_requests', {
  id: id(),
  companyId: companyId(),
  timesheetId: uuid('timesheet_id')
    .notNull()
    .references(() => timesheets.id),
  reason: text('reason').notNull(),
  status: correctionStatus('status').notNull().default('open'),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exports = pgTable('exports', {
  id: id(),
  companyId: companyId(),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => memberships.id),
  report: text('report').notNull(),
  status: text('status').notNull().default('queued'),
  s3Key: text('s3_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
