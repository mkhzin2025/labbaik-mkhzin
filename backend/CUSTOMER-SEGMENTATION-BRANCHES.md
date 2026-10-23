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

## WhatsApp campaigns

`send-bulk` takes an `audience` instead of a list of customer ids. The server resolves it, saves a campaign and sends in the
background, so large audiences never hit the proxy timeout:

- `mode: all`: every WhatsApp-reachable customer of `storeIds`, minus `excludeCustomerIds`.
- `mode: segment`: `categoryIds` (any of), `tagIds` with `tagMatch: any | all`, `excludeCategoryIds`, `excludeTagIds`.
- `mode: manual`: exactly `customerIds`.

Numbers that opted out in any branch are skipped, and a number shared by several branches is sent once. One campaign may target
up to 50,000 records. `POST /customers/audience/summary` returns the same counts before sending, and
`GET /customers/audience/options?storeIds=&categoryIds=` lists categories/tags with reachable-customer counts.

Campaign endpoints live under `/integrations/meta/whatsapp/campaigns` (list, `:id`, `:id/recipients`, `:id/cancel`,
`:id/retry-failed`, `report`). Delivered, read and failed come from Meta status webhooks. A reply is the customer's next message
within 72 hours, or a quoted reply / button tap on the campaign message.

Variable values can use per-customer tokens; `nameFallback` replaces generated placeholder names:

- `{{customer.fullName}}`
- `{{customer.phoneNumber}}`
- `{{customer.email}}`
- `{{customer.branchName}}`

Template header media is uploaded with `POST /integrations/meta/whatsapp/media?connectionId=` (multipart `file`: JPG/PNG up to
5 MB, MP4 or PDF up to 16 MB). The dashboard compresses large photos before upload. For video/PDF headers the reverse proxy must
accept request bodies of at least 16 MB (nginx `client_max_body_size 16m;`).

## Database

If TypeORM `synchronize` is disabled, run `CUSTOMER-BRANCH-TAXONOMY-MIGRATION.sql` and `WHATSAPP-CAMPAIGNS-MIGRATION.sql`
before this release.
