-- Sales portal: customers, enquiries with quotations, project documents, orders, invoices, payments.
CREATE TABLE IF NOT EXISTS sales_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  config jsonb NOT NULL,
  enq_seq integer NOT NULL DEFAULT 1000,
  qt_seq integer NOT NULL DEFAULT 0,
  so_seq integer NOT NULL DEFAULT 300,
  inv_seq integer NOT NULL DEFAULT 400,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  city text,
  gstin text,
  contact text,
  phone text,
  email text,
  credit_limit numeric(16, 2),
  terms text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sales_customers_name ON sales_customers (company_id, name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES sales_customers(id),
  title text NOT NULL,
  details text,
  source text,
  owner_id uuid REFERENCES memberships(id),
  stage text NOT NULL DEFAULT 'enquiry' CHECK (stage IN ('enquiry', 'costing', 'quoted', 'negotiation', 'won', 'lost')),
  probability integer NOT NULL DEFAULT 30 CHECK (probability BETWEEN 0 AND 100),
  follow_up date,
  discount numeric(5, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 90),
  quote_no text,
  rev integer NOT NULL DEFAULT 0,
  quote_status text NOT NULL DEFAULT 'draft' CHECK (quote_status IN ('draft', 'pending', 'approved', 'rejected', 'sent')),
  lost_reason text,
  pricing_done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sales_enquiries_number ON sales_enquiries (company_id, number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_enquiries_stage ON sales_enquiries (company_id, stage);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  enquiry_id uuid NOT NULL REFERENCES sales_enquiries(id),
  position integer NOT NULL,
  item text NOT NULL,
  qty numeric(14, 3) NOT NULL CHECK (qty >= 0),
  unit text NOT NULL,
  rate numeric(16, 2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  cost numeric(16, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_lines_enquiry ON sales_lines (enquiry_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  enquiry_id uuid NOT NULL REFERENCES sales_enquiries(id),
  text text NOT NULL,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_events_enquiry ON sales_events (company_id, enquiry_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  enquiry_id uuid NOT NULL REFERENCES sales_enquiries(id),
  kind text NOT NULL CHECK (kind IN ('file', 'link')),
  name text NOT NULL,
  url text,
  s3_key text,
  content_type text,
  size_bytes bigint,
  uploaded boolean NOT NULL DEFAULT false,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_docs_enquiry ON sales_docs (company_id, enquiry_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  enquiry_id uuid REFERENCES sales_enquiries(id),
  customer_id uuid NOT NULL REFERENCES sales_customers(id),
  title text NOT NULL,
  value numeric(16, 2) NOT NULL,
  advance_pct integer NOT NULL DEFAULT 0 CHECK (advance_pct BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'confirmed', 'production', 'dispatched', 'invoiced')),
  owner_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_number ON sales_orders (company_id, number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  order_id uuid REFERENCES sales_orders(id),
  customer_id uuid NOT NULL REFERENCES sales_customers(id),
  amount numeric(16, 2) NOT NULL,
  paid numeric(16, 2) NOT NULL DEFAULT 0,
  issued date NOT NULL,
  due date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_number ON sales_invoices (company_id, number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sales_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  invoice_id uuid NOT NULL REFERENCES sales_invoices(id),
  amount numeric(16, 2) NOT NULL CHECK (amount > 0),
  reference text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_settings', 'sales_customers', 'sales_enquiries', 'sales_lines', 'sales_events', 'sales_docs', 'sales_orders', 'sales_invoices', 'sales_payments'] LOOP
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
