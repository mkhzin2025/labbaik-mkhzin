-- Labbaik SaaS: customer branch isolation + categories/tags + per-branch Meta connections
-- Run on PostgreSQL before deploying this release when synchronize is disabled.
-- Safe to run repeatedly.
BEGIN;

CREATE TABLE IF NOT EXISTS customer_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  color varchar NOT NULL DEFAULT '#7c3aed',
  "isActive" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_categories_store_name" ON customer_categories ("storeId", name);
CREATE INDEX IF NOT EXISTS "IDX_customer_categories_store" ON customer_categories ("storeId");

CREATE TABLE IF NOT EXISTS customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storeId" uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  color varchar NOT NULL DEFAULT '#2563eb',
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_tags_store_name" ON customer_tags ("storeId", name);
CREATE INDEX IF NOT EXISTS "IDX_customer_tags_store" ON customer_tags ("storeId");

CREATE TABLE IF NOT EXISTS customer_category_links (
  "customerId" uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "categoryId" uuid NOT NULL REFERENCES customer_categories(id) ON DELETE CASCADE,
  PRIMARY KEY ("customerId", "categoryId")
);
CREATE INDEX IF NOT EXISTS "IDX_customer_category_links_customer" ON customer_category_links ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_customer_category_links_category" ON customer_category_links ("categoryId");

CREATE TABLE IF NOT EXISTS customer_tag_links (
  "customerId" uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "tagId" uuid NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  PRIMARY KEY ("customerId", "tagId")
);
CREATE INDEX IF NOT EXISTS "IDX_customer_tag_links_customer" ON customer_tag_links ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_customer_tag_links_tag" ON customer_tag_links ("tagId");

CREATE INDEX IF NOT EXISTS "IDX_customers_store" ON customers ("storeId");
CREATE INDEX IF NOT EXISTS "IDX_customers_store_updated" ON customers ("storeId", "updatedAt" DESC);

-- Existing versions allowed only one Meta connection per organization.
-- Remove that legacy uniqueness so each branch can own one connection.
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'meta_whatsapp_connections'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE ("organizationId")'
  LOOP
    EXECUTE format('ALTER TABLE meta_whatsapp_connections DROP CONSTRAINT %I', rec.conname);
  END LOOP;

  FOR rec IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'meta_whatsapp_connections'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%("organizationId")%'
      AND indexdef NOT LIKE '%"storeId"%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', rec.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meta_whatsapp_org_store"
  ON meta_whatsapp_connections ("organizationId", "storeId");

-- Protect customer branch ownership if all historical rows are already linked.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers WHERE "storeId" IS NULL) THEN
    ALTER TABLE customers ALTER COLUMN "storeId" SET NOT NULL;
  END IF;
END $$;

COMMIT;
