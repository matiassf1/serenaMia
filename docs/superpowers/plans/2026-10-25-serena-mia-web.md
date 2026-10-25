# Serena Mia Web + Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sitio mobile-first para Serena Mia (catálogo, carrito, checkout sin cuenta, seguimiento por número de pedido + teléfono) con panel admin de stock, precios, pedidos, pagos, entregas y datos del local, desplegado en Railway.

**Architecture:** Una sola app Next.js (App Router) con rutas públicas, rutas `/admin` protegidas y route handlers `/api`. Toda la lógica de negocio (precios, stock, expiración, horarios) vive en `src/lib` como funciones puras o servicios sobre Prisma, testeables sin UI. El servidor recalcula siempre precios y envío; el cliente solo manda IDs y cantidades.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma + PostgreSQL, Tailwind CSS, zod, Vitest (unit/servicio, contra Postgres de test), Playwright (2–3 smoke e2e), sesión admin por cookie firmada (`SESSION_SECRET`), dinero como enteros en centavos, `Intl.NumberFormat('es-AR')`. Decisiones de stack: **[Mi decisión]**, la spec las dejó al builder.

**Spec:** `docs/superpowers/specs/2026-10-25-serena-mia-web-design.md`

## Global Constraints

- Idioma es-AR; moneda ARS; dinero en centavos enteros; formato con `Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS'})`.
- Zona horaria del local: `America/Argentina/Tucuman`; el "Abierto ahora" se calcula en el servidor con esa zona, nunca con el reloj/zona del visitante.
- Datos del local (seed): nombre "Serena Mia", "Estética & Insumos", Isabel la Católica 641, San Miguel de Tucumán, WhatsApp +54 9 381 611-6380 (`wa.me/543816116380`), horarios lun–vie 10:30–20:00, sáb 10:00–14:00, domingo cerrado.
- Primer elemento visible en móvil sin scroll ni clic: logo, nombre, dirección, horarios, indicador abierto/cerrado, botones "Cómo llegar" y "WhatsApp".
- Sin cuentas de clientas. Seguimiento = número de pedido + teléfono. Sin variantes de producto; cantidades por unidad.
- Número de pedido: `SM-` + 6 caracteres del alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin 0, O, 1, I, L).
- Paleta: magenta ~#D9559F, rosa profundo ~#C2398C, violeta ~#7A4FA0, fondo blanco/rosa muy claro, texto casi negro; contraste AA (rosa claro nunca como texto sobre blanco); targets táctiles ≥44px; tipografía caligráfica solo en nombre/títulos decorativos.
- Server-side integrity: el checkout ignora cualquier precio, total o costo de envío del cliente; solo acepta `productId`, `quantity`, `shippingZoneId`/`pickupPointId`, `paymentMethodId`, datos de contacto.
- Stock: se reserva al enviar el pedido (transacción con `UPDATE ... WHERE stock >= qty`); pedidos con pago pendiente se cancelan a las `pendingExpiryHours` (default 48) y reponen stock una sola vez.
- Seguridad: claves hasheadas (bcrypt/argon2), cookies `httpOnly`+`secure`+`sameSite=lax`, límite de intentos en seguimiento y login, respuesta idéntica ante pedido/teléfono incorrectos.
- Fuera de alcance: facturación, contabilidad, sucursales, roles complejos, pagos online, cuentas de clientas, couriers, app nativa, variantes.
- Commits en español o inglés convencional (`feat:`, `test:`, `chore:`), terminando con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Cada línea tiene su test fijado en la tarea indicada.

1. **"Abierto ahora" en bordes** (10:29/10:30, 19:59/20:00, sáb 14:00, domingo, fecha de excepción, visitante en otra zona horaria): Task 3.
2. **Última unidad con dos checkouts concurrentes** (stock=1 → exactamente uno gana, el otro recibe `OutOfStockError`): Task 4.
3. **Teléfono en seguimiento** (`381 611-6380`, `3816116380`, `+54 9 381 611 6380`, `0381 611-6380` deben coincidir; pedido incorrecto y teléfono incorrecto dan la misma respuesta): Tasks 3 y 7.
4. **Expiración a las 48 h idempotente** (correr dos veces no repone stock dos veces; pedido ya pagado o en preparación no se cancela): Task 4.
5. **Mensaje `wa.me`** (tildes, `ñ`, saltos de línea, `&` en nombres de producto sobreviven a `encodeURIComponent`; el número de pedido aparece): Task 6.
6. **Payload manipulado en checkout** (precio, total o envío enviados por el cliente se ignoran; cantidad 0, negativa o decimal se rechaza; producto inexistente o inactivo se rechaza): Task 4.

