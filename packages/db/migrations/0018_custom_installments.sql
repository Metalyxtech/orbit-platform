-- Custom plans: the yearly price may also be paid monthly (12 payments over a 12-month term).
ALTER TABLE custom_plans ADD COLUMN IF NOT EXISTS allow_installments boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS quote_installments boolean NOT NULL DEFAULT false;
