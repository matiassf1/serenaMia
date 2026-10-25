# Serena Mia — sitio web + panel de stock

Next.js (App Router, TypeScript) + Tailwind + Prisma/PostgreSQL + Vitest + Playwright.
Spec y plan en `docs/superpowers/`.

## Desarrollo local

Requiere Node 20+ y Docker. Postgres para desarrollo y test (un solo contenedor, puerto 5433 para no chocar con otros Postgres locales):

```sh
docker run -d --name serenamia-postgres -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine
docker exec serenamia-postgres psql -U postgres -c "CREATE DATABASE serenamia;" -c "CREATE DATABASE serenamia_test;"
```

Luego:

```sh
cp .env.example .env     # DATABASE_URL, DATABASE_URL_TEST, SESSION_SECRET, CRON_SECRET, UPLOAD_DIR
npm install
npm run db:migrate       # aplica migraciones a DATABASE_URL
npm run db:seed          # datos de ejemplo (idempotente)
npm run dev
```

## Scripts

- `npm test` — Vitest (unit + servicio). Usa `DATABASE_URL_TEST`; aplica migraciones solo y limpia tablas entre tests.
- `npm run test:e2e` — Playwright (humo, móvil).
- `npm run db:migrate` — `prisma migrate deploy`. Para crear una migración nueva: `npm run db:migrate:dev -- --name <nombre>`.
- `npm run db:seed` — seed idempotente.
