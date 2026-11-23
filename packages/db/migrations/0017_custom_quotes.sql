-- Custom work quotes: Super Admin's price for a request, the customer's approval, and the credit
-- for an unused yearly period that the first yearly payment of the custom plan is reduced by.
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_label text;
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_monthly integer CHECK (quote_monthly IS NULL OR quote_monthly > 0);
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_yearly integer CHECK (quote_yearly IS NULL OR quote_yearly > 0);
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_credit integer NOT NULL DEFAULT 0 CHECK (quote_credit >= 0);
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_note text;
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quoted_at timestamptz;
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS decided_at timestamptz;
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES memberships(id);
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_approved boolean;
--> statement-breakpoint
ALTER TABLE custom_requests DROP CONSTRAINT IF EXISTS custom_requests_status_check;
--> statement-breakpoint
ALTER TABLE custom_requests ADD CONSTRAINT custom_requests_status_check
  CHECK (status IN ('new', 'reviewing', 'quoted', 'approved', 'in_progress', 'ready', 'declined'));
--> statement-breakpoint
ALTER TABLE custom_plans ADD COLUMN IF NOT EXISTS yearly_credit integer NOT NULL DEFAULT 0 CHECK (yearly_credit >= 0);
--> statement-breakpoint
ALTER TABLE custom_plans ADD COLUMN IF NOT EXISTS credit_used_at timestamptz;
