-- Per-user plans: UK clients pay in pounds, and each company's subscription is billed for a number of
-- people (seats) that follows the people added and removed.
ALTER TABLE company_billing DROP CONSTRAINT IF EXISTS company_billing_currency_check;
--> statement-breakpoint
ALTER TABLE company_billing ADD CONSTRAINT company_billing_currency_check CHECK (currency IN ('INR', 'USD', 'GBP'));
--> statement-breakpoint
-- seats: people billed from the subscription's next charge. pending_seats: a new count Razorpay could
-- not take by itself (UPI AutoPay and e-mandates cannot be changed), waiting for the admin to confirm.
CREATE TABLE IF NOT EXISTS subscription_seats (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  seats integer NOT NULL CHECK (seats > 0),
  pending_seats integer CHECK (pending_seats > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE subscription_seats ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscription_seats FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON subscription_seats;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subscription_seats
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
DROP POLICY IF EXISTS workers_all ON subscription_seats;
--> statement-breakpoint
CREATE POLICY workers_all ON subscription_seats TO orbit_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON subscription_seats');
  EXECUTE format('CREATE POLICY owner_all ON subscription_seats TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON subscription_seats TO orbit_app, orbit_worker;
--> statement-breakpoint
GRANT SELECT ON subscription_seats TO orbit_reports;
