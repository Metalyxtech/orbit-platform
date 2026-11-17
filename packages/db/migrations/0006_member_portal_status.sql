-- Per-person portal approval: requested when they join, on or off after review.
ALTER TABLE member_portals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE member_portals DROP CONSTRAINT IF EXISTS member_portals_status_check;
--> statement-breakpoint
ALTER TABLE member_portals ADD CONSTRAINT member_portals_status_check CHECK (status IN ('requested', 'active', 'off'));
