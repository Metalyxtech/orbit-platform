-- Sales: two-step quotation approval. 'pending' = with the sales manager,
-- 'pending_gm' = sales manager approved, waiting for the GM's final approval.
ALTER TABLE sales_enquiries DROP CONSTRAINT IF EXISTS sales_enquiries_quote_status_check;
ALTER TABLE sales_enquiries ADD CONSTRAINT sales_enquiries_quote_status_check
  CHECK (quote_status IN ('draft', 'pending', 'pending_gm', 'approved', 'rejected', 'sent'));
