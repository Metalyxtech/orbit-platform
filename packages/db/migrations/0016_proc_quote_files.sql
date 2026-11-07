-- Purchase: supplier quotation documents attached to quotes.
CREATE TABLE IF NOT EXISTS proc_quote_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_id uuid NOT NULL REFERENCES proc_requests(id),
  quote_id uuid NOT NULL REFERENCES proc_quotes(id),
  s3_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded boolean NOT NULL DEFAULT false,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_quote_files_request ON proc_quote_files (company_id, request_id);
--> statement-breakpoint
ALTER TABLE proc_quote_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE proc_quote_files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON proc_quote_files;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON proc_quote_files
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
DROP POLICY IF EXISTS workers_all ON proc_quote_files;
--> statement-breakpoint
CREATE POLICY workers_all ON proc_quote_files TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON proc_quote_files');
  EXECUTE format('CREATE POLICY owner_all ON proc_quote_files TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON proc_quote_files TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON proc_quote_files TO orbit_reports;
