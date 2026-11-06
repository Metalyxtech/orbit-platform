-- Billing settings Orbit (Super Admin) sets per company: currency (INR in India, USD abroad),
-- whether plans are shown to the company admin, trial length, and when payments were last seen.
CREATE TABLE IF NOT EXISTS company_billing (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR', 'USD')),
  show_plans boolean NOT NULL DEFAULT true,
  trial_days integer,
  seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE company_billing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE company_billing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON company_billing;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON company_billing
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
DROP POLICY IF EXISTS workers_all ON company_billing;
--> statement-breakpoint
CREATE POLICY workers_all ON company_billing TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON company_billing');
  EXECUTE format('CREATE POLICY owner_all ON company_billing TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON company_billing TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON company_billing TO orbit_reports;
