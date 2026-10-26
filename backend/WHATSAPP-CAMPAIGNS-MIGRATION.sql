-- ======================================================================================
-- Migration: WhatsApp template campaigns (campaign log + per-recipient delivery tracking)
-- Only needed when TYPEORM_SYNCHRONIZE is disabled.
-- ======================================================================================

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "connectionId" uuid NOT NULL,
  "templateId" uuid NULL,
  "templateName" varchar NOT NULL,
  "templateLanguage" varchar NOT NULL,
  "templateCategory" varchar NULL,
  name varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'queued',
  "createdByUserId" uuid NULL,
  "createdByName" varchar NULL,
  "storeIds" jsonb NOT NULL DEFAULT '[]',
  audience jsonb NOT NULL,
  parameters jsonb NOT NULL,
  "previewText" text NULL,
  "sourceRecords" int NOT NULL DEFAULT 0,
  "duplicatesRemoved" int NOT NULL DEFAULT 0,
  "optedOutSkipped" int NOT NULL DEFAULT 0,
  "totalRecipients" int NOT NULL DEFAULT 0,
  "lastError" text NULL,
  "startedAt" timestamptz NULL,
  "completedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_org_created ON whatsapp_campaigns ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_template ON whatsapp_campaigns ("templateId");

CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaignId" uuid NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL,
  "customerId" uuid NULL,
  "storeId" uuid NOT NULL,
  "storeName" varchar NULL,
  phone varchar NOT NULL,
  "customerName" varchar NULL,
  status varchar NOT NULL DEFAULT 'pending',
  "whatsappMessageId" varchar NULL,
  error text NULL,
  "sentAt" timestamptz NULL,
  "deliveredAt" timestamptz NULL,
  "readAt" timestamptz NULL,
  "failedAt" timestamptz NULL,
  "repliedAt" timestamptz NULL,
  "replyType" varchar NULL,
  "replyText" varchar(500) NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status ON whatsapp_campaign_recipients ("campaignId", status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_message ON whatsapp_campaign_recipients ("whatsappMessageId");
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_reply_lookup ON whatsapp_campaign_recipients ("organizationId", phone, "sentAt");

-- Scheduling and send speed
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS "scheduledAt" timestamptz NULL;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS "messagesPerSecond" int NOT NULL DEFAULT 20;
CREATE INDEX IF NOT EXISTS "IDX_whatsapp_campaigns_scheduled" ON whatsapp_campaigns ("scheduledAt") WHERE status = 'scheduled';
