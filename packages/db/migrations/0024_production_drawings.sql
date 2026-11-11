-- Production: workshop drawings and documents on a work order (uploaded files or links).
CREATE TABLE IF NOT EXISTS prod_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  kind text NOT NULL CHECK (kind IN ('file', 'link')),
  name text NOT NULL,
  url text,
  s3_key text,
  content_type text,
  size_bytes bigint,
  uploaded boolean NOT NULL DEFAULT false,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_docs_wo ON prod_docs (company_id, work_order_id);
--> statement-breakpoint
ALTER TABLE prod_docs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prod_docs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON prod_docs;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON prod_docs
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
DROP POLICY IF EXISTS workers_all ON prod_docs;
--> statement-breakpoint
CREATE POLICY workers_all ON prod_docs TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON prod_docs');
  EXECUTE format('CREATE POLICY owner_all ON prod_docs TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON prod_docs TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON prod_docs TO orbit_reports;
