-- Subscriptions with Razorpay: plan ids (global), one subscription per company, billing history.
CREATE TABLE IF NOT EXISTS billing_plans (
  key text PRIMARY KEY,
  razorpay_plan_id text NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
GRANT SELECT, INSERT ON billing_plans TO orbit_app;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS company_subscriptions (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  plan text NOT NULL,
  cycle text NOT NULL,
  status text NOT NULL,
  razorpay_subscription_id text UNIQUE,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  type text NOT NULL,
  razorpay_id text,
  amount integer,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS billing_events_company ON billing_events (company_id, created_at);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_subscriptions', 'billing_events'] LOOP
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
