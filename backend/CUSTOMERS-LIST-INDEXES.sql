-- ======================================================================================
-- Indexes for the customers list (search + sort). The backend creates these itself after boot
-- (CustomersService.ensureListIndexes); run by hand only if that is not possible.
-- CONCURRENTLY: builds without blocking writes, but must run outside a transaction.
-- ======================================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- "Contains" search on name / email / phone (LIKE '%term%') through trigram indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_fullname_trgm ON customers USING gin (LOWER(COALESCE("fullName", '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email_trgm ON customers USING gin (LOWER(COALESCE(email, '')) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_phone_trgm ON customers USING gin (COALESCE("phoneNumber", '') gin_trgm_ops);

-- List sort orders; they must match the ORDER BY exactly (direction, NULLS LAST, then id).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_updated_at ON customers ("updatedAt" DESC NULLS LAST, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_store_updated_at ON customers ("storeId", "updatedAt" DESC NULLS LAST, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_created_at ON customers ("createdAt" DESC NULLS LAST, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_full_name ON customers ("fullName" ASC NULLS LAST, id);
