-- Employee mobile number for the support-role login code (SMS).
-- Only needed when TYPEORM_SYNCHRONIZE=false. Safe to run more than once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "phoneNumber" varchar(20);
