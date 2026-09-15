# Organization-wide WhatsApp scope

This release supports both WhatsApp models at the same time:

- `scope=organization`: one Meta/WhatsApp number for the whole organization.
- `scope=store`: one number for a specific branch.
- Both may coexist: a central organization number plus branch-specific numbers.

An organization-wide connection has a `defaultStoreId` and `inboundRouting`:

- `last_customer_store`: route an inbound customer to the most recently used branch; if no history exists, use the default branch.
- `default_store`: route inbound traffic to the configured default branch.

Every conversation stores `metaConnectionId` in MongoDB, so manual, AI and Flow replies prefer the same WhatsApp number that received/created the conversation.

## Organization campaigns

An organization connection can target one or many accessible branches. The backend:

1. verifies every selected branch is accessible to the authenticated user,
2. loads customers only from those branches,
3. normalizes phone numbers,
4. removes cross-branch duplicate numbers,
5. sends once per unique number,
6. returns source record count, duplicate count, unique-recipient count and per-recipient result.

The frontend shows these counts before/after sending. The unified inbox shows the branch on every conversation and can filter by branch.

## Branch access

`store_members` is now the explicit branch-access table.

- Organization `owner` and `admin`: all branches.
- Organization `supervisor` and `agent`: only branches assigned in `store_members`.
- REST customer/conversation access, realtime Socket rooms and organization send lists use the same accessible-branch boundary.

Admin endpoints are available under:

- `GET /organizations/stores/:storeId/members`
- `POST /organizations/stores/:storeId/members`
- `DELETE /organizations/stores/:storeId/members/:userId`

## Customer categories and tags

Both support:

- `scope=organization`: reusable across all branches.
- `scope=store`: visible/assignable only in that branch.

## Database upgrade

When `TYPEORM_SYNCHRONIZE=false`, run in order:

1. `CUSTOMER-BRANCH-TAXONOMY-MIGRATION.sql` (if not already applied)
2. `ORGANIZATION-WHATSAPP-SCOPE-MIGRATION.sql`

Take a PostgreSQL backup first. The second migration backfills existing non-owner/admin organization members into every current branch so existing access is not unexpectedly removed during the upgrade.