## Mapa de dependencias y paralelismo

```
T1 → T2 (deploy skeleton)
T1 → T3 (libs puras) → T4 (servicios de pedido) ─┬→ T6 checkout UI ─→ T7 seguimiento
T1 → T5 (shell público + catálogo) ──────────────┘
T1,T3 → T8 (auth admin) → T9 productos/stock → T10 pedidos
                       └→ T11 ajustes del local (pagos, entregas, horarios, mayorista)
T4,T11 → T12 mayorista (código + vista PC)
T4 → T13 cron expiración
T6,T7,T10,T11,T12,T13 → T14 e2e + deploy final
```
Tras T1/T3/T4, las pistas **pública** (T5→T6→T7→T12) y **admin** (T8→T9→T10→T11) son independientes y pueden correr en paralelo; ambas solo se tocan en `prisma/schema.prisma` (cerrado en T1) y en `src/lib`.

## Estructura de archivos

- `prisma/schema.prisma`, `prisma/seed.ts` — modelo y datos de ejemplo.
- `src/lib/db.ts` — cliente Prisma singleton.
- `src/lib/money.ts`, `phone.ts`, `orderCode.ts`, `hours.ts`, `pricing.ts`, `whatsapp.ts` — funciones puras.
- `src/lib/orders.ts` — `placeOrder`, `cancelOrder`, `setOrderStatus`, `setPaymentStatus`, `expireStaleOrders`, `findOrderForTracking`.
- `src/lib/auth.ts`, `rateLimit.ts`, `wholesale.ts`, `uploads.ts`.
- `src/app/(public)/…` — home/catálogo, producto, carrito, checkout, confirmación, `/seguimiento`.
- `src/app/admin/…` — login, productos, pedidos, ajustes.
- `src/app/api/…` — `orders`, `tracking`, `wholesale/unlock`, `cron/expire`, `uploads/[...path]`, `admin/*`.
- `tests/unit`, `tests/service`, `tests/e2e`.

---

### Task 1: Scaffold, esquema y seed

**Files:**
- Create: proyecto Next.js en la raíz (`package.json`, `tsconfig.json`, Tailwind, `vitest.config.ts`, `playwright.config.ts`, `.env.example`), `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`, `tests/service/seed.test.ts`

**Interfaces:**
- Produces (modelos Prisma; nombres exactos): `StoreSettings` (singleton `id=1`: `name, tagline, address, whatsapp, instagram, mapsUrl, logoPath, wholesaleBanner, wholesaleMode: PUBLIC|CODE, wholesaleCode, pendingExpiryHours Int @default(48)`), `BusinessHours` (`weekday 0–6, opensAt "HH:mm", closesAt "HH:mm"`; varios tramos por día permitidos), `HoursException` (`date, closed Boolean, opensAt?, closesAt?, note`), `Category` (`id, name, slug, sortOrder`), `Product` (`id, name, slug, description, categoryId, retailPrice Int, wholesalePrice Int?, wholesaleMinQty Int?, stock Int, lowStockThreshold Int @default(3), active Boolean, imagePath?`), `PaymentMethod` (`id, name, instructions, active, sortOrder`), `PickupPoint` (`id, name, address, active`), `ShippingZone` (`id, name, cost Int, active`), `Order` (`id, code @unique, customerName, phone` normalizado, `rawPhone, status: RECEIVED|PREPARING|READY|DELIVERED|CANCELLED, paymentStatus: PENDING|PAID, deliveryType: PICKUP|SHIPPING, pickupPointId?, shippingZoneId?, shippingAddress?, shippingCost Int, paymentMethodId, subtotal Int, total Int, isNew Boolean @default(true), createdAt, expiresAt?`), `OrderItem` (`orderId, productId, productName, unitPrice Int, quantity Int, wholesale Boolean`), `AdminUser` (`email @unique, passwordHash`), `StockLog` (`productId, delta, reason, createdAt`), `AuditLog` (`adminEmail, action, entity, entityId, before Json?, after Json?, createdAt`; registro simple de quién/cuándo cambió precios y stock, según la spec §7).
- Produces: `db` exportado desde `src/lib/db.ts`; scripts npm `test`, `test:e2e`, `db:migrate`, `db:seed`.

