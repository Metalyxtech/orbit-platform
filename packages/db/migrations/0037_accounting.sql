-- Accounting connections: Zoho Books, QuickBooks Online, Xero and Tally, and what was sent (per company, RLS).
CREATE TABLE IF NOT EXISTS acct_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  provider text NOT NULL CHECK (provider IN ('tally', 'zoho', 'quickbooks', 'xero')),
  active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  org_id text,
  org_name text,
  api_base text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}',
  last_error text,
  connected_by uuid REFERENCES memberships(id),
  connected_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS acct_connections_provider ON acct_connections (company_id, provider);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS acct_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  provider text NOT NULL CHECK (provider IN ('tally', 'zoho', 'quickbooks', 'xero')),
  kind text NOT NULL CHECK (kind IN ('sales_invoice', 'purchase_bill')),
  doc_id uuid NOT NULL,
  doc_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'exported')),
  external_id text,
  error text,
  attempts integer NOT NULL DEFAULT 1,
  by_id uuid REFERENCES memberships(id),
  at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS acct_sync_doc ON acct_sync (company_id, provider, kind, doc_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS acct_sync_status ON acct_sync (company_id, status);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acct_connections', 'acct_sync'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid) WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)', t);
    EXECUTE format('DROP POLICY IF EXISTS workers_all ON %I', t);
    EXECUTE format('CREATE POLICY workers_all ON %I TO orbit_worker USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON %I', t);
    EXECUTE format('CREATE POLICY owner_all ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO orbit_app, orbit_worker', t);
    EXECUTE format('GRANT SELECT ON %I TO orbit_reports', t);
  END LOOP;
END $$;
