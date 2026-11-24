-- Flow editing for support members: support staff see flows read-only unless this is on.
-- The column is only needed by hand when TYPEORM_SYNCHRONIZE=false. Safe to run more than once.
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS "canEditFlows" boolean NOT NULL DEFAULT false;

-- مبارك النهدي (support@mkhzin.com) keeps editing flows.
UPDATE organization_members SET "canEditFlows" = true
WHERE "userId" IN (SELECT id FROM users WHERE lower(email) = 'support@mkhzin.com');
