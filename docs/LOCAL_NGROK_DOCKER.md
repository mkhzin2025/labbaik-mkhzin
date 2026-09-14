# Local Docker Ngrok Preview

Use this setup when you want a temporary public URL for local development without deploying to a VPS.

The ngrok URL serves:

- Frontend
- Backend REST API
- Swagger UI
- Socket.IO

All traffic goes through the Vite dev server, which proxies backend paths to the backend Docker container.

## 1. Create Ngrok Token File

Copy the example:

```bash
cp .env.ngrok.example .env.ngrok
```

Add your ngrok authtoken:

```env
NGROK_AUTHTOKEN=your-ngrok-authtoken
```

Get the token from:

```text
https://dashboard.ngrok.com/get-started/your-authtoken
```

## 2. Start Local Stack With Ngrok

```bash
docker compose --env-file .env.ngrok -f docker-compose.dev.yml --profile share up -d --build
```

## 3. Get Public URL

Open the local ngrok inspector:

```text
http://localhost:4040
```

Or run:

```bash
docker logs labbaik-ngrok
```

Look for a forwarding URL like:

```text
https://abc123.ngrok-free.app
```

Open that URL. Swagger will be:

```text
https://abc123.ngrok-free.app/api-docs
```

## 4. Stop Ngrok Preview

```bash
docker compose --env-file .env.ngrok -f docker-compose.dev.yml --profile share down
```

## Notes

- The normal local app still uses Docker, but now the frontend uses same-origin API calls.
- Vite proxies API paths such as `/auth`, `/stores`, `/api-docs`, and `/socket.io` to the backend container.
- If ngrok gives a new URL, use the new URL for testing and webhooks.
- For Meta webhooks, use:

```text
https://abc123.ngrok-free.app/webhooks/whatsapp
```
