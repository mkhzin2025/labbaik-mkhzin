-- Team roles: adds the campaigns role ('marketing') next to owner/admin/supervisor/agent.
-- Only needed when TYPEORM_SYNCHRONIZE=false. Safe to run more than once.
-- Databases created from LABBAIK-SAAS-BASE-MIGRATION.sql store the role as varchar and need nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_members_role_enum') THEN
    ALTER TYPE organization_members_role_enum ADD VALUE IF NOT EXISTS 'marketing';
  END IF;
END $$;
