-- Company type: manufacturing (the original portals) or production (machining, moulding, press tool).
-- A separate table so pages that read companies keep working before this runs; no row = manufacturing.
CREATE TABLE IF NOT EXISTS company_profile (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  industry text NOT NULL DEFAULT 'manufacturing' CHECK (industry IN ('manufacturing', 'production')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Daily shop-floor measures for production trades (machine, shots, strokes, cycle time, rejects),
-- one row per production report, kept apart from prod_reports for the same reason.
CREATE TABLE IF NOT EXISTS prod_report_measures (
  report_id uuid PRIMARY KEY REFERENCES prod_reports(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  measures jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_profile', 'prod_report_measures'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid) WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)', t);
    EXECUTE format('DROP POLICY IF EXISTS workers_all ON %I', t);
    EXECUTE format('CREATE POLICY workers_all ON %I TO orbit_worker USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO orbit_app, orbit_worker', t);
    EXECUTE format('GRANT SELECT ON %I TO orbit_reports', t);
  END LOOP;
END $$;
