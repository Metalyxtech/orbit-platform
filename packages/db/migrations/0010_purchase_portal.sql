-- Purchase portal: per-portal roles for people, and the procurement tables. Every table is under RLS by company.
CREATE TABLE IF NOT EXISTS portal_roles (
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  portal text NOT NULL,
  role text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, portal)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  config jsonb NOT NULL,
  pr_seq integer NOT NULL DEFAULT 1000,
  po_seq integer NOT NULL DEFAULT 2000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  categories text NOT NULL DEFAULT '',
  email text,
  phone text,
  rating numeric(3,1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  unit text NOT NULL,
  on_hand numeric(14,3) NOT NULL DEFAULT 0,
  reserved numeric(14,3) NOT NULL DEFAULT 0,
  reorder_level numeric(14,3) NOT NULL DEFAULT 0,
  location text,
  avg_cost numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS proc_items_code ON proc_items (company_id, code);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  item_id uuid NOT NULL REFERENCES proc_items(id),
  type text NOT NULL CHECK (type IN ('IN', 'OUT', 'RET', 'ADJ')),
  qty numeric(14,3) NOT NULL,
  balance_after numeric(14,3) NOT NULL,
  reference text,
  note text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_moves_item ON proc_moves (company_id, item_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  title text NOT NULL,
  project text NOT NULL,
  need_by date NOT NULL,
  priority text NOT NULL DEFAULT 'Normal',
  requester_id uuid NOT NULL REFERENCES memberships(id),
  stage text NOT NULL DEFAULT 'draft',
  stage_at timestamptz NOT NULL DEFAULT now(),
  header jsonb NOT NULL DEFAULT '{}',
  award_quote_id uuid,
  po_no text,
  po_date date,
  invoice jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_requests_stage ON proc_requests (company_id, stage);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS proc_requests_number ON proc_requests (company_id, number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_id uuid NOT NULL REFERENCES proc_requests(id),
  sort integer NOT NULL DEFAULT 0,
  item_id uuid REFERENCES proc_items(id),
  description text NOT NULL,
  qty numeric(14,3) NOT NULL,
  buy_qty numeric(14,3),
  unit text NOT NULL,
  est_rate numeric(14,2) NOT NULL DEFAULT 0,
  values jsonb NOT NULL DEFAULT '{}',
  reserved_qty numeric(14,3) NOT NULL DEFAULT 0,
  reserve_state text NOT NULL DEFAULT 'none'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_lines_request ON proc_lines (company_id, request_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_id uuid NOT NULL REFERENCES proc_requests(id),
  supplier_id uuid NOT NULL REFERENCES proc_suppliers(id),
  rates jsonb NOT NULL,
  lead_days integer,
  terms text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_id uuid NOT NULL REFERENCES proc_requests(id),
  delivery_note text NOT NULL,
  condition text NOT NULL,
  docs_ok boolean NOT NULL DEFAULT false,
  extra jsonb NOT NULL DEFAULT '{}',
  qty jsonb NOT NULL,
  into_stock boolean NOT NULL DEFAULT false,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS proc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_id uuid NOT NULL REFERENCES proc_requests(id),
  kind text NOT NULL,
  stage text,
  level_id text,
  result text,
  text text NOT NULL,
  note text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_events_request ON proc_events (company_id, request_id, created_at);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_roles', 'proc_settings', 'proc_suppliers', 'proc_items', 'proc_moves', 'proc_requests', 'proc_lines', 'proc_quotes', 'proc_receipts', 'proc_events'] LOOP
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
