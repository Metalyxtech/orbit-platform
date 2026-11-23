-- Sales: a quotation sent back by the sales manager or GM goes to a chosen person
-- (sales executive, estimator or sales manager) with the reason, until they act on it.
ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS returned_to text;
ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS returned_note text;
ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS returned_by text;
DO $$ BEGIN
  ALTER TABLE sales_enquiries ADD CONSTRAINT sales_enquiries_returned_to CHECK (returned_to IS NULL OR returned_to IN ('exec', 'estimator', 'manager'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
