-- GM process control: stop (hold) any process with a comment, resume it, and comment anywhere.
-- One row per held/released hold; comments are a thread per process. Portals check holds before
-- moving a process on.
CREATE TABLE IF NOT EXISTS process_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  portal text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  ref text NOT NULL,
  title text NOT NULL,
  href text NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released')),
  reason text NOT NULL,
  held_by uuid NOT NULL REFERENCES memberships(id),
  held_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES memberships(id),
  released_at timestamptz,
  release_note text
);
CREATE INDEX IF NOT EXISTS process_holds_entity ON process_holds (company_id, entity, entity_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS process_holds_one_open ON process_holds (company_id, entity, entity_id) WHERE status = 'held';

CREATE TABLE IF NOT EXISTS process_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  portal text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  ref text NOT NULL,
  title text NOT NULL,
  href text NOT NULL,
  -- comment | hold | release
  kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'hold', 'release')),
  text text NOT NULL,
  by_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS process_comments_entity ON process_comments (company_id, entity, entity_id, created_at);
CREATE INDEX IF NOT EXISTS process_comments_recent ON process_comments (company_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['process_holds', 'process_comments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)
         WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)', t);
    EXECUTE format('DROP POLICY IF EXISTS workers_all ON %I', t);
    EXECUTE format('CREATE POLICY workers_all ON %I TO orbit_worker USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO orbit_app, orbit_worker', t);
    EXECUTE format('GRANT SELECT ON %I TO orbit_reports', t);
  END LOOP;
END $$;
