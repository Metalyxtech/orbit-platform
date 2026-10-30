-- Company-built approval workflows live next to the Orbit library, tagged with company_id.
-- Library rows (company_id IS NULL) stay read-only for the app; a company may read its own
-- rows and add new versions of them, never edit or see another company's.
ALTER TABLE workflow_definitions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workflow_definitions_company ON workflow_definitions (company_id);
--> statement-breakpoint
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workflow_definitions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY library_or_own_read ON workflow_definitions FOR SELECT
  USING (company_id IS NULL OR company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY own_insert ON workflow_definitions FOR INSERT
  WITH CHECK (company_id IS NOT NULL AND company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY workers_all ON workflow_definitions TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('CREATE POLICY owner_all ON workflow_definitions TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT INSERT ON workflow_definitions TO orbit_app;
