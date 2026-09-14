# Hostinger VPS Deployment

Use this guide after removing the previous project from the VPS. Labbaik will run as the main Docker application on the server and will own ports `80` and `443` through its own Traefik proxy.

Production stack:

- Traefik reverse proxy with automatic HTTPS
- Vite frontend served by Nginx
- NestJS backend running in production mode
- PostgreSQL, MongoDB, and Redis inside Docker
- Optional Adminer for database inspection through SSH tunnel

The root [docker-compose.yml](../docker-compose.yml) is production-ready for Hostinger Docker Manager "Compose from URL".

Use [docker-compose.dev.yml](../docker-compose.dev.yml) only for local development.

Do not use [docker-compose.hostinger-proxy.yml](../docker-compose.hostinger-proxy.yml) unless another project already has an active reverse proxy on the VPS.

## Hostinger Docker Manager URL Deploy

In Hostinger:

1. Open **VPS > Docker Manager**
2. Click **Compose**
3. Choose **Compose from URL**
4. Paste your GitHub repository URL or the raw compose URL
5. Project name: `labbaik`
6. Deploy

If Hostinger asks for environment variables, set these:

```env
APP_DOMAIN=srv1607970.hstgr.cloud
PUBLIC_API_URL=https://srv1607970.hstgr.cloud
LETSENCRYPT_EMAIL=your-email@example.com
POSTGRES_PASSWORD=use-a-strong-postgres-password
MONGO_INITDB_ROOT_PASSWORD=use-a-strong-mongo-password
JWT_SECRET=use-a-long-random-secret
WHATSAPP_VERIFY_TOKEN=use-a-secret-verify-token
```

If you use a custom domain, replace the two domain values:

```env
APP_DOMAIN=labbaik.your-domain.com
PUBLIC_API_URL=https://labbaik.your-domain.com
```

The compose file includes safe defaults for the Hostinger VPS hostname, so it can deploy directly from URL. Still, change secrets before real production use.

## 1. Prepare DNS

Create an `A` record for your domain or subdomain that points to the Hostinger VPS public IP.

Example:

```text
labbaik.example.com -> VPS_PUBLIC_IP
```

Wait until DNS resolves before deploying, otherwise Traefik may fail to issue the HTTPS certificate.

Check DNS from your machine:

```bash
nslookup labbaik.example.com
```

## 2. SSH Into The VPS

```bash
ssh root@VPS_PUBLIC_IP
```

Recommended project path:

```bash
mkdir -p /opt/labbaik
cd /opt/labbaik
```

## 3. Optional Cleanup From Previous Project

Only run these if the old project containers/volumes are still present and you are sure you no longer need their data.

View containers:

```bash
docker ps -a
```

Stop old project containers if they still exist:

```bash
docker stop whiter-proxy whiter-frontend whiter-backend whiter-postgres
docker rm whiter-proxy whiter-frontend whiter-backend whiter-postgres
```

Remove old project volumes only if you no longer need its database/cert data:

```bash
docker volume ls
```

Be careful with volume deletion. Do not delete volumes unless you recognize them as old-project-only data.

## 4. Install Docker

Install Docker and the Docker Compose plugin:

```bash
apt update
apt install -y ca-certificates curl git ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify:

```bash
docker --version
docker compose version
```

## 5. Configure Firewall

Open only SSH, HTTP, and HTTPS:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

Do not open Postgres, MongoDB, Redis, backend, frontend, or Adminer ports publicly.

## 6. Upload Or Clone The Project

Using Git:

```bash
cd /opt/labbaik
git clone YOUR_REPOSITORY_URL .
```

If the folder already contains the project:

```bash
cd /opt/labbaik
git pull
```

If you do not use Git, upload the project files to `/opt/labbaik`.

## 7. Configure Production Environment

Copy the template:

```bash
cp .env.production.example .env.production
nano .env.production
```

Set at least these values:

```env
APP_DOMAIN=labbaik.example.com
PUBLIC_API_URL=https://labbaik.example.com
LETSENCRYPT_EMAIL=admin@labbaik.example.com

POSTGRES_USER=labbaik_admin
POSTGRES_PASSWORD=use-a-strong-postgres-password
POSTGRES_DB=labbaik_db

MONGO_INITDB_ROOT_USERNAME=labbaik_mongo_admin
MONGO_INITDB_ROOT_PASSWORD=use-a-strong-mongo-password
MONGO_DATABASE=labbaik_chats

JWT_SECRET=use-a-long-random-secret
JWT_EXPIRATION=1d
WHATSAPP_VERIFY_TOKEN=use-a-secret-verify-token
```

Generate secrets. Use `-hex` for database passwords because Mongo and Postgres passwords are also used inside shell healthchecks and connection URLs:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use the first value for `POSTGRES_PASSWORD` and the second for `MONGO_INITDB_ROOT_PASSWORD`.

Generate a strong JWT secret:

```bash
openssl rand -hex 48
```

Add AI provider keys only if you want those providers enabled:

```env
OPENAI_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
```

## 8. Deploy

Run:

```bash
chmod +x scripts/deploy-hostinger.sh
./scripts/deploy-hostinger.sh
```

The script runs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

## 9. Verify

Check containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Check the app:

```bash
curl -I https://labbaik.example.com
curl -I https://labbaik.example.com/api-docs
```

Check logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f traefik
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

Open:

```text
https://labbaik.example.com
https://labbaik.example.com/api-docs
```

## 10. Adminer

Adminer is available only when you enable the `tools` profile. It is bound to VPS localhost, not the public internet.

Start Adminer:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tools up -d adminer
```

Create an SSH tunnel from your local machine:

```bash
ssh -L 8080:127.0.0.1:8080 root@VPS_PUBLIC_IP
```

Open locally:

```text
http://localhost:8080
```

Adminer login:

```text
System: PostgreSQL
Server: postgres
Username: value of POSTGRES_USER
Password: value of POSTGRES_PASSWORD
Database: value of POSTGRES_DB
```

Stop Adminer when finished:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile tools stop adminer
```

## 11. Meta Webhook URLs

Use these HTTPS URLs after deployment, replacing the domain with your `APP_DOMAIN`:

```text
https://srv1607970.hstgr.cloud/webhooks/whatsapp
https://srv1607970.hstgr.cloud/webhooks/instagram
https://srv1607970.hstgr.cloud/webhooks/facebook
```

The WhatsApp verify token is:

```text
WHATSAPP_VERIFY_TOKEN
```

from `.env.production`.

## 12. Updating Later

On the VPS:

```bash
cd /opt/labbaik
git pull
./scripts/deploy-hostinger.sh
```

## 13. Troubleshooting

If HTTPS does not work:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs traefik
```

Common causes:

- DNS `A` record is not pointing to the VPS IP yet.
- Ports `80` or `443` are blocked by firewall.
- Another container or service is still using ports `80` or `443`.

Check port usage:

```bash
ss -tulpn | grep -E ':80|:443'
```

If the backend is unhealthy or restarting:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs postgres
docker compose --env-file .env.production -f docker-compose.prod.yml logs mongodb
```

If frontend API calls fail, confirm:

```env
PUBLIC_API_URL=https://labbaik.example.com
```

Then rebuild:

```bash
./scripts/deploy-hostinger.sh
```

## Notes

- Keep `.env.production` private. It is ignored by Git.
- Do not expose database ports publicly.
- Traefik is the public entrypoint and handles HTTPS automatically.
- The frontend production image runs `vite build` directly because the current frontend has TypeScript strictness errors unrelated to bundling. Fix those before switching the Dockerfile back to `npm run build`.
