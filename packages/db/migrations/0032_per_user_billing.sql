-- Per-user plans: UK clients pay in pounds, and a company pays for a number of seats. Removing someone
-- leaves a seat free to fill; more seats are bought as a separate subscription (seat_addons).
ALTER TABLE company_billing DROP CONSTRAINT IF EXISTS company_billing_currency_check;
--> statement-breakpoint
ALTER TABLE company_billing ADD CONSTRAINT company_billing_currency_check CHECK (currency IN ('INR', 'USD', 'GBP'));
--> statement-breakpoint
-- Seats paid for by the company's main subscription.
CREATE TABLE IF NOT EXISTS subscription_seats (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  seats integer NOT NULL CHECK (seats > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Extra seats bought later, each its own Razorpay subscription renewing with the main plan.
-- status: started (checkout opened) | active | ended (cancelled, failed or replaced).
CREATE TABLE IF NOT EXISTS seat_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  razorpay_subscription_id text NOT NULL UNIQUE,
  seats integer NOT NULL CHECK (seats > 0),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS seat_addons_company ON seat_addons (company_id, status);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscription_seats', 'seat_addons'] LOOP
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
