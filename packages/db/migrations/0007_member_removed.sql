-- Removed people: the membership stays for history (timesheets, approvals) but no longer
-- counts at sign-in, so the person can join or register another company.
ALTER TYPE member_status ADD VALUE IF NOT EXISTS 'removed';
