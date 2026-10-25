# Serena Mia — Sitio web + panel de stock (diseño)

Fecha: 2026-10-25. Estado: borrador para aprobación.

Convención: **[Dicho]** = lo dijo el cliente (Elías) o el equipo. **[Mi decisión]** = decisión tomada por quien escribe esto; el usuario no la acordó y puede revertirla.

## 1. Intención y por qué

Serena Mia es una tienda de cosmética y estética de San Miguel de Tucumán (Isabel la Católica 641) que vende a salones de belleza (mayorista) y a clientas finales. Instagram @serenamiaest (~7.400 seguidores), "Productos de estética 🌸". Rubros visibles: Insumos, Cosmetología. Contacto: WhatsApp +54 381 611-6380. Horarios: lun–vie 10:30–20:00, sáb 10:00–14:00.

Hoy todo se resuelve por WhatsApp. Elías quiere una página donde **lo primero que se vea sea nombre/logo del local, dirección y horarios** **[Dicho]**, con una estructura "muy fácil de entender" como la de Bella Central (https://bellacentral.com.ar) **[Dicho]**. Debe ayudar a la gente a llegar al local y a saber qué productos hay **[Dicho]**.

Se busca valor real para un emprendimiento en crecimiento con ventas continuas, no un sistema empresarial **[Dicho]**.

## 2. Usuarios

- **Clientas (principal, celular)**: ven datos del local, miran catálogo, piden, siguen su pedido **[Dicho]**. No son técnicas **[Dicho]**: todo debe ser obvio, textos grandes, pocos pasos.
- **Mayoristas / salones (PC)**: vista más densa, precios por volumen **[Dicho: usarían PC]**.
- **Elías y 1–2 personas más (admin)**: gestionan stock, precios, pedidos desde el celular o PC **[Mi decisión: 1–2 usuarios]**.

## 3. Alcance

### 3.1 Sitio público (mobile-first)
1. **Cabecera/hero con datos del local**: logo, nombre, dirección, horarios, indicador "Abierto ahora / Cierra a las 20:00 / Abre mañana 10:30" calculado con la zona horaria America/Argentina/Tucuman; botones "Cómo llegar" (Google Maps) y "WhatsApp" **[Dicho el contenido; indicador y botones: mi decisión]**.
2. **Aviso mayorista** visible arriba (ej. "Precios mayoristas desde X unidades") controlado desde el admin **[Mi decisión, inspirado en Bella Central]**.
3. **Categorías** grandes y claras; **buscador**; **catálogo en grilla** con foto, nombre, precio, estado de stock.
4. **Carrito y checkout** sin cuenta: datos de contacto (nombre, teléfono), elegir entrega (retiro/envío) y medio de pago; pantalla de confirmación con número de pedido e instrucciones de pago; opción de abrir WhatsApp con el resumen del pedido **[Mi decisión]**.
5. **Seguimiento de pedido**: ingresa **número de pedido + teléfono**, sin cuenta **[Dicho]**; ve el estado actual y el detalle.
6. **Vista de PC para mayoristas**: listado denso/tabla con cantidades y precios por volumen **[Mi decisión]**.
7. Español (Argentina), precios en ARS.

### 3.2 Panel de administración
- **Productos y stock**: alta/edición con fotos, categoría, precio minorista, precio mayorista opcional con cantidad mínima, cantidad disponible; alerta de stock bajo; marcar sin stock **[Dicho: "manejador de stock"]**. Edición masiva de precios por categoría (porcentaje) **[Mi decisión]**.
- **Visibilidad de precios mayoristas**: configurable por Elías desde el admin (público para todos, o solo para clientes aprobados) **[Dicho: lo determina él en el dashboard]**. Mecanismo de "cliente aprobado": ver §6.
- **Pedidos**: lista con estados `recibido → preparando → listo → entregado` (+ `cancelado`) y estado de pago `pendiente / pagado`; cada cambio se refleja en el seguimiento público. El stock se descuenta al confirmarse el pedido; se repone al cancelar **[Mi decisión]**.
- **Medios de pago configurables**: inicial Transferencia y Efectivo; para transferencia se cargan alias/CBU/titular; activar/desactivar **[Dicho: transferencia o efectivo, configurables]**. Pagos automáticos (Mercado Pago) fuera de esta versión.
- **Entregas configurables**: "Retiro en el local" con dirección(es) editables y "Envío" con zonas y costo fijo por zona **[Dicho: retiro y envíos, configurables con dirección]**.
- **Datos del local**: nombre, logo, dirección, horarios, WhatsApp, redes, aviso mayorista.
- Acceso protegido con usuario y clave (1–2 usuarios) **[Mi decisión]**. Usable en celular.

## 4. No-objetivos
Facturación electrónica, contabilidad, múltiples sucursales, roles/permisos complejos, reportes empresariales, pagos online automáticos, cuentas de clientas, integración con correos/couriers, app nativa.

## 5. Anti-objetivos (fracaso aunque "funcione")
- Que una clienta poco técnica se pierda o necesite explicación.
- Que los datos del local/horarios no sean lo primero visible.
- Que el panel sea tan complejo que Elías vuelva a WhatsApp y planillas.
- Que el stock se desincronice (vender lo que no hay).
- Que el seguimiento exponga pedidos de otras personas (ver §7).

## 6. Restricciones y decisiones técnicas **[Todas Mi decisión salvo Railway]**
- Despliegue en **Railway** **[Dicho]**. Nota: al escribir este documento el CLI `railway` no está instalado en la máquina y el login está sin verificar (lo revisa el usuario).
- Sitio propio (no Tiendanube): Next.js (React) + base de datos PostgreSQL en Railway; imágenes en almacenamiento de objetos/volumen de Railway. El stack exacto lo cierra el builder.
- Diseño: estética rosa/floral acorde al Instagram; tipografía grande y legible; contraste AA; targets táctiles ≥44px; rendimiento en celulares de gama media y datos móviles (imágenes optimizadas, carga rápida).
- Los activos de marca (logo, fotos, catálogo inicial) aún no se tienen: se usa un placeholder de marca y el admin permite cargarlos; el catálogo inicial lo carga Elías o se importa desde planilla (a decidir por el builder).
- "Cliente aprobado" para precios mayoristas: el builder define el mecanismo más simple (ej. código/clave de acceso mayorista que Elías entrega, o lista de teléfonos aprobados). Debe ser simple para Elías y para el salón.

## 7. Seguridad y datos
- Seguimiento: coincidencia exacta de número de pedido (no secuencial adivinable, ej. alfanumérico corto) **y** teléfono; límite de intentos; respuesta idéntica si no coincide.
- Datos personales mínimos (nombre, teléfono, dirección solo si hay envío).
- Admin: sesión segura, claves hasheadas, HTTPS.
- Registro de cambios de stock y precios (quién/cuándo), simple.

## 8. Qué queda para el builder
Elección final de librerías, esquema de datos, estructura de rutas, mecanismo de "cliente aprobado", método de importación del catálogo inicial, estrategia de imágenes, testing, y CI/deploy en Railway (incluyendo staging si conviene).

## 8b. Decisiones menores tomadas tras la revisión **[Mi decisión, revertibles]**
- **Stock**: se descuenta (reserva) al **enviar** el pedido, dentro de una transacción para que dos clientas no compren la última unidad. Un pedido con pago pendiente se libera solo y pasa a `cancelado` tras un plazo configurable en el admin (por defecto 48 h); Elías puede extenderlo o cancelarlo antes. Cancelar repone stock.
- **Precios mayoristas**: modo "público" = el precio por volumen se aplica según cantidad por producto, visible para todos. Modo "aprobados" = el precio mayorista se ve y aplica solo tras ingresar un **código mayorista** que Elías define y puede cambiar en el admin (revoca cambiando el código). El mínimo es por producto. Quien accede ve también el precio minorista.
- **Envíos**: la clienta elige la zona de una lista que define Elías (cada zona con costo fijo) y escribe su dirección en texto libre; el costo se suma al total y se paga con el mismo medio elegido. No hay zonas = no se ofrece envío.
- **Horarios**: se editan como horario estructurado por día (con varios tramos) más una lista de **excepciones** (feriados/cierres puntuales con fecha) que el indicador "Abierto ahora" respeta.
- **Número de pedido**: código alfanumérico corto no secuencial (ej. SM-7K2Q9).

## 8c. Respuestas del usuario tras la revisión
- **Sin variantes**; cantidades **por unidad** **[Dicho]**. El precio mayorista sigue siendo por cantidad mínima de unidades.
- **Railway**: cuenta del usuario (Matías) **[Dicho]**. Dominio propio: no definido; se arranca con el dominio de Railway y se puede conectar uno después **[Mi decisión]**.
- **Aviso de pedidos por WhatsApp** **[Dicho]**. Implementación **[Mi decisión]**: en la v1, al enviar el pedido, el sitio abre WhatsApp de la clienta con el resumen dirigido a +54 381 611-6380, de modo que el pedido le llega a Elías por WhatsApp sin depender de ninguna API. Limitación: depende de que la clienta toque "enviar"; por eso el pedido igualmente queda en el panel con una marca de "nuevo" y contador. Aviso automático real (WhatsApp Business Cloud API de Meta) queda como mejora posterior porque requiere alta y plantillas aprobadas en Meta.

## 8d. Identidad visual
Logo: esmalte de uñas rosa con ornamento floral violeta/magenta y cinta rosa con "Serena Mía" en tipografía caligráfica y debajo "Estética & Insumos" en negro, sobre fondo blanco. Archivo de referencia: `assets/logo-instagram-screenshot.png` (captura de Instagram; **incluye un corazón rojo superpuesto de la interfaz que no es parte del logo** y bordes de captura). Se necesita un recorte limpio; si el cliente no tiene el original, el builder recorta el círculo y retira el corazón, o se pide el original a Elías **[Mi decisión]**.
Paleta propuesta **[Mi decisión]**: rosa magenta principal (~#D9559F), rosa profundo de la cinta (~#C2398C), violeta del ornamento (~#7A4FA0), fondo blanco/rosa muy claro, texto casi negro. Tipografía: caligráfica solo en el nombre/títulos decorativos; sans-serif legible para todo lo demás. Verificar contraste AA (el rosa claro no sirve para texto sobre blanco).

## 9. Criterios de éxito
- Un visitante en celular ve nombre, dirección y horarios sin hacer scroll ni clic.
- Una clienta hace un pedido y consulta su estado sin cuenta ni ayuda.
- Elías carga un producto, ajusta stock/precio y cambia el estado de un pedido desde el celular en menos de un minuto cada tarea.
- El sitio está online en Railway.
