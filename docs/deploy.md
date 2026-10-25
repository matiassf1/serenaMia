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

## 7. Checklist de lanzamiento (pasos humanos)

Lo siguiente no lo hace el código: requiere la cuenta de Railway (Matías) y los datos reales (Elías). Marcar a medida que se completa.

### Matías — Railway

- [ ] Repo pusheado a la rama que despliega Railway (ver paso 0).
- [ ] Proyecto + servicio web creados desde GitHub (paso 1).
- [ ] Postgres agregado y `DATABASE_URL` referenciada (paso 2).
- [ ] Volume montado en `/data/uploads` **en el servicio web** (paso 3).
- [ ] Variables cargadas: `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `UPLOAD_DIR` (paso 4).
- [ ] Primer deploy en verde y `curl https://<dominio>/api/health` → `{"ok":true,"db":true}` (paso 6).
- [ ] Cron diario creado y probado: sin header `401`, con header `{"expired":N}` (paso 5).
- [ ] Admin de Elías creado desde una shell del servicio: `npm run admin:create -- <email> "<clave>"`. Pasarle la clave por un canal privado.
- [ ] Dominio propio (opcional) apuntado al servicio.

### Elías — datos reales

El seed (`npm run db:seed`) carga productos de ejemplo ("Producto de ejemplo 1…6"). **No correrlo en producción tal cual** si ya hay datos reales; el panel permite borrar o desactivar los de ejemplo.

- [ ] Datos del local en Ajustes → Local: nombre, frase, dirección, WhatsApp (con código de país, ej. `+54 9 381 …`), Instagram y link de Google Maps. El seed trae valores de ejemplo (alias `SERENA.MIA.EJEMPLO`, titular "completar en el panel").
- [ ] Horarios y feriados en Ajustes → Horarios.
- [ ] Medios de pago reales (alias/CBU y titular de la transferencia) en Ajustes → Pagos.
- [ ] Punto de retiro y zonas de envío con sus costos reales en Ajustes → Entregas.
- [ ] Código y condiciones mayoristas en Ajustes → Mayorista (modo "Todos" o "Solo con código").
- [ ] Productos reales: nombre, categoría, precio minorista y mayorista (con cantidad mínima), stock y foto. Desactivar o borrar los productos de ejemplo.
- [ ] Revisar que el logo (`public/logo.png`) sea el definitivo.

### Verificación final

- [ ] Repetir el recorrido a mano en un celular real contra la URL de Railway: ver el local → agregar producto → checkout retiro + efectivo → ver el código → `/seguimiento` con el teléfono en otro formato → entrar al admin → el pedido aparece como nuevo → marcar pagado y "Listo" → el seguimiento muestra "Listo". (El mismo recorrido está automatizado en `tests/e2e/smoke.spec.ts` para desarrollo.)
- [ ] Hacer un pedido de prueba y cancelarlo desde el admin para devolver el stock.
