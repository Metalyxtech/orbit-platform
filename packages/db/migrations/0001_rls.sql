-- Row level security for every tenant table (WEPCM-DEV-002 Section 9).
-- Group roles; login roles (app_user, worker, reports_ro) are created by scripts/create-roles.ts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_app') THEN
    CREATE ROLE orbit_app NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_worker') THEN
    CREATE ROLE orbit_worker NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbit_reports') THEN
    CREATE ROLE orbit_reports NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO orbit_app, orbit_worker, orbit_reports;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO orbit_reports;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orbit_app, orbit_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO orbit_reports;
--> statement-breakpoint
-- The app may read the workflow library and companies, but only Super Admin code paths write them.
REVOKE INSERT, UPDATE, DELETE ON workflow_definitions FROM orbit_app;
--> statement-breakpoint
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'company_portals', 'workflow_instances', 'workflow_tasks', 'outbox_events', 'audit_log',
    'projects', 'project_members', 'cost_codes', 'ts_settings', 'timesheets',
    'timesheet_entries', 'correction_requests', 'exports'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)
         WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)', t);
    -- Workers (outbox sweeper, purge) and the migration owner work across companies.
    EXECUTE format('CREATE POLICY workers_all ON %I TO orbit_worker USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
  END LOOP;
END $$;
--> statement-breakpoint
-- Memberships: your company's rows, plus your own rows in any company (needed to pick a company at sign-in).
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships
  USING (
    company_id = nullif(current_setting('app.company_id', true), '')::uuid
    OR user_id = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    company_id = nullif(current_setting('app.company_id', true), '')::uuid
    OR user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
--> statement-breakpoint
CREATE POLICY workers_all ON memberships TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('CREATE POLICY owner_all ON memberships TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
