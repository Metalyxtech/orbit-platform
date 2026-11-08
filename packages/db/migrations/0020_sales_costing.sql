-- Sales: estimator costing sheet. Per-line cost breakdown, markup for suggested rates,
-- costing notes, and costing attachments (kept apart from the customer's project documents).
ALTER TABLE sales_lines ADD COLUMN IF NOT EXISTS material numeric(16, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales_lines ADD COLUMN IF NOT EXISTS labour numeric(16, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales_lines ADD COLUMN IF NOT EXISTS other numeric(16, 2) NOT NULL DEFAULT 0;
-- Lines costed before this update keep their cost as material.
UPDATE sales_lines SET material = cost WHERE material = 0 AND labour = 0 AND other = 0 AND cost > 0;

ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS markup numeric(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS costing_notes text;

ALTER TABLE sales_docs ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'project';
DO $$ BEGIN
  ALTER TABLE sales_docs ADD CONSTRAINT sales_docs_section CHECK (section IN ('project', 'costing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
