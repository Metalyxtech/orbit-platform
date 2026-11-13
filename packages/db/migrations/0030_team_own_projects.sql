-- Project teams for companies without the Sales portal: a team can belong to a project from the
-- company project list (projects) instead of a sales order. Exactly one of the two is set.
ALTER TABLE project_teams ALTER COLUMN sales_order_id DROP NOT NULL;
ALTER TABLE project_teams ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE project_teams DROP CONSTRAINT IF EXISTS project_teams_one_project;
ALTER TABLE project_teams ADD CONSTRAINT project_teams_one_project CHECK ((sales_order_id IS NULL) <> (project_id IS NULL));
DROP INDEX IF EXISTS project_teams_order;
CREATE UNIQUE INDEX IF NOT EXISTS project_teams_order ON project_teams (company_id, sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_teams_project ON project_teams (company_id, project_id) WHERE project_id IS NOT NULL;
