-- Custom work: custom customers' deals, their requests and the forms they upload.
CREATE TABLE IF NOT EXISTS custom_plans (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  enabled boolean NOT NULL DEFAULT false,
  label text NOT NULL DEFAULT 'Custom plan',
  monthly_price integer CHECK (monthly_price IS NULL OR monthly_price > 0),
  yearly_price integer CHECK (yearly_price IS NULL OR yearly_price > 0),
  max_users integer CHECK (max_users IS NULL OR max_users > 0),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS custom_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  requested_by uuid REFERENCES memberships(id),
  requested_name text NOT NULL,
  title text NOT NULL,
  details text NOT NULL,
  area text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'in_progress', 'ready', 'declined')),
  orbit_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS custom_requests_company ON custom_requests (company_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS custom_request_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES custom_requests(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  s3_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS custom_request_files_request ON custom_request_files (request_id);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['custom_plans', 'custom_requests', 'custom_request_files'] LOOP
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
