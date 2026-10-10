-- Customers who declined marketing campaigns; bulk template sends skip their number.
-- The backend applies this automatically on boot (CustomersService.onModuleInit); run it by hand only if that is disabled.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS "marketingOptOut" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marketingOptOutAt" timestamptz NULL;