- [ ] **Step 1: Write the failing test** `tests/service/seed.test.ts`: tras `db:seed`, `StoreSettings.address === 'Isabel la Católica 641, San Miguel de Tucumán'`, existen 6 `BusinessHours` (lun–vie y sáb con los horarios de Global Constraints), 2 categorías (`Insumos`, `Cosmetología`), ≥6 productos activos con stock >0 y al menos uno con `wholesalePrice`, ≥2 `PaymentMethod` (Transferencia, Efectivo), 1 `PickupPoint` con la dirección del local, 1 `ShippingZone`.
- [ ] **Step 2: Run test to verify it fails** — `npm test -- seed` → FAIL (sin esquema).
- [ ] **Step 3: Scaffold Next.js (TS, App Router, Tailwind), instalar Prisma/zod/Vitest/Playwright; escribir `schema.prisma` con los modelos de Interfaces, migración inicial y `seed.ts` idempotente** (upsert). Los productos de ejemplo son claramente ficticios ("Producto de ejemplo"). Tests de servicio usan `DATABASE_URL_TEST` y limpian tablas entre tests.
- [ ] **Step 4: Run test to verify it passes** — `npm run db:migrate && npm run db:seed && npm test -- seed` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: scaffold app, schema and seed"`.

### Task 2: Despliegue esqueleto en Railway

**Files:**
- Create: `railway.json` (o `nixpacks`/Dockerfile según elija el builder), `src/app/api/health/route.ts`, `docs/deploy.md`
- Modify: `package.json` (script `start` ejecuta `prisma migrate deploy` antes de `next start`)

**Interfaces:**
- Produces: `GET /api/health` → `200 {"ok":true,"db":true}`; variables de entorno documentadas en `.env.example`: `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `UPLOAD_DIR` (default `/data/uploads`).

- [ ] **Step 1: Pre-flight (humano + agente):** `git remote -v`. Si no hay remoto, el usuario crea el repo en GitHub y lo conecta a un proyecto Railway propio desde el dashboard (deploy desde GitHub; no requiere el CLI). Verificar `railway whoami` solo si el usuario lo instala; no es requisito. Anotar el resultado en `docs/deploy.md`.
- [ ] **Step 2: Write the failing test:** `tests/service/health.test.ts` llama al handler y espera `{ok:true, db:true}`.
- [ ] **Step 3: Implement `GET /api/health` (consulta `SELECT 1`) y config de build/start** con migraciones al arrancar.
- [ ] **Step 4: Run test** → PASS; luego en Railway: servicio web + Postgres + Volume montado en `/data/uploads` (un volumen se adjunta a un solo servicio); `curl <url>/api/health` → `{"ok":true,"db":true}`.
- [ ] **Step 5: Commit** — `git commit -m "chore: railway skeleton deploy with health check"`.

### Task 3: Librerías puras (dinero, teléfono, código, horarios, WhatsApp)

**Files:**
- Create: `src/lib/money.ts`, `phone.ts`, `orderCode.ts`, `hours.ts`, `whatsapp.ts`
- Test: `tests/unit/money.test.ts`, `phone.test.ts`, `orderCode.test.ts`, `hours.test.ts`, `whatsapp.test.ts`

**Interfaces:**
- Produces:
  - `formatARS(centavos: number): string`; `parseARSToCentavos(input: string): number | null` (acepta `1.234,50` y `1234.5`).
  - `normalizePhone(raw: string): string | null` → últimos 10 dígitos tras quitar no-dígitos; `null` si hay menos de 10.
  - `ORDER_CODE_ALPHABET: string`; `generateOrderCode(rand?: () => number): string`.
  - `type OpenStatus = { open: boolean; label: string }`; `getOpenStatus(now: Date, schedule: BusinessHoursRow[], exceptions: HoursExceptionRow[], tz?: string): OpenStatus` con labels `"Abierto ahora · cierra a las 20:00"`, `"Cerrado · abre hoy a las 10:30"`, `"Cerrado · abre mañana a las 10:30"`, `"Cerrado · abre el lunes a las 10:30"`.
  - `buildOrderWhatsAppUrl(shopPhone: string, o: { code: string; customerName: string; items: {name: string; quantity: number; unitPrice: number}[]; total: number; deliveryLabel: string; paymentLabel: string }): string`.

- [ ] **Step 1: Write the failing tests** (nombre y aserciones):
  - `normalizePhone` devuelve `'3816116380'` para `'381 611-6380'`, `'3816116380'`, `'+54 9 381 611 6380'`, `'0381 611-6380'`; `null` para `'12345'`.
  - `generateOrderCode` cumple `/^SM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/` en 5000 muestras y nunca contiene `0 O 1 I L` tras el prefijo.
  - `getOpenStatus` con TZ `America/Argentina/Tucuman` (UTC−3 fijo): lun 10:29 → cerrado; lun 10:30 → abierto; lun 19:59 → abierto; lun 20:00 → cerrado; sáb 13:59 → abierto; sáb 14:00 → cerrado; domingo 12:00 → cerrado y label "abre mañana"/"el lunes" correcto; fecha con excepción `closed` en día hábil → cerrado con nota; **mismo instante evaluado con `process.env.TZ` distinto da el mismo resultado**.
  - `formatARS(123450)` contiene `1.234,50`; `parseARSToCentavos('1.234,50') === 123450`.
  - `buildOrderWhatsAppUrl`: la URL empieza con `https://wa.me/543816116380?text=`; al decodificar el texto aparecen el código `SM-…`, tildes, `ñ`, saltos de línea y un `&` de un producto llamado `"Crema & Aceite Niño"` intactos.
