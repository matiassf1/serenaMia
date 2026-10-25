# Serena Mia — sitio web + panel de stock

Sitio de pedidos y panel de administración para Serena Mia (Estética & Insumos, San Miguel de Tucumán).
Next.js (App Router, TypeScript) + Tailwind + Prisma/PostgreSQL + Vitest + Playwright.
El diseño y el plan de implementación están en `docs/superpowers/`. El despliegue está en `docs/deploy.md`.

## Requisitos

- Node 20 o superior
- Docker (para Postgres local)

## Puesta en marcha local

1. **Postgres** en el puerto **5433** (así no choca con otros Postgres locales en 5432):

   ```sh
   docker run -d --name serenamia-postgres -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16-alpine
   docker exec serenamia-postgres psql -U postgres -c "CREATE DATABASE serenamia;" -c "CREATE DATABASE serenamia_test;"
   ```

   Si el contenedor ya existe: `docker start serenamia-postgres`.

2. **Variables de entorno**: copiá el ejemplo y completá los secretos.

   ```sh
   cp .env.example .env
   ```

   | Variable | Para qué sirve |
   |---|---|
   | `DATABASE_URL` | Base de desarrollo (`.../serenamia`). |
   | `DATABASE_URL_TEST` | Base de los tests de Vitest (`.../serenamia_test`). Los tests la limpian: nunca apuntarla a la de desarrollo. |
   | `SESSION_SECRET` | Firma la sesión del admin. Cadena larga y aleatoria (`openssl rand -base64 48`). |
   | `CRON_SECRET` | Protege `POST /api/cron/expire`. Otra cadena aleatoria. |
   | `UPLOAD_DIR` | Carpeta de fotos de productos. Local: `./uploads`. En Railway: `/data/uploads`. |

3. **Instalar, migrar y sembrar**:

   ```sh
   npm install
   npm run db:migrate       # aplica las migraciones a DATABASE_URL
   npm run db:seed          # datos de ejemplo (idempotente)
   npm run dev              # http://localhost:3000
   ```

4. **Crear el usuario admin** (entrar en `/admin/login`):

   ```sh
   npm run admin:create -- elias@ejemplo.com "una-clave-de-8-o-mas"
   ```

   Si el email ya existe, le cambia la contraseña. Mínimo 8 caracteres.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` / `npm start` | Build de producción / arranque (`start` aplica migraciones antes de levantar). |
| `npm test` | Vitest: unit y servicio, contra `DATABASE_URL_TEST`. Aplica migraciones solo. |
| `npm run test:e2e` | Playwright en celular (390 px): humo, accesibilidad (axe) y cada pantalla. Usa `DATABASE_URL`; levanta `next dev` solo. |
| `npm run lint` | ESLint. |
| `npm run db:migrate` | `prisma migrate deploy`. Migración nueva: `npm run db:migrate:dev -- --name <nombre>`. |
| `npm run db:seed` | Seed idempotente. |
| `npm run admin:create -- <email> <clave>` | Crea o actualiza un admin. |

### Correr el e2e sin pisar tu base ni otro servidor

Los specs comparten base y crean/borran sus propios datos; corren de a uno (`workers: 1`). Para aislarlos:

```sh
docker exec serenamia-postgres psql -U postgres -c "CREATE DATABASE serenamia_e2e;"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/serenamia_e2e"
npx prisma migrate deploy && npm run db:seed
E2E_PORT=3100 npm run test:e2e     # E2E_PORT evita chocar con otro `next dev`
E2E_SHOTS_DIR=/tmp/shots npm run test:e2e   # además guarda capturas a 390 px
```

## Documentación

- `docs/deploy.md` — despliegue en Railway y checklist de lo que falta hacer a mano (cuenta de Railway, productos reales con Elías).
- `docs/superpowers/specs/` — diseño. `docs/superpowers/plans/` — plan por tareas.
