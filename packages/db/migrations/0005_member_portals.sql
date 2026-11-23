-- Which portals each person uses in a company (asked for when they join, edited by the admin).
-- No rows for a person means every portal the company has switched on (people who joined earlier).
CREATE TABLE IF NOT EXISTS member_portals (
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  portal text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, portal)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS member_portals_company ON member_portals (company_id);
--> statement-breakpoint
ALTER TABLE member_portals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE member_portals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON member_portals
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY workers_all ON member_portals TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('CREATE POLICY owner_all ON member_portals TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON member_portals TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON member_portals TO orbit_reports;
