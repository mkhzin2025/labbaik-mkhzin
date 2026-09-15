# Labbaik – Multi-tenant Meta WhatsApp integration

## What is implemented

Each Labbaik organization gets its own `meta_whatsapp_connections` row. The connection owns:

- WABA ID
- Phone Number ID
- Access Token (AES-256-GCM encrypted at rest)
- optional tenant Meta App ID + App Secret (App Secret encrypted at rest)
- generated Verify Token (encrypted at rest)
- unique tenant webhook URL
- connection / webhook / template-sync health timestamps

The tenant webhook URL format is:

`{PUBLIC_API_URL}/webhooks/meta/whatsapp/{connectionUuid}`

The backend also validates the WABA ID and Phone Number ID inside every webhook payload before accepting messages for that tenant.

## Required environment variables

```env
PUBLIC_API_URL=https://api.your-domain.com
META_GRAPH_API_VERSION=v26.0
META_APP_SECRET=... # only required for shared Labbaik Meta App mode
CREDENTIAL_ENCRYPTION_KEY=use-a-long-random-production-secret
```

`PUBLIC_API_URL` must be public HTTPS in production.

## Shared App vs Own App

### Shared Labbaik Meta App

Use `mode=shared_app`. The tenant supplies WABA ID, Phone Number ID and a valid access token for the Labbaik Meta App onboarding. Webhook POST signatures are validated with the server `META_APP_SECRET`.

### Tenant-owned Meta App

Use `mode=own_app`. In addition to WABA ID / Phone Number ID / Access Token, the tenant enters their Meta App ID and App Secret. The App Secret is encrypted and is used only to verify that tenant's webhook signatures.

## API flow

1. `POST /integrations/meta/whatsapp` – save initial connection.
2. `PATCH /integrations/meta/whatsapp` – change settings without exposing stored secrets.
3. `POST /integrations/meta/whatsapp/test` – validate token, WABA and Phone Number ID.
4. `POST /integrations/meta/whatsapp/subscribe-webhook` – subscribe the WABA and set its tenant-specific override callback URL.
5. `POST /integrations/meta/whatsapp/templates/sync` – import the current templates from Meta.
6. `GET /integrations/meta/whatsapp/templates` – list cached templates.
7. `POST /integrations/meta/whatsapp/templates/:templateId/send` – send a selected approved template.

The UI exposes steps 1–4 under **Settings → Meta / WhatsApp**, and templates under **WhatsApp Templates**.

## Incoming messages

Meta sends the tenant callback to:

- `GET /webhooks/meta/whatsapp/:connectionId` for verification
- `POST /webhooks/meta/whatsapp/:connectionId` for webhook events

For POST events Labbaik performs:

1. HMAC SHA-256 signature verification.
2. Connection lookup by opaque UUID.
3. WABA ID match check.
4. Phone Number ID match check.
5. duplicate `wamid` suppression.
6. message normalization and persistence.
7. delivery/read/failure status updates.
8. the existing AI/flow pipeline and realtime UI event.

## Compatibility with existing conversations

Saving a Meta connection automatically creates/updates the existing internal WhatsApp `Channel`. This is intentional: template sending, normal agent replies, AI replies, media downloads and inbound webhooks all use the same tenant credentials.

## Production note

The current project already uses TypeORM `synchronize: true`. The new entities follow that existing convention. Before a mature production rollout, replace automatic schema synchronization with versioned migrations and back up PostgreSQL first.
