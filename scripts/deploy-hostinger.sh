#!/usr/bin/env sh
set -eu

if [ ! -f .env.production ]; then
  echo "Missing .env.production. Copy .env.production.example and fill it first."
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

docker compose --env-file .env.production -f "$COMPOSE_FILE" build
docker compose --env-file .env.production -f "$COMPOSE_FILE" up -d
docker compose --env-file .env.production -f "$COMPOSE_FILE" ps
