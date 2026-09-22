# Labbaik – Public URLs for Meta App Review

Meta's App Review (Facebook/Instagram/WhatsApp Business) requires a public
Privacy Policy URL and, for apps that store user data, a Data Deletion
Callback URL (or a Data Deletion Instructions URL). These pages already
exist in this repo — this file just collects the exact links to paste into
the Meta Developer Console (App Dashboard → Settings → Basic).

## URLs to submit

| Meta field | URL |
|---|---|
| Privacy Policy URL | `https://labbaik.mkhzin-store.com/privacy` |
| Terms of Service URL | `https://labbaik.mkhzin-store.com/terms` |
| Data Deletion Instructions URL | `https://labbaik.mkhzin-store.com/account-deletion` |

Alternate paths that resolve to the same pages (also public, no auth):

- `/privacy-policy` → same as `/privacy`
- `/terms-of-service` → same as `/terms`
- `/data-deletion` → same as `/account-deletion`

Source of truth for these values: `frontend/src/lib/legal-config.ts`
(`LEGAL_CONFIG.privacyUrl` / `termsUrl` / `deletionUrl`).

## How the Data Deletion flow works

Meta only requires a URL where a user can request deletion (a "Data Deletion
Instructions URL" is enough — a callback endpoint that auto-processes Meta's
signed request is optional and not implemented here).

1. User opens `https://labbaik.mkhzin-store.com/account-deletion`
   (`frontend/src/pages/AccountDeletionPage.tsx`).
2. The form submits to the public backend endpoint
   `POST /public/account-deletion-request` — no auth required
   (`backend/src/modules/account-deletion/account-deletion.controller.ts`).
   Note: the backend has no global `/api` prefix (commented out in
   `backend/src/main.ts`), so the route is `/public/account-deletion-request`
   directly under the API domain (`PUBLIC_API_URL`), not under `/api`.
3. The request is stored in the `account_deletion_requests` table
   (`AccountDeletionRequest` entity) with status `PENDING`.
4. Staff review and action the request from the admin-only pages:
   - `GET /admin/account-deletion-requests`
   - `PATCH /admin/account-deletion-requests/:id`
   - Frontend: `/dashboard/deletion-requests`
     (`frontend/src/pages/AccountDeletionAdminPage.tsx`), requires
     `JwtAuthGuard` + `PlatformAdminGuard`.

## Where these pages are served from

All three pages (`/privacy`, `/terms`, `/account-deletion`) are React SPA
routes declared outside the authenticated `/dashboard/*` block in
`frontend/src/App.tsx`, wrapped by `frontend/src/components/layout/PublicLayout.tsx`.
They are not static HTML files — `frontend/nginx.conf` serves the SPA with a
`try_files ... /index.html` fallback, so any of the paths above resolves
client-side.

## Checklist before submitting to Meta

- [ ] Confirm `https://labbaik.mkhzin-store.com/privacy` loads over HTTPS
      with a valid certificate.
- [ ] Confirm `https://labbaik.mkhzin-store.com/account-deletion` loads and
      the form successfully posts to `/public/account-deletion-request`.
- [ ] Confirm `https://labbaik.mkhzin-store.com/terms` loads.
- [ ] Paste the three URLs from the table above into Meta App Dashboard →
      Settings → Basic.
