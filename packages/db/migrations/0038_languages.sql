-- Languages: which languages a company offers (default first) and each person's choice (per company, RLS).
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT ARRAY['en']::text[];
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS member_prefs (
  membership_id uuid PRIMARY KEY REFERENCES memberships(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  language text CHECK (language IS NULL OR language IN ('en', 'hi', 'mr', 'gu', 'pa', 'bn', 'or', 'ta', 'te', 'kn', 'ml', 'ur', 'fr', 'de')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS member_prefs_company ON member_prefs (company_id);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_prefs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid) WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)', t);
    EXECUTE format('DROP POLICY IF EXISTS workers_all ON %I', t);
    EXECUTE format('CREATE POLICY workers_all ON %I TO orbit_worker USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO orbit_app, orbit_worker', t);
    EXECUTE format('GRANT SELECT ON %I TO orbit_reports', t);
  END LOOP;
END $$;