- [ ] **Step 2: Run tests** — `npm test -- tests/unit` → FAIL.
- [ ] **Step 3: Implement** cada función; para horarios, derivar día/hora local con `Intl.DateTimeFormat` y `timeZone` explícita (sin depender de `Date#getHours`).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: pure libs for money, phone, order code, hours, whatsapp"`.

### Task 4: Servicios de precio, stock y pedidos

**Files:**
- Create: `src/lib/pricing.ts`, `src/lib/orders.ts`, `src/lib/rateLimit.ts`
- Test: `tests/unit/pricing.test.ts`, `tests/service/orders.test.ts`

**Interfaces:**
- Consumes: `generateOrderCode`, `normalizePhone` (Task 3); modelos de Task 1.
- Produces:
  - `unitPriceFor(p: {retailPrice:number; wholesalePrice:number|null; wholesaleMinQty:number|null}, qty: number, wholesaleUnlocked: boolean, mode: 'PUBLIC'|'CODE'): { unitPrice: number; wholesale: boolean }` — mayorista si `wholesalePrice != null && qty >= wholesaleMinQty && (mode==='PUBLIC' || wholesaleUnlocked)`.
  - `type PlaceOrderInput = { items: {productId: string; quantity: number}[]; customerName: string; phone: string; deliveryType: 'PICKUP'|'SHIPPING'; pickupPointId?: string; shippingZoneId?: string; shippingAddress?: string; paymentMethodId: string; wholesaleUnlocked: boolean }`.
  - `placeOrder(input: PlaceOrderInput): Promise<{ id: string; code: string; total: number }>`; lanza `OutOfStockError(productId)`, `InvalidOrderError(reason)`.
  - `cancelOrder(orderId: string): Promise<void>` (repone stock una vez, escribe `StockLog`), `setOrderStatus(orderId, status)`, `setPaymentStatus(orderId, status)`, `markOrderSeen(orderId)`.
  - `expireStaleOrders(now: Date): Promise<number>` → cancela pedidos `paymentStatus=PENDING` y `status=RECEIVED` con `expiresAt <= now`; devuelve cuántos.
  - `findOrderForTracking(code: string, phone: string): Promise<OrderView | null>` (normaliza teléfono; `null` si no coincide cualquiera de los dos).
  - `checkRateLimit(key: string, max: number, windowMs: number): boolean`.

