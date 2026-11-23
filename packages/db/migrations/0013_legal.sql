-- Terms and Conditions / Privacy Policy acceptances (who signed which version, when).
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  company_id uuid REFERENCES companies(id),
  document text NOT NULL CHECK (document IN ('terms', 'privacy')),
  version text NOT NULL,
  signed_name text NOT NULL,
  role text,
  ip text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS legal_acceptances_user ON legal_acceptances (user_id, document);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS legal_acceptances_company ON legal_acceptances (company_id, accepted_at);
--> statement-breakpoint
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE legal_acceptances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Your own rows (any company), your company's rows, and every row for a Super Admin.
DROP POLICY IF EXISTS tenant_isolation ON legal_acceptances;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON legal_acceptances
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR company_id = nullif(current_setting('app.company_id', true), '')::uuid
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = nullif(current_setting('app.user_id', true), '')::uuid AND u.is_super_admin)
  )
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
DROP POLICY IF EXISTS workers_all ON legal_acceptances;
--> statement-breakpoint
CREATE POLICY workers_all ON legal_acceptances TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON legal_acceptances');
  EXECUTE format('CREATE POLICY owner_all ON legal_acceptances TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
-- Acceptances are a record: the app may add them and fill in the company later, never delete them.
GRANT SELECT, INSERT, UPDATE ON legal_acceptances TO orbit_app;
--> statement-breakpoint
REVOKE DELETE ON legal_acceptances FROM orbit_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON legal_acceptances TO orbit_worker;
--> statement-breakpoint
GRANT SELECT ON legal_acceptances TO orbit_reports;
