import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const companyStage = pgEnum('company_stage', ['sandbox', 'pilot', 'live']);
export const companyStatus = pgEnum('company_status', ['pending', 'active', 'suspended']);
export const memberRole = pgEnum('member_role', [
  'employee',
  'supervisor',
  'project_manager',
  'company_admin',
  'management',
]);
export const memberStatus = pgEnum('member_status', ['pending', 'active', 'disabled']);
export const workflowStatus = pgEnum('workflow_status', [
  'running',
  'approved',
  'returned',
  'rejected',
  'cancelled',
]);
export const taskStatus = pgEnum('task_status', [
  'pending',
  'approved',
  'returned',
  'rejected',
  'cancelled',
]);

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Control plane: one row per customer company. */
export const companies = pgTable('companies', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  workosOrgId: text('workos_org_id').unique(),
  stage: companyStage('stage').notNull().default('sandbox'),
  status: companyStatus('status').notNull().default('pending'),
  region: text('region').notNull().default('ap-southeast-1'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  emailDomains: text('email_domains').array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
});

/** Identity: one row per person (WorkOS user). Not tenant scoped. */
export const users = pgTable('users', {
  id: id(),
  workosUserId: text('workos_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: memberRole('role').notNull().default('employee'),
    title: text('title'),
    supervisorId: uuid('supervisor_id'),
    status: memberStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('memberships_company_user').on(t.companyId, t.userId)],
);

/** Portals enabled per company and the workflow bound to them (Super Admin sets this). */
export const companyPortals = pgTable(
  'company_portals',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id),
    portal: text('portal').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    workflowDefinitionId: uuid('workflow_definition_id').references(() => workflowDefinitions.id),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.portal] })],
);

/** Workflow library (global) and company-built workflows, versioned. */
export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: id(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    definition: jsonb('definition').notNull(),
    /** Null for the Orbit library; set for a workflow a company built itself. */
    companyId: uuid('company_id').references(() => companies.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('workflow_definitions_key_version').on(t.key, t.version)],
);

/** Columns code reads from workflow_definitions (company_id only matters to RLS). */
export const workflowDefinitionColumns = {
  id: workflowDefinitions.id,
  key: workflowDefinitions.key,
  version: workflowDefinitions.version,
  name: workflowDefinitions.name,
  description: workflowDefinitions.description,
  definition: workflowDefinitions.definition,
};

export const workflowInstances = pgTable(
  'workflow_instances',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    definitionId: uuid('definition_id').notNull().references(() => workflowDefinitions.id),
    kind: text('kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    status: workflowStatus('status').notNull().default('running'),
    currentStep: integer('current_step').notNull().default(0),
    context: jsonb('context').notNull(),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('workflow_instances_subject').on(t.companyId, t.subjectId)],
);

export const workflowTasks = pgTable(
  'workflow_tasks',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    instanceId: uuid('instance_id').notNull().references(() => workflowInstances.id),
    stepIndex: integer('step_index').notNull(),
    stepName: text('step_name').notNull(),
    assigneeId: uuid('assignee_id').notNull().references(() => memberships.id),
    status: taskStatus('status').notNull().default('pending'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    remindAt: timestamp('remind_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by'),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [index('workflow_tasks_assignee').on(t.companyId, t.assigneeId, t.status)],
);

/** Transactional outbox: written in the same transaction as the change, sent to SQS after commit. */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [index('outbox_unpublished').on(t.createdAt).where(sql`published_at IS NULL`)],
);

/** Idempotency for Lambda handlers (event.id). Written by workers only. */
export const processedEvents = pgTable('processed_events', {
  id: uuid('id').primaryKey(),
  handler: text('handler').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    data: jsonb('data'),
    requestId: text('request_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_company_at').on(t.companyId, t.at)],
);

/** Bounce / complaint suppression list fed by the SES webhook. */
export const emailSuppressions = pgTable('email_suppressions', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