- [ ] **Step 1: Write the failing tests:**
  - `unitPriceFor`: sin mayorista → retail; qty por debajo del mínimo → retail; modo `CODE` sin desbloqueo → retail; modo `CODE` desbloqueado y `PUBLIC` con qty≥mínimo → mayorista.
  - `placeOrder` ignora campos extra de precio: pasar `{... , unitPrice: 1, total: 1, shippingCost: 0}` produce `total` calculado desde la DB (payload manipulado); rechaza `quantity` 0, −1, 1.5, producto inexistente o inactivo, envío sin `shippingZoneId`/dirección, retiro sin `pickupPointId`.
  - Descuenta stock y crea `StockLog`; `expiresAt = now + pendingExpiryHours`; guarda `phone` normalizado y `rawPhone`.
  - **Concurrencia:** con stock=1, dos `placeOrder` simultáneos (`Promise.allSettled`) → exactamente uno resuelve y el otro rechaza con `OutOfStockError`; stock final 0 (no negativo).
  - `cancelOrder` repone stock; llamado dos veces no repone dos veces.
  - `expireStaleOrders`: cancela vencidos y repone stock; segunda corrida devuelve 0 y stock sin cambios; no toca pedidos `PAID` ni `PREPARING`.
  - `findOrderForTracking` coincide con las 4 variantes de teléfono; devuelve `null` idéntico para código inexistente y teléfono incorrecto.
- [ ] **Step 2: Run tests** → FAIL.
- [ ] **Step 3: Implement.** `placeOrder` en una `$transaction`: validar con zod, cargar productos, por línea `updateMany({where:{id, active:true, stock:{gte:qty}}, data:{stock:{decrement:qty}}})` y chequear `count===1`; recalcular precios con `unitPriceFor`, envío desde `ShippingZone.cost`; reintentar el código si colisiona (`@unique`). `cancelOrder` condiciona por `status != CANCELLED` dentro de la transacción para la idempotencia. `checkRateLimit` en memoria (suficiente para una instancia; documentarlo).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: pricing, stock reservation, order lifecycle services"`.

### Task 5: Shell público y catálogo

**Files:**
- Create: `src/app/(public)/layout.tsx`, `src/app/(public)/page.tsx`, `src/app/(public)/categoria/[slug]/page.tsx`, `src/components/StoreHeader.tsx`, `ProductCard.tsx`, `CategoryNav.tsx`, `SearchBox.tsx`, `src/app/globals.css` (tokens de marca), `public/logo.png`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `getOpenStatus` (T3), `StoreSettings`, `Category`, `Product` (T1).
- Produces: `<StoreHeader/>` (server component) con logo, nombre, dirección, horarios, indicador abierto/cerrado, botón "Cómo llegar" (`mapsUrl` o Google Maps con la dirección) y "WhatsApp"; `<ProductCard product/>` con foto, nombre, precio, estado `En stock / Últimas unidades / Sin stock`, botón "Agregar" (≥44px, deshabilitado sin stock); búsqueda por `?q=`.

- [ ] **Step 1: Write the failing e2e** `home.spec.ts` a viewport 390×844: sin scrollear, son visibles `Serena Mia`, `Isabel la Católica 641`, `10:30`, un texto que empieza con `Abierto` o `Cerrado`, y los botones `Cómo llegar` y `WhatsApp`; el catálogo muestra los productos seed; `/?q=` con un término filtra; un producto sin stock muestra "Sin stock" y su botón está deshabilitado.
- [ ] **Step 2: Run** `npx playwright test home` → FAIL.
- [ ] **Step 3: Implement** layout y componentes con la paleta de Global Constraints; logo: recorte limpio de `docs/superpowers/specs/assets/logo-instagram-screenshot.png` (círculo, sin el corazón rojo) guardado como `public/logo.png`; si el recorte no queda limpio, usar placeholder y dejar nota para pedir el original a Elías. Fuente caligráfica solo para el nombre. Imágenes con `next/image` y `sizes`.
- [ ] **Step 4: Run** → PASS; revisar contraste AA con una herramienta (axe o Lighthouse) y corregir.
- [ ] **Step 5: Commit** — `git commit -m "feat: public shell, header and catalogue"`.

### Task 6: Carrito y checkout

