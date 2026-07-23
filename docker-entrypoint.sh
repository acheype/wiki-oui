#!/bin/sh
set -e

echo "Applying pending database migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Seeding reserved pages and example content (first install only, skipped once the database has content)..."
SEED_ONLY_IF_EMPTY=1 ./node_modules/.bin/tsx prisma/seed.ts

echo "Starting WikiOui..."
exec node server.js
