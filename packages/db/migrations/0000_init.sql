CREATE TYPE "public"."company_stage" AS ENUM('sandbox', 'pilot', 'live');--> statement-breakpoint
CREATE TYPE "public"."company_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('employee', 'supervisor', 'project_manager', 'company_admin');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'approved', 'returned', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('running', 'approved', 'returned', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."correction_status" AS ENUM('open', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."overtime_mode" AS ENUM('week', 'day');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."timesheet_status" AS ENUM('draft', 'in_approval', 'returned', 'locked', 'rejected');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"workos_org_id" text,
	"stage" "company_stage" DEFAULT 'sandbox' NOT NULL,
	"status" "company_status" DEFAULT 'pending' NOT NULL,
	"region" text DEFAULT 'ap-southeast-1' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"email_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_workos_org_id_unique" UNIQUE("workos_org_id")
);
--> statement-breakpoint
CREATE TABLE "company_portals" (
	"company_id" uuid NOT NULL,
	"portal" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"workflow_definition_id" uuid,
	CONSTRAINT "company_portals_company_id_portal_pk" PRIMARY KEY("company_id","portal")
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'employee' NOT NULL,
	"title" text,
	"supervisor_id" uuid,
	"status" "member_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"handler" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "workflow_status" DEFAULT 'running' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"context" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"step_name" text NOT NULL,
	"assignee_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"remind_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"timesheet_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "correction_status" DEFAULT 'open' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"report" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"s3_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	CONSTRAINT "project_members_project_id_membership_id_pk" PRIMARY KEY("project_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"pm_id" uuid,
	"status" "project_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"timesheet_id" uuid NOT NULL,
	"row_key" text NOT NULL,
	"project_id" uuid,
	"cost_code_id" uuid,
	"work_date" date NOT NULL,
	"hours" numeric(4, 2) NOT NULL,
	"note" text,
	CONSTRAINT "hours_range" CHECK ("timesheet_entries"."hours" BETWEEN 0 AND 24)
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" timesheet_status DEFAULT 'draft' NOT NULL,
	"total_hours" numeric(6, 2) DEFAULT 0 NOT NULL,
	"overtime_hours" numeric(6, 2) DEFAULT 0 NOT NULL,
	"max_day_hours" numeric(4, 2) DEFAULT 0 NOT NULL,
	"note" text,
	"created_stage" "company_stage" NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"return_comment" text,
	"returned_by" text,
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ts_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"week_start" integer DEFAULT 0 NOT NULL,
	"std_day_hours" numeric(4, 2) DEFAULT 9.6 NOT NULL,
	"std_week_hours" numeric(5, 2) DEFAULT 48 NOT NULL,
	"weekly_off" integer[] DEFAULT '{5}'::int[] NOT NULL,
	"overtime_mode" "overtime_mode" DEFAULT 'week' NOT NULL,
	"note_over_hours" numeric(4, 2) DEFAULT 12 NOT NULL,
	"step_hours" numeric(3, 2) DEFAULT 0.25 NOT NULL,
	"deadline_dow" integer DEFAULT 0 NOT NULL,
	"deadline_time" time DEFAULT '10:00' NOT NULL,
	"reminder_dow" integer DEFAULT 6 NOT NULL,
	"reminder_time" time DEFAULT '16:00' NOT NULL,
	"require_cost_code" boolean DEFAULT true NOT NULL,
	"email_on_approve" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_portals" ADD CONSTRAINT "company_portals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_portals" ADD CONSTRAINT "company_portals_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_instance_id_workflow_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."workflow_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_assignee_id_memberships_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_memberships_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_pm_id_memberships_id_fk" FOREIGN KEY ("pm_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ts_settings" ADD CONSTRAINT "ts_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_company_at" ON "audit_log" USING btree ("company_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_company_user" ON "memberships" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "outbox_unpublished" ON "outbox_events" USING btree ("created_at") WHERE published_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_definitions_key_version" ON "workflow_definitions" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "workflow_instances_subject" ON "workflow_instances" USING btree ("company_id","subject_id");--> statement-breakpoint
CREATE INDEX "workflow_tasks_assignee" ON "workflow_tasks" USING btree ("company_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX "cost_codes_project" ON "cost_codes" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_company_code" ON "projects" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_entries_cell" ON "timesheet_entries" USING btree ("timesheet_id","row_key","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheets_company_member_week_rev" ON "timesheets" USING btree ("company_id","membership_id","week_start","revision");