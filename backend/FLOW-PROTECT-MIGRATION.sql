-- Core flows that cannot be deleted (they can still be edited and switched off).
-- The column is only needed by hand when TYPEORM_SYNCHRONIZE=false. Safe to run more than once.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS "isProtected" boolean NOT NULL DEFAULT false;

-- «الرد الآلي - عربي - انجليزي»
UPDATE flows SET "isProtected" = true WHERE id = '6d92da2c-72a0-414f-8dab-7d5ae2f4157b';
