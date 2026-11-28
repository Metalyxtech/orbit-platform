-- Language access: Super Admin limits which languages a company may offer (NULL = all languages).
-- The language list now lives in the app (25 languages), so the fixed check on member_prefs goes.
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS allowed_languages text[];
--> statement-breakpoint
ALTER TABLE member_prefs DROP CONSTRAINT IF EXISTS member_prefs_language_check;
