-- Quality portal: inspection requests raised by other portals (Purchase: incoming material;
-- Production: finished work), inspected by a QC engineer and approved by the QC manager.
CREATE TABLE IF NOT EXISTS qc_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS qc_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  source text NOT NULL CHECK (source IN ('purchase', 'production')),
  source_id uuid NOT NULL,
  source_ref text NOT NULL,
  title text NOT NULL,
  party text,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  round integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'cancelled')),
  result text CHECK (result IS NULL OR result IN ('pass', 'fail')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text,
  ncr text,
  return_note text,
  inspector_id uuid REFERENCES memberships(id),
  inspected_at timestamptz,
  approver_id uuid REFERENCES memberships(id),
  approved_at timestamptz,
  approver_note text,
  requested_by uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS qc_inspections_number ON qc_inspections (company_id, number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qc_inspections_status ON qc_inspections (company_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qc_inspections_source ON qc_inspections (company_id, source, source_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS qc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  inspection_id uuid NOT NULL REFERENCES qc_inspections(id),
  text text NOT NULL,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qc_events_insp ON qc_events (company_id, inspection_id, created_at);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qc_settings', 'qc_inspections', 'qc_events'] LOOP
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
