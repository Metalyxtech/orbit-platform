-- Indexes for lookups that scanned whole tables: fine for a few companies, slow once there are many.
-- Each matches how the app reads the table (a company's list, or the rows under one parent).
CREATE INDEX IF NOT EXISTS proc_suppliers_company ON proc_suppliers (company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_quotes_request ON proc_quotes (request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS proc_receipts_request ON proc_receipts (request_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_issues_work_order ON prod_issues (work_order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_inspections_work_order ON prod_inspections (work_order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS prod_ncrs_work_order ON prod_ncrs (work_order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_payments_invoice ON sales_payments (invoice_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS correction_requests_company ON correction_requests (company_id, timesheet_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS exports_requested_by ON exports (requested_by);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS portal_roles_company ON portal_roles (company_id);
