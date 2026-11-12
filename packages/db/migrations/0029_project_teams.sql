-- Project teams: the GM or a company admin puts people (engineers, supervisors, managers, store,
-- QC…) on a project (a won sales order). A project with a team is seen only by its team, the GM
-- and company admins; projects without a team stay visible to everyone.
CREATE TABLE IF NOT EXISTS project_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id),
  created_by uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_teams_order ON project_teams (company_id, sales_order_id);

CREATE TABLE IF NOT EXISTS project_team_members (
  team_id uuid NOT NULL REFERENCES project_teams(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  PRIMARY KEY (team_id, membership_id)
);
CREATE INDEX IF NOT EXISTS project_team_members_member ON project_team_members (company_id, membership_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_teams', 'project_team_members'] LOOP
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
