# Despliegue en Railway

El despliegue es un paso humano (cuenta de Railway de Matías). Se hace desde el dashboard, desde GitHub; el CLI `railway` no es requisito.

## 0. Pre-flight

Ejecutar `git remote -v` antes de empezar.

- Resultado al 2026-10-25: `origin https://github.com/matiassf1/serenaMia.git` (fetch/push). Si en tu copia sale vacío, crear el repo en GitHub, `git remote add origin <url>` y `git push -u origin <rama>` antes del paso 1.
- Railway despliega la rama que se conecte (por defecto `main`). Verificar que el código esté pusheado a esa rama.
- `railway whoami` solo si se instala el CLI; no es requisito.

## 1. Proyecto y servicio web

1. Railway → **New Project** → **Deploy from GitHub repo** → elegir el repo.
2. La config de build/start vive en `railway.json` (builder Railpack, `npm run build`, start `npm start`, healthcheck `/api/health`). Si Railpack falla, alternativa: cambiar `builder` a `NIXPACKS` o agregar un `Dockerfile`.
3. `npm start` ejecuta `prisma migrate deploy && next start`: las migraciones se aplican en cada arranque. `prisma` está en `dependencies` para que el CLI exista en runtime.

## 2. Postgres

1. En el proyecto: **New** → **Database** → **PostgreSQL**.
2. En el servicio web → **Variables** → agregar `DATABASE_URL` como referencia: `${{Postgres.DATABASE_URL}}`.

## 3. Volume para uploads

1. En el servicio web → **Volumes** (o clic derecho en el canvas → **Volume**) → **mount path** `/data/uploads`.
2. Un volumen se adjunta a **un solo servicio**: debe ir en el servicio web (no en Postgres ni en otro).
3. Con el volumen montado, `UPLOAD_DIR=/data/uploads`.

## 4. Variables de entorno (servicio web)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SESSION_SECRET` | cadena aleatoria larga (`openssl rand -base64 48`) |
| `CRON_SECRET` | otra cadena aleatoria distinta |
| `UPLOAD_DIR` | `/data/uploads` |

`PORT` lo inyecta Railway; `next start` lo respeta. Ver `.env.example` para desarrollo local.

## 5. Cron diario de expiración

El endpoint `POST /api/cron/expire` cancela los pedidos con pago pendiente vencidos (48 h por defecto) y repone su stock una sola vez. Es idempotente: una segunda llamada devuelve `{"expired":0}`. Responde `401` si falta el header o el secreto no coincide.

1. Crear un servicio Railway **Cron** (o un schedule en un servicio aparte) con schedule `0 6 * * *` (UTC; ≈ 03:00 en Tucumán, una vez por día).
2. Comando del cron:
   ```
   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/expire
   ```
3. El servicio cron necesita su propio `CRON_SECRET` con el mismo valor que el web.
4. Probarlo a mano: sin header debe dar `401`; con el header correcto, `{"expired":N}`.

Además la expiración corre de forma perezosa al listar pedidos en el admin y al consultar el seguimiento, así que el cron diario es una red de seguridad.

## 6. Verificación

Tras el primer deploy:

```
curl https://<dominio>.up.railway.app/api/health
# {"ok":true,"db":true}
```

Si la base no responde devuelve `503 {"ok":false,"db":false}` y Railway marca el deploy como fallido. Después correr una vez el seed si se quiere el catálogo de ejemplo: `railway run npm run db:seed` (requiere CLI) o desde una shell del servicio.
