-- ======================================================================================
-- Migration: Create account_deletion_requests table for Labbaik Public & Meta Deletion
-- ======================================================================================

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  "organizationName" varchar(255),
  phone varchar(50),
  reason text,
  status varchar(50) NOT NULL DEFAULT 'PENDING',
  "matchedUserId" uuid,
  "matchedOrganizationId" uuid,
  "adminNotes" text,
  "ipAddress" varchar(100),
  "userAgent" text,
  "verifiedAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email ON account_deletion_requests(email);
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status ON account_deletion_requests(status);
