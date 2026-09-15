-- Migration: Add webhookMode to meta_whatsapp_connections
ALTER TABLE meta_whatsapp_connections ADD COLUMN IF NOT EXISTS "webhookMode" varchar NOT NULL DEFAULT 'global';
