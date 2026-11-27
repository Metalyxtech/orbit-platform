-- HR portal: employee records, leave types and leave requests (per company, RLS).
CREATE TABLE IF NOT EXISTS hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  employee_code text,
  department text,
  designation text,
  employment_type text NOT NULL DEFAULT 'permanent' CHECK (employment_type IN ('permanent', 'contract', 'trainee', 'intern')),
  joining_date date,
  date_of_birth date,
  phone text,
  address text,
  emergency_name text,
  emergency_phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  left_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_member ON hr_employees (company_id, membership_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hr_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  code text NOT NULL,
  days_per_year numeric(5,1) NOT NULL CHECK (days_per_year >= 0 AND days_per_year <= 366),
  paid boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_types_code ON hr_leave_types (company_id, code);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  leave_type_id uuid NOT NULL REFERENCES hr_leave_types(id),
  from_date date NOT NULL,
  to_date date NOT NULL,
  half_day boolean NOT NULL DEFAULT false,
  days numeric(5,1) NOT NULL CHECK (days > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid REFERENCES memberships(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_leave_person ON hr_leave_requests (company_id, membership_id, from_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_leave_status ON hr_leave_requests (company_id, status);
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_employees', 'hr_leave_types', 'hr_leave_requests'] LOOP
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
