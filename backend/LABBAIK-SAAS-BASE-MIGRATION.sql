-- Labbaik SaaS base schema migration
-- Purpose: upgrade the original Labbaik PostgreSQL schema before customer/meta scope migrations.
-- Safe to re-run on PostgreSQL. Does not delete existing data.
\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Organizations / tenants
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  slug varchar NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_organizations_slug" ON organizations (slug);

ALTER TABLE stores ADD COLUMN IF NOT EXISTS "organizationId" uuid NULL;
CREATE INDEX IF NOT EXISTS "IDX_stores_organization" ON stores ("organizationId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'stores'::regclass
      AND conname = 'FK_stores_organization'
  ) THEN
    ALTER TABLE stores
      ADD CONSTRAINT "FK_stores_organization"
      FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar NOT NULL DEFAULT 'owner',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_organization_members_org_user" UNIQUE ("organizationId", "userId")
);
CREATE INDEX IF NOT EXISTS "IDX_organization_members_user" ON organization_members ("userId");
CREATE INDEX IF NOT EXISTS "IDX_organization_members_org" ON organization_members ("organizationId");

-- ------------------------------------------------------------
-- Meta / WhatsApp connections (final entity shape)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope varchar NOT NULL DEFAULT 'store',
  "storeId" uuid NULL REFERENCES stores(id) ON DELETE CASCADE,
  "defaultStoreId" uuid NULL REFERENCES stores(id) ON DELETE SET NULL,
  "inboundRouting" varchar NOT NULL DEFAULT 'last_customer_store',
  mode varchar NOT NULL DEFAULT 'shared_app',
  "appId" varchar NULL,
  "appSecret" text NULL,
  "wabaId" varchar NOT NULL,
  "phoneNumberId" varchar NOT NULL,
  "displayPhoneNumber" varchar NULL,
  "accessToken" text NOT NULL,
  "verifyToken" text NOT NULL,
  "webhookUrl" varchar NULL,
  status varchar NOT NULL DEFAULT 'draft',
  "lastError" varchar NULL,
  "webhookSubscribedAt" timestamptz NULL,
  "lastWebhookAt" timestamptz NULL,
  "templatesSyncedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meta_whatsapp_phone_number_id" ON meta_whatsapp_connections ("phoneNumberId");
CREATE INDEX IF NOT EXISTS "IDX_meta_whatsapp_org_scope" ON meta_whatsapp_connections ("organizationId", scope);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meta_whatsapp_store_scope"
  ON meta_whatsapp_connections ("organizationId", "storeId")
  WHERE scope = 'store' AND "storeId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_meta_whatsapp_organization_scope"
  ON meta_whatsapp_connections ("organizationId")
  WHERE scope = 'organization' AND "storeId" IS NULL;

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectionId" uuid NOT NULL REFERENCES meta_whatsapp_connections(id) ON DELETE CASCADE,
  "metaTemplateId" varchar NULL,
  name varchar NOT NULL,
  language varchar NOT NULL,
  category varchar NULL,
  status varchar NULL,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  "qualityScore" jsonb NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_whatsapp_templates_connection_name_language" UNIQUE ("connectionId", name, language)
);
CREATE INDEX IF NOT EXISTS "IDX_whatsapp_templates_connection" ON whatsapp_templates ("connectionId");

-- ------------------------------------------------------------
-- Billing plans / subscriptions / wallet / Moyasar tokenization
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar NOT NULL,
  "nameAr" varchar NOT NULL,
  "nameEn" varchar NULL,
  description text NULL,
  "monthlyPriceMinor" integer NOT NULL DEFAULT 0,
  currency varchar NOT NULL DEFAULT 'SAR',
  "trialDays" integer NOT NULL DEFAULT 0,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  "isActive" boolean NOT NULL DEFAULT true,
  "isPublic" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billing_plans_code" ON billing_plans (code);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider varchar NOT NULL DEFAULT 'moyasar',
  "providerTokenEncrypted" text NOT NULL,
  "providerTokenHash" varchar NOT NULL,
  brand varchar NULL,
  funding varchar NULL,
  "lastFour" varchar NULL,
  "expiryMonth" varchar NULL,
  "expiryYear" varchar NULL,
  "holderName" varchar NULL,
  status varchar NOT NULL DEFAULT 'pending',
  "isDefault" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_payment_methods_org_token_hash" UNIQUE ("organizationId", "providerTokenHash")
);
CREATE INDEX IF NOT EXISTS "IDX_payment_methods_org" ON payment_methods ("organizationId");

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "balanceMicros" bigint NOT NULL DEFAULT 0,
  currency varchar NOT NULL DEFAULT 'SAR',
  "autoRechargeEnabled" boolean NOT NULL DEFAULT false,
  "autoRechargeThresholdMicros" bigint NOT NULL DEFAULT 10000000,
  "autoRechargeAmountMicros" bigint NOT NULL DEFAULT 100000000,
  "lowBalanceThresholdMicros" bigint NOT NULL DEFAULT 5000000,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_wallets_organization" UNIQUE ("organizationId")
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "planId" uuid NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  status varchar NOT NULL DEFAULT 'active',
  "currentPeriodStart" timestamptz NOT NULL,
  "currentPeriodEnd" timestamptz NOT NULL,
  "trialEndsAt" timestamptz NULL,
  "graceEndsAt" timestamptz NULL,
  "autoRenew" boolean NOT NULL DEFAULT true,
  "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
  "paymentMethodId" uuid NULL REFERENCES payment_methods(id) ON DELETE SET NULL,
  "lastProviderPaymentId" varchar NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_subscriptions_organization" UNIQUE ("organizationId")
);
CREATE INDEX IF NOT EXISTS "IDX_subscriptions_plan" ON subscriptions ("planId");

CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'created',
  "amountMinor" integer NOT NULL,
  currency varchar NOT NULL DEFAULT 'SAR',
  "providerPaymentId" varchar NOT NULL,
  "providerStatus" varchar NULL,
  "paymentMethodId" uuid NULL REFERENCES payment_methods(id) ON DELETE SET NULL,
  "planId" uuid NULL REFERENCES billing_plans(id) ON DELETE SET NULL,
  "idempotencyKey" varchar NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "paidAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billing_payments_provider_payment_id" ON billing_payments ("providerPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billing_payments_idempotency" ON billing_payments ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_billing_payments_org" ON billing_payments ("organizationId");

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "walletId" uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  category varchar NOT NULL,
  "amountMicros" bigint NOT NULL,
  "balanceBeforeMicros" bigint NOT NULL,
  "balanceAfterMicros" bigint NOT NULL,
  "idempotencyKey" varchar NULL,
  "referenceType" varchar NULL,
  "referenceId" varchar NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wallet_transactions_idempotency" ON wallet_transactions ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_org_created" ON wallet_transactions ("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_wallet" ON wallet_transactions ("walletId");

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "usageType" varchar NOT NULL,
  "nameAr" varchar NOT NULL,
  "priceMicros" bigint NOT NULL DEFAULT 0,
  currency varchar NOT NULL DEFAULT 'SAR',
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pricing_rules_usage_type" ON pricing_rules ("usageType");

COMMIT;
