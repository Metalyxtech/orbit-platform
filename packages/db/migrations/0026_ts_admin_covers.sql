-- Timesheet: roles a company admin also covers for approvals (Supervisor, Project manager,
-- Management). Kept out of ts_settings so Timesheet keeps working before this migration runs.
CREATE TABLE IF NOT EXISTS ts_admin_covers (
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  roles text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, membership_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ts_admin_covers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)
         WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)', t);
    EXECUTE format('DROP POLICY IF EXISTS workers_all ON %I', t);
    EXECUTE format('CREATE POLICY workers_all ON %I TO orbit_worker USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO orbit_app, orbit_worker', t);
    EXECUTE format('GRANT SELECT ON %I TO orbit_reports', t);
  END LOOP;
END $$;
