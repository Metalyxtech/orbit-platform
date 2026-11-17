-- Signed copies: the exact text each person signed and its SHA-256 fingerprint.
CREATE TABLE IF NOT EXISTS legal_copies (
  acceptance_id uuid PRIMARY KEY REFERENCES legal_acceptances(id),
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE legal_copies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE legal_copies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Same visibility as the acceptance it belongs to (legal_acceptances' own policy applies in the subquery).
DROP POLICY IF EXISTS follows_acceptance ON legal_copies;
--> statement-breakpoint
CREATE POLICY follows_acceptance ON legal_copies
  USING (EXISTS (SELECT 1 FROM legal_acceptances a WHERE a.id = acceptance_id))
  WITH CHECK (EXISTS (SELECT 1 FROM legal_acceptances a WHERE a.id = acceptance_id AND a.user_id = nullif(current_setting('app.user_id', true), '')::uuid));
--> statement-breakpoint
DROP POLICY IF EXISTS workers_all ON legal_copies;
--> statement-breakpoint
CREATE POLICY workers_all ON legal_copies TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON legal_copies');
  EXECUTE format('CREATE POLICY owner_all ON legal_copies TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
-- A signed copy is a record: the app may add one, never change or delete it.
GRANT SELECT, INSERT ON legal_copies TO orbit_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON legal_copies FROM orbit_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON legal_copies TO orbit_worker;
--> statement-breakpoint
GRANT SELECT ON legal_copies TO orbit_reports;
