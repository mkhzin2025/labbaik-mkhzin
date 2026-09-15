# Customer segmentation and branch-safe sending

This release makes the branch (`storeId`) a hard boundary for customer audiences and WhatsApp sending.

## What changed

- Customers expose an explicit `storeId` and are queried only through an authenticated organization branch.
- Customer categories are branch-scoped (`customer_categories`).
- Customer tags are branch-scoped (`customer_tags`).
- Many-to-many links allow each customer to have multiple categories and multiple tags.
- Old JSON `customers.tags` data is retained as `legacyTags` and lazily migrated into relational customer tags when customers are read.
- Meta WhatsApp connections are now unique by `(organizationId, storeId)` instead of organization only.
- Template lists, webhook connections and sending are selected per branch.
- Bulk template sending validates every selected `customerId` against the selected `storeId` before any send occurs.
- Socket clients join every branch room in the active organization so events do not disappear for secondary branches.

## Main APIs

- `GET /stores` — list organization branches.
- `GET /customers?storeId=...&categoryIds=...&tagIds=...&whatsappOnly=true`
- `GET /customers/taxonomy?storeId=...`
- `POST/PATCH/DELETE /customers/categories`
- `POST/PATCH/DELETE /customers/tags`
- `GET /integrations/meta/whatsapp?storeId=...`
- `GET /integrations/meta/whatsapp/templates?storeId=...`
- `POST /integrations/meta/whatsapp/templates/:templateId/send-bulk`

Bulk sending supports up to 500 selected customers per request. Variable values can use:

- `{{customer.fullName}}`
- `{{customer.phoneNumber}}`
- `{{customer.email}}`

## Database

If TypeORM `synchronize` is disabled, run `CUSTOMER-BRANCH-TAXONOMY-MIGRATION.sql` before this release.
