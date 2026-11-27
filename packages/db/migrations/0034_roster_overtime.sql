-- Timesheet roster and overtime: shifts, roster days, public holidays, overtime asked for in advance,
-- and overtime rates for payroll. Each table is per company (RLS).
CREATE TABLE IF NOT EXISTS ts_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  start_time text NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text NOT NULL CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 600),
  hours numeric(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  color text NOT NULL DEFAULT '#2f5d8a',
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ts_shifts_company ON ts_shifts (company_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ts_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  work_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('shift', 'off', 'leave')),
  shift_id uuid REFERENCES ts_shifts(id),
  planned_ot numeric(4,2) NOT NULL DEFAULT 0 CHECK (planned_ot >= 0 AND planned_ot <= 16),
  note text,
  published boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES memberships(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'shift') = (shift_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ts_roster_day ON ts_roster (company_id, membership_id, work_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ts_roster_date ON ts_roster (company_id, work_date);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ts_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  holiday_date date NOT NULL,
  name text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ts_holidays_day ON ts_holidays (company_id, holiday_date);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ts_ot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  work_date date NOT NULL,
  hours numeric(4,2) NOT NULL CHECK (hours > 0 AND hours <= 16),
  project_id uuid REFERENCES projects(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid REFERENCES memberships(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ts_ot_requests_person ON ts_ot_requests (company_id, membership_id, work_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ts_ot_requests_status ON ts_ot_requests (company_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ts_ot_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  workday_rate numeric(3,2) NOT NULL DEFAULT 1.5 CHECK (workday_rate >= 1 AND workday_rate <= 5),
  offday_rate numeric(3,2) NOT NULL DEFAULT 2 CHECK (offday_rate >= 1 AND offday_rate <= 5)
);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ts_shifts', 'ts_roster', 'ts_holidays', 'ts_ot_requests', 'ts_ot_settings'] LOOP
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
