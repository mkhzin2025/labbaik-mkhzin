-- Migration: shared quick replies ("/shortcut" canned responses) per store
ALTER TABLE stores ADD COLUMN IF NOT EXISTS "quickReplies" jsonb NOT NULL DEFAULT '[]'::jsonb;
