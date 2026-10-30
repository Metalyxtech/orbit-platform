-- GM / CEO style role: company-wide dashboard and reports, no admin settings.
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'management';
