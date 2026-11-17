-- Production portal: work orders by trade, bill of materials and issues from store, operations
-- with daily production reports, QC inspections and non-conformance reports (NCR).
CREATE TABLE IF NOT EXISTS prod_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  config jsonb NOT NULL,
  wo_seq integer NOT NULL DEFAULT 1000,
  qc_seq integer NOT NULL DEFAULT 0,
  ncr_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  trade text NOT NULL,
  title text NOT NULL,
  customer text,
  sales_order_id uuid,
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  due date,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_release', 'released', 'in_progress', 'final_qc', 'completed', 'dispatched', 'cancelled')),
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  returned_note text,
  created_by uuid REFERENCES memberships(id),
  released_by uuid REFERENCES memberships(id),
  released_at timestamptz,
  completed_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS prod_work_orders_number ON prod_work_orders (company_id, number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_work_orders_status ON prod_work_orders (company_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  position integer NOT NULL,
  name text NOT NULL,
  qc_required boolean NOT NULL DEFAULT false,
  done_qty numeric(14, 3) NOT NULL DEFAULT 0,
  hours numeric(10, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'awaiting_qc', 'done', 'rework'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_operations_wo ON prod_operations (work_order_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  position integer NOT NULL,
  item text NOT NULL,
  qty numeric(14, 3) NOT NULL CHECK (qty >= 0),
  unit text NOT NULL,
  issued_qty numeric(14, 3) NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_materials_wo ON prod_materials (work_order_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  material_id uuid NOT NULL REFERENCES prod_materials(id),
  qty numeric(14, 3) NOT NULL CHECK (qty <> 0),
  note text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  operation_id uuid NOT NULL REFERENCES prod_operations(id),
  day date NOT NULL,
  qty numeric(14, 3) NOT NULL CHECK (qty >= 0),
  hours numeric(10, 2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  workers integer NOT NULL DEFAULT 0 CHECK (workers >= 0),
  shift text,
  remarks text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_reports_day ON prod_reports (company_id, day);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  operation_id uuid REFERENCES prod_operations(id),
  number text NOT NULL,
  result text NOT NULL CHECK (result IN ('pass', 'fail')),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_ncrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  inspection_id uuid REFERENCES prod_inspections(id),
  operation_id uuid REFERENCES prod_operations(id),
  number text NOT NULL,
  description text NOT NULL,
  action text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by uuid REFERENCES memberships(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS prod_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  text text NOT NULL,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_events_wo ON prod_events (company_id, work_order_id, created_at);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prod_settings', 'prod_work_orders', 'prod_operations', 'prod_materials', 'prod_issues', 'prod_reports', 'prod_inspections', 'prod_ncrs', 'prod_events'] LOOP
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
