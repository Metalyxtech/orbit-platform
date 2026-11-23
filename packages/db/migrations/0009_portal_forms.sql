-- Which form each role uses in a portal (for example the Timesheet entry form), chosen by the company admin.
CREATE TABLE IF NOT EXISTS portal_forms (
  company_id uuid NOT NULL REFERENCES companies(id),
  portal text NOT NULL,
  role text NOT NULL,
  form_id text NOT NULL,
  updated_by uuid REFERENCES memberships(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, portal, role)
);
--> statement-breakpoint
ALTER TABLE portal_forms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE portal_forms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON portal_forms
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY workers_all ON portal_forms TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('CREATE POLICY owner_all ON portal_forms TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON portal_forms TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON portal_forms TO orbit_reports;