**Files:**
- Create: `src/lib/cart.ts` (cliente), `src/components/CartProvider.tsx`, `CartDrawer.tsx`, `src/app/(public)/checkout/page.tsx`, `src/app/(public)/pedido/[code]/page.tsx`, `src/app/api/orders/route.ts`
- Test: `tests/e2e/checkout.spec.ts`, `tests/service/orders-api.test.ts`

**Interfaces:**
- Consumes: `placeOrder`, `PlaceOrderInput`, `OutOfStockError`, `InvalidOrderError` (T4); `buildOrderWhatsAppUrl` (T3); `ProductCard` (T5).
- Produces: `POST /api/orders` (body = `PlaceOrderInput` sin `wholesaleUnlocked`; el servidor lo deduce de la cookie) → `201 {code, total, whatsappUrl}` | `409 {error:'out_of_stock', productId}` | `400`; carrito persistido en `localStorage` con `{productId, quantity}` únicamente; `/pedido/[code]` muestra número de pedido, total, instrucciones del medio de pago (alias/CBU para transferencia) y botón grande "Enviar pedido por WhatsApp".

- [ ] **Step 1: Write the failing tests:**
  - `orders-api.test.ts`: POST con precios/total inyectados devuelve total calculado por el servidor; POST con `quantity: 0` → 400; producto sin stock → 409 con `productId`.
  - `checkout.spec.ts` (móvil): agregar 2 productos → abrir carrito → checkout → completar nombre y teléfono, elegir "Retiro en el local" y "Transferencia" → confirmar → ver `SM-` + código, instrucciones de transferencia y el enlace `wa.me/543816116380`; flujo de envío exige zona y dirección; error de stock muestra mensaje claro en español sin perder el carrito.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** el flujo en pocos pasos (una sola pantalla de checkout con secciones), textos simples, teclado numérico para teléfono (`inputMode="tel"`); al éxito vaciar carrito. El enlace `wa.me` lo arma el servidor con `buildOrderWhatsAppUrl`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: cart, checkout and order confirmation"`.

### Task 7: Seguimiento de pedido

**Files:**
- Create: `src/app/(public)/seguimiento/page.tsx`, `src/app/api/tracking/route.ts`
- Test: `tests/service/tracking-api.test.ts`, `tests/e2e/tracking.spec.ts`

**Interfaces:**
- Consumes: `findOrderForTracking`, `checkRateLimit` (T4).
- Produces: `POST /api/tracking {code, phone}` → `200 OrderView` | `404 {error:'not_found'}` (mismo cuerpo para código o teléfono incorrecto) | `429`; `OrderView = {code, status, paymentStatus, deliveryType, items, subtotal, shippingCost, total, createdAt}` sin datos sensibles de otros pedidos.

- [ ] **Step 1: Write the failing tests:** las 4 variantes de teléfono devuelven 200; código correcto + teléfono incorrecto y código inexistente devuelven el mismo 404 y mismo body; 6.º intento en la ventana → 429; e2e: el formulario acepta el código en minúsculas y con espacios (se normaliza a mayúsculas/trim) y muestra una línea de tiempo `Recibido → Preparando → Listo → Entregado` resaltando el estado actual.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** página con 2 campos y un botón grande; clave de rate limit = IP + código.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: order tracking by code and phone"`.

### Task 8: Autenticación del admin

