-- Messages and review comments between people of one company (for example GM to admin or PM).
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  from_id uuid NOT NULL REFERENCES memberships(id),
  to_id uuid NOT NULL REFERENCES memberships(id),
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'review')),
  subject text NOT NULL,
  body text NOT NULL,
  project_id uuid REFERENCES projects(id),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS messages_inbox ON messages (company_id, to_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS messages_sent ON messages (company_id, from_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON messages
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY workers_all ON messages TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('CREATE POLICY owner_all ON messages TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON messages TO orbit_reports;
