-- Labbaik SaaS: organization-wide WhatsApp numbers + organization/store customer taxonomy
-- Run AFTER CUSTOMER-BRANCH-TAXONOMY-MIGRATION.sql on PostgreSQL when TYPEORM_SYNCHRONIZE=false.
BEGIN;

-- ---------------------------
-- Meta WhatsApp connection scope
-- ---------------------------
ALTER TABLE meta_whatsapp_connections ADD COLUMN IF NOT EXISTS scope varchar NOT NULL DEFAULT 'store';
ALTER TABLE meta_whatsapp_connections ADD COLUMN IF NOT EXISTS "defaultStoreId" uuid NULL REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE meta_whatsapp_connections ADD COLUMN IF NOT EXISTS "inboundRouting" varchar NOT NULL DEFAULT 'last_customer_store';
ALTER TABLE meta_whatsapp_connections ALTER COLUMN "storeId" DROP NOT NULL;

UPDATE meta_whatsapp_connections
SET scope = 'store', "defaultStoreId" = COALESCE("defaultStoreId", "storeId")
WHERE scope IS NULL OR scope = '' OR scope = 'store';

DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'meta_whatsapp_connections'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%"organizationId"%'
      AND indexdef LIKE '%"storeId"%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', rec.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meta_whatsapp_store_scope"
  ON meta_whatsapp_connections ("organizationId", "storeId")
  WHERE scope = 'store' AND "storeId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meta_whatsapp_organization_scope"
  ON meta_whatsapp_connections ("organizationId")
  WHERE scope = 'organization' AND "storeId" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_meta_whatsapp_scope" ON meta_whatsapp_connections ("organizationId", scope);

-- ---------------------------
-- Organization/store taxonomy
-- ---------------------------
ALTER TABLE customer_categories ADD COLUMN IF NOT EXISTS "organizationId" uuid NULL REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customer_categories ADD COLUMN IF NOT EXISTS scope varchar NOT NULL DEFAULT 'store';
ALTER TABLE customer_categories ALTER COLUMN "storeId" DROP NOT NULL;
UPDATE customer_categories c
SET "organizationId" = s."organizationId", scope = 'store'
FROM stores s
WHERE c."storeId" = s.id AND c."organizationId" IS NULL;

ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS "organizationId" uuid NULL REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS scope varchar NOT NULL DEFAULT 'store';
ALTER TABLE customer_tags ALTER COLUMN "storeId" DROP NOT NULL;
UPDATE customer_tags t
SET "organizationId" = s."organizationId", scope = 'store'
FROM stores s
WHERE t."storeId" = s.id AND t."organizationId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customer_categories WHERE "organizationId" IS NULL) THEN
    ALTER TABLE customer_categories ALTER COLUMN "organizationId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM customer_tags WHERE "organizationId" IS NULL) THEN
    ALTER TABLE customer_tags ALTER COLUMN "organizationId" SET NOT NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS "UQ_customer_categories_store_name";
DROP INDEX IF EXISTS "UQ_customer_tags_store_name";
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_categories_store_scope_name"
  ON customer_categories ("organizationId", "storeId", lower(name))
  WHERE scope = 'store' AND "storeId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_categories_org_scope_name"
  ON customer_categories ("organizationId", lower(name))
  WHERE scope = 'organization' AND "storeId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_tags_store_scope_name"
  ON customer_tags ("organizationId", "storeId", lower(name))
  WHERE scope = 'store' AND "storeId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_tags_org_scope_name"
  ON customer_tags ("organizationId", lower(name))
  WHERE scope = 'organization' AND "storeId" IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_customer_categories_org_scope" ON customer_categories ("organizationId", scope, "storeId");
CREATE INDEX IF NOT EXISTS "IDX_customer_tags_org_scope" ON customer_tags ("organizationId", scope, "storeId");

-- ---------------------------
-- Explicit branch membership / access
-- ---------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar NOT NULL DEFAULT 'agent',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_store_members_store_user" UNIQUE ("storeId", "userId")
);
CREATE INDEX IF NOT EXISTS "IDX_store_members_user" ON store_members ("userId");

-- Preserve pre-existing access for non-owner/admin organization members.
-- Owner/Admin do not require explicit rows; they always see every branch in their organization.
INSERT INTO store_members ("storeId", "userId", role)
SELECT s.id, om."userId", CASE WHEN om.role = 'supervisor' THEN 'supervisor' ELSE 'agent' END
FROM organization_members om
JOIN stores s ON s."organizationId" = om."organizationId"
WHERE om.role NOT IN ('owner', 'admin')
ON CONFLICT ("storeId", "userId") DO NOTHING;

COMMIT;
