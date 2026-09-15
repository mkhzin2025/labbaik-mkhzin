# Frontend blank screen fix

Fixed:

- `Branch` imports are now type-only under `verbatimModuleSyntax`.
- Removed unused `Filter` icon import.
- Added explicit `string` typing to WhatsApp template variable callbacks.
- Added Vite development proxy routes for `/organizations`, `/integrations`, and `/billing`.

Run locally:

```powershell
npm run build
npm run dev
```

If Vite was already running, stop it with Ctrl+C and start it again so `vite.config.ts` is reloaded.