**Files:**
- Create: `src/lib/auth.ts`, `src/middleware.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/layout.tsx`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`, `scripts/create-admin.ts`
- Test: `tests/service/auth.test.ts`, `tests/e2e/admin-login.spec.ts`

**Interfaces:**
- Produces: `hashPassword(p: string): Promise<string>`, `verifyPassword(p: string, hash: string): Promise<boolean>`, `createSession(userId: string): string` (token firmado con `SESSION_SECRET`), `getAdminFromRequest(req): Promise<AdminUser | null>`, `requireAdmin()` para route handlers y server components; `npm run admin:create -- <email> <password>`.

- [ ] **Step 1: Write the failing tests:** contraseña correcta → cookie `httpOnly`; incorrecta → 401 y límite tras 5 intentos; sin sesión `/admin/*` y `/api/admin/*` (excepto login) redirigen/401; token manipulado se rechaza; la contraseña nunca se guarda en claro.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** con bcrypt/argon2 y middleware que protege `/admin` y `/api/admin`. Layout admin responsive con navegación inferior en móvil: Pedidos, Productos, Ajustes.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: admin authentication"`.

### Task 9: Admin de productos, stock y precios

**Files:**
- Create: `src/app/admin/productos/page.tsx`, `[id]/page.tsx`, `nuevo/page.tsx`, `src/app/api/admin/products/route.ts`, `src/app/api/admin/products/bulk-price/route.ts`, `src/app/api/uploads/[...path]/route.ts`, `src/lib/uploads.ts`
- Test: `tests/service/products-admin.test.ts`, `tests/e2e/admin-products.spec.ts`

**Interfaces:**
- Consumes: `requireAdmin` (T8), `parseARSToCentavos` (T3), `StockLog` (T1).
- Produces: `saveProduct(input): Promise<Product>`, `adjustStock(productId, delta, reason)` (escribe `StockLog`, nunca deja stock <0), `bulkAdjustPrices(categoryId: string | null, percent: number): Promise<number>` (redondea a entero de centavos; también mayorista), `saveUpload(file: File): Promise<string>` (valida tipo JPG/PNG/WebP y ≤5 MB, guarda bajo `UPLOAD_DIR`, devuelve ruta servida por `/api/uploads/...` con nombre no adivinable).

- [ ] **Step 1: Write the failing tests:** crear producto con precio `"1.500,00"` guarda 150000; mayorista sin mínimo → error de validación; `adjustStock` con delta que dejaría stock negativo → error; `bulkAdjustPrices(cat, 10)` sube 10 % solo esa categoría; cada cambio de precio o stock en el admin escribe un `AuditLog` con el email del admin y valores antes/después; subida de `.exe` o >5 MB rechazada; e2e (móvil): crear producto con foto, bajar su stock a 0 y verlo "Sin stock" en el sitio público, y ver la alerta de stock bajo en el listado.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** listado con buscador y filtro de stock bajo, formulario simple, botones rápidos `+1/−1` y "Sin stock", acción de ajuste porcentual con vista previa del cambio antes de aplicar.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: admin product, stock and price management"`.

### Task 10: Admin de pedidos

**Files:**
- Create: `src/app/admin/pedidos/page.tsx`, `[id]/page.tsx`, `src/app/api/admin/orders/[id]/route.ts`
- Test: `tests/service/orders-admin.test.ts`, `tests/e2e/admin-orders.spec.ts`

**Interfaces:**
- Consumes: `setOrderStatus`, `setPaymentStatus`, `cancelOrder`, `markOrderSeen`, `expireStaleOrders` (T4), `requireAdmin` (T8).
- Produces: listado filtrable por estado con contador de pedidos nuevos (`isNew`), detalle con acciones "Marcar pagado", avanzar estado, cancelar, "Extender plazo de pago" (`extendExpiry(orderId, hours)`), y botón "Escribir por WhatsApp" a la clienta (`wa.me/54<phone>` con mensaje del estado).

- [ ] **Step 1: Write the failing tests:** abrir el detalle limpia `isNew`; cancelar repone stock; `extendExpiry` mueve `expiresAt` y evita la expiración; el listado llama a `expireStaleOrders` perezosamente; e2e: pedido creado en el sitio aparece como nuevo, Elías lo pasa a "Listo" y la clienta lo ve en `/seguimiento`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: admin order management"`.

### Task 11: Ajustes del local, pagos, entregas y horarios

**Files:**
- Create: `src/app/admin/ajustes/page.tsx` (con secciones: Local, Horarios, Pagos, Entregas, Mayorista), `src/app/api/admin/settings/route.ts`, `src/app/api/admin/payment-methods/route.ts`, `pickup-points/route.ts`, `shipping-zones/route.ts`, `hours/route.ts`
- Test: `tests/service/settings.test.ts`, `tests/e2e/admin-settings.spec.ts`

**Interfaces:**
- Consumes: `requireAdmin` (T8), modelos de T1.
- Produces: CRUD con activar/desactivar para medios de pago (nombre + instrucciones), puntos de retiro (nombre + dirección), zonas de envío (nombre + costo); editor de horarios por día con varios tramos y lista de excepciones por fecha; edición de datos del local y del aviso mayorista; ajuste de `wholesaleMode` (`PUBLIC|CODE`), `wholesaleCode` y `pendingExpiryHours`.

- [ ] **Step 1: Write the failing tests:** un medio de pago desactivado no aparece en el checkout ni lo acepta `placeOrder`; sin zonas activas el checkout no ofrece envío; cambiar horario o agregar una excepción cambia el `Abierto ahora` del sitio (usa `getOpenStatus` con la nueva data); validación de `HH:mm` y de `closesAt > opensAt`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** formularios claros para usuario no técnico, un guardado por sección con confirmación visible.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: admin store settings, payments, delivery and hours"`.

### Task 12: Modo mayorista (código y vista de PC)

**Files:**
- Create: `src/lib/wholesale.ts`, `src/app/api/wholesale/unlock/route.ts`, `src/components/WholesaleBanner.tsx`, `src/components/WholesaleTable.tsx`, `src/app/(public)/mayoristas/page.tsx`
- Test: `tests/unit/wholesale.test.ts`, `tests/service/wholesale-api.test.ts`, `tests/e2e/wholesale.spec.ts`

**Interfaces:**
- Consumes: `unitPriceFor` (T4), `StoreSettings.wholesaleMode/wholesaleCode` (T1/T11).
- Produces: `signWholesaleToken(code: string): string` y `isWholesaleUnlocked(cookieValue: string | undefined, currentCode: string): boolean` (cambiar el código en el admin invalida cookies previas); `POST /api/wholesale/unlock {code}` pone cookie `httpOnly` si coincide, rate-limited; `/mayoristas`: tabla densa en PC (producto, stock, retail, mayorista, mínimo, campo cantidad) y lista simple en móvil.

- [ ] **Step 1: Write the failing tests:** código correcto desbloquea y devuelve precios mayoristas; código erróneo → 401 sin cookie; cambiar `wholesaleCode` hace que la cookie vieja deje de valer; en modo `PUBLIC` la tabla muestra mayorista sin código y el carrito aplica el precio al alcanzar el mínimo; e2e a 1280 px: tabla visible y se agrega al carrito por cantidad.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Pasar `wholesaleUnlocked` a `placeOrder` desde la cookie en `POST /api/orders` (T6).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: wholesale mode with access code and desktop table"`.

### Task 13: Expiración programada

**Files:**
- Create: `src/app/api/cron/expire/route.ts`
- Modify: `docs/deploy.md`
- Test: `tests/service/cron-expire.test.ts`

**Interfaces:**
- Consumes: `expireStaleOrders` (T4).
- Produces: `POST /api/cron/expire` con header `Authorization: Bearer ${CRON_SECRET}` → `{expired: number}`; sin o con secreto incorrecto → 401.

- [ ] **Step 1: Write the failing test:** sin header → 401; con header correcto y un pedido vencido → `{expired:1}`; segunda llamada → `{expired:0}` y stock sin cambios.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** el handler y documentar en `docs/deploy.md` el cron de Railway (diario, `curl -X POST -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/expire`). La expiración también corre perezosamente en listado de pedidos y seguimiento (ya cubierto en T7/T10).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: scheduled order expiry endpoint"`.

### Task 14: E2E de humo, accesibilidad y despliegue final

**Files:**
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `docs/deploy.md`, `README.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Write the failing test** `smoke.spec.ts` (viewport móvil): home muestra datos del local → agregar producto → checkout retiro + efectivo → ver código → `/seguimiento` con código + teléfono en formato distinto al ingresado muestra "Recibido" → login admin → pedido aparece como nuevo → marcar pagado y "Listo" → seguimiento muestra "Listo".
- [ ] **Step 2: Run** → FAIL hasta que todas las tareas estén integradas.
- [ ] **Step 3: Ajustar integración, correr auditoría de accesibilidad (axe) y rendimiento móvil (Lighthouse ≥90 en performance y ≥95 accesibilidad en home), sembrar datos reales con Elías (reemplazar productos de ejemplo), configurar variables y cron en Railway y desplegar.**
- [ ] **Step 4: Run** suite completa (`npm test && npm run test:e2e`) → PASS; `curl <url>/api/health` → ok; repetir el smoke manual en un celular real contra la URL de Railway.
- [ ] **Step 5: Commit** — `git commit -m "chore: smoke e2e, a11y pass and production deploy docs"`.
