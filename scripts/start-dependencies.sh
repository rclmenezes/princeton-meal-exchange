#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPOSITORY_ROOT"

LOCAL_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/main"

docker compose up -d

echo "Waiting for Postgres..."
for attempt in {1..30}; do
  if docker compose exec -T postgres pg_isready -U postgres -d main >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo >&2 "Postgres failed to become ready."
    docker compose ps
    exit 1
  fi

  sleep 2
done

echo "Running database migrations..."
DATABASE_URL="$LOCAL_DATABASE_URL" npm run db:migrate

echo "Waiting for the local Neon proxy..."
for attempt in {1..30}; do
  if (exec 3<>/dev/tcp/127.0.0.1/4444) >/dev/null 2>&1; then
    echo "Local dependencies are ready."
    exit 0
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo >&2 "The local Neon proxy failed to become ready."
    docker compose ps
    exit 1
  fi

  sleep 2
done
