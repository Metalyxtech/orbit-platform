-- Production store and material requests, linked to Purchase; receipt documents (MTC) for QC.
-- Production stock is kept per item name and unit in the production store.
CREATE TABLE IF NOT EXISTS prod_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  unit text NOT NULL,
  on_hand numeric(14,3) NOT NULL DEFAULT 0,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_stock_item ON prod_stock (company_id, lower(name), lower(unit));

CREATE TABLE IF NOT EXISTS prod_stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  stock_id uuid NOT NULL REFERENCES prod_stock(id),
  type text NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJ')),
  qty numeric(14,3) NOT NULL,
  balance_after numeric(14,3) NOT NULL,
  reference text,
  note text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_stock_moves_item ON prod_stock_moves (company_id, stock_id, created_at);

-- Material request (MR) from the shop floor for a work order.
-- store -> (issued) | engineer -> manager -> purchase -> ready -> issued; rejected / cancelled.
CREATE TABLE IF NOT EXISTS prod_mat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES prod_work_orders(id),
  status text NOT NULL DEFAULT 'store' CHECK (status IN ('store', 'engineer', 'manager', 'purchase', 'ready', 'issued', 'rejected', 'cancelled')),
  -- [{ materialId, item, unit, qty, issued, toBuy, received }]
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  return_note text,
  requested_by uuid NOT NULL REFERENCES memberships(id),
  engineer_id uuid REFERENCES memberships(id),
  engineer_at timestamptz,
  manager_id uuid REFERENCES memberships(id),
  manager_at timestamptz,
  purchase_id uuid,
  purchase_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_mat_requests_number ON prod_mat_requests (company_id, number);
CREATE INDEX IF NOT EXISTS prod_mat_requests_wo ON prod_mat_requests (company_id, work_order_id);
CREATE INDEX IF NOT EXISTS prod_mat_requests_status ON prod_mat_requests (company_id, status);

-- Material received into the production store: direct deliveries to the shop floor, or goods
-- bought by Purchase for a material request (purchase_id) delivered to the shop floor.
-- qc: waiting for QC; accepted: in stock; rejected: QC failed.
CREATE TABLE IF NOT EXISTS prod_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  number text NOT NULL,
  mr_id uuid REFERENCES prod_mat_requests(id),
  purchase_id uuid,
  reference text NOT NULL,
  supplier text,
  -- [{ item, qty, unit }]
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('qc', 'accepted', 'rejected')),
  note text,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prod_receipts_number ON prod_receipts (company_id, number);

-- MTC / test certificates and delivery documents uploaded by the store, for QC.
CREATE TABLE IF NOT EXISTS prod_receipt_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  receipt_id uuid NOT NULL REFERENCES prod_receipts(id),
  s3_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded boolean NOT NULL DEFAULT false,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prod_receipt_files_receipt ON prod_receipt_files (company_id, receipt_id);

CREATE TABLE IF NOT EXISTS proc_receipt_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  request_id uuid NOT NULL REFERENCES proc_requests(id),
  s3_key text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded boolean NOT NULL DEFAULT false,
  by_id uuid REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_receipt_files_request ON proc_receipt_files (company_id, request_id);

-- QC also inspects material received straight into the production store.
ALTER TABLE qc_inspections DROP CONSTRAINT IF EXISTS qc_inspections_source_check;
ALTER TABLE qc_inspections ADD CONSTRAINT qc_inspections_source_check CHECK (source IN ('purchase', 'production', 'store'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prod_stock', 'prod_stock_moves', 'prod_mat_requests', 'prod_receipts', 'prod_receipt_files', 'proc_receipt_files'] LOOP
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
