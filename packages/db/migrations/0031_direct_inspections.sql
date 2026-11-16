-- Quality on its own: inspections raised in the Quality portal itself ("direct"), next to the
-- ones that come from Purchase, Production and the production store.
ALTER TABLE qc_inspections DROP CONSTRAINT IF EXISTS qc_inspections_source_check;
--> statement-breakpoint
ALTER TABLE qc_inspections ADD CONSTRAINT qc_inspections_source_check CHECK (source IN ('purchase', 'production', 'store', 'direct'));
