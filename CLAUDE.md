# CLAUDE.md — Proyecto Berlín (Café Bar Berlín)

## Instrucciones para Claude Code

Este repo es el código de **Berlín Café Bar** — un cliente nuevo de Grupo DK Soluciones,
**totalmente independiente** de Kalreco/mymulticentro.com (Alexander Restrepo). Comparte la
misma instancia de Supabase (`kalreco_db`, VPS 164.68.123.130) que Kalreco, pero corre en su
propio código, sus propios contenedores Docker y su propio subdominio.

**No confundir con "El Barril"** — ese fue el nombre que se usó por error al levantar el
proyecto (2026-08-26); el negocio real se llama **Berlín**. El repo, la carpeta, los roles y
el dominio ya están corregidos, pero puede aparecer "elbarril"/"barril" en commits viejos o en
comentarios residuales — es historia, no un negocio distinto.

---

## 🎯 QUÉ ES ESTE PROYECTO

Sistema de gestión para restaurante/bar/cafetería: POS, Mesas, Inventario (insumos + productos
terminados), Recetas, Producción, Caja, Libro Diario, Facturación, Clientes, Empleados,
Proveedores, CxC/CxP, Reportes. **Clon estructural completo de Panadería de Tulio** (el negocio
de Kalreco con el stack más parecido: POS+Mesas+Producción), adaptado a un negocio de un solo
tenant en vez del monolito multi-negocio de Kalreco.

## 🏗️ Arquitectura — por qué está separado de Kalreco

Kalreco es un monolito: un solo `kalreco_panel` + `kalreco_backend` sirven los 4 negocios de
Multicentros vía rutas (`/panaderia/tulio`, `/multicentros/suenosdehogar`, etc.), todos
compartiendo el mismo bundle y el mismo proceso Express. Berlín **no** entra en ese monolito
porque:

1. Es un cliente completamente distinto — no debe tener ninguna relación de código/acceso con
   Multicentros ni con `admin_grupo`.
2. Aislar el build evita repetir el incidente ya documentado en Kalreco (Esquina del Crédito
   hizo que el bundle superara el límite de precache de Workbox y rompiera el build de
   *todos* los negocios).
3. Deploy independiente — un `docker compose up` acá nunca debe poder tocar un contenedor de
   Kalreco (ver el incidente real más abajo — pasó una vez, ya está blindado).

La única superficie compartida es la **base de datos**: mismo Postgres (`kalreco_db`), tablas
propias con prefijo `br_*`, aisladas por Tenant ID (`negocios.id =
916a3918-6157-4b2a-9a30-36b42b1906d4`) igual que cualquier otro negocio de la plataforma.

## ⚙️ TECH STACK

Igual que Kalreco: Node.js + Express (backend) · React 18 + Vite + TypeScript + Tailwind CSS
(panel) · HTML estático + Tailwind CDN (landing, sin build) · Supabase/Postgres compartido.

## 🗂️ ESTRUCTURA DEL PROYECTO

```
berlin/
├── apps/
│   ├── backend/     Node.js + Express — API propia, puerto 4001
│   │   └── src/modules/
│   │       ├── auth/     login con candado explícito de rol
│   │       ├── berlin/   24 controllers (clon de panaderia/tulio)
│   │       └── panel/    solo GET/PATCH /me/preferencias (botón "Reordenar")
│   ├── panel/       React + Vite + Tailwind — build con base:'/login/'
│   │   └── src/pages/berlin/   24 páginas clonadas de Tulio
│   └── landing/     HTML estático + Tailwind CLI (compila styles.css en el build)
└── infra/
    └── docker-compose.yml   name: berlin (proyecto Docker aislado)
```

Las **migraciones de base de datos** (schema `br_*`, tenant central, datos reales) viven en el
repo de **Kalreco** (`database/migrations/082-092`), porque la BD es compartida — nunca crear
migraciones acá, ni aplicar SQL suelto fuera de esa carpeta. ⚠️ **Antes de crear la siguiente
migración, correr `ls database/migrations/ | tail -5` en el repo `kalreco` actualizado** — el
090 de Berlín tuvo que renombrarse desde 087 porque otro trabajo (no de Berlín) ya había
tomado ese número mientras esta sesión estaba pausada.

## 🔗 URLs y identificadores

| Concepto | Valor |
|---|---|
| Landing pública | `https://berlin.mymulticentro.com/` (`berlin_landing`) |
| Panel | `https://berlin.mymulticentro.com/login/` (`berlin_panel`) |
| API | `https://berlin.mymulticentro.com/api/*` (`berlin_backend`, puerto 4001) |
| Tenant ID (`negocios.id`) | `916a3918-6157-4b2a-9a30-36b42b1906d4` |
| Prefijo tablas BD | `br_*` |
| Rol admin | `admin_berlin` |
| Admin | `admin.berlin@kalreco.com` / `berlin2026*` (cambiar tras primer login real) |
| Repo GitHub | `https://github.com/proyectokalreco/berlin.git` |
| VPS | `164.68.123.130`, carpeta `/opt/berlin/` |

## 🎨 PALETA DE COLORES

Tomada del logo real (`Documentacion/Restaurante Bar Berlin/`, fuera de este repo):

```js
const GOLD    = '#D9A652'  // dorado principal
const GOLD_DK = '#A15F2F'  // cobre/madera
const BG_DARK = '#1A120B'  // fondo, madera oscura
```
En `tailwind.config.js` del panel: `brand.teal`/`brand.gold` = `#D9A652` (reutiliza el sistema
de tokens de Tulio, así los componentes clonados no necesitaron tocar cada clase Tailwind una
por una).

## 🔐 Acceso y roles

Solo **`admin_berlin`** + **`super_admin`** (Alveiro, soporte de plataforma) tienen acceso.
`admin_grupo` (Alexander Restrepo) **NO** debe tener acceso — decisión explícita del cliente
(Berlín es un negocio nuevo, no de Multicentros). El candado va en el **backend**
(`modules/auth/routes.js`, `ROLES_PERMITIDOS = ['super_admin', 'admin_berlin']`), no solo en el
frontend — así ningún otro rol con `negocio_id` NULL puede entrar aunque adivine la URL.

## 🚀 Deploy

```bash
cd /opt/berlin && git pull origin main
cd /opt/berlin/infra && docker compose up -d --build
```

⚠️ **NUNCA correr sin el `name: berlin` del `docker-compose.yml`** — ver incidente abajo.
Requiere `infra/.env` (no commiteado, copiar de `infra/.env.example` con los valores reales de
`kalreco/infra/.env`, mismo Supabase).

## 📦 Estado de fases (actualizado 2026-08-30)

- ✅ **Fase 0** — BD: 38 tablas `br_*`, 71 FKs, 10 funciones, aplicado en producción.
- ✅ **Fase 1** — Backend: 24 controllers clonados de Tulio, login aislado, verificado con curl.
- ✅ **Fase 2** — Panel: 24 páginas, app de un solo negocio (sin Sidebar/Layout multi-negocio de
  Kalreco, rutas propias en la raíz del router), `tsc`/`build` limpios.
- ✅ **Fase 3** — Landing: diseño provisto por el usuario (Google Stitch), adaptado con logo
  real, navegación por anclas, WhatsApp real (`3215994825`, 4 puntos), sección Contacto con
  NIT/dirección/celular + mapa embebido. **Sin link "Iniciar sesión" ni "Inicio" en el menú**
  — decisión explícita del cliente, por seguridad no exponer la entrada al panel desde la
  landing pública (2026-08-30).
- ✅ **Datos reales del negocio** (2026-08-30, migración 090 + 14 archivos de tickets): NIT
  `1035424712-4`, dirección `Calle 28 #30-19, Puente de los Leones (Terminal de Transporte) -
  Don Matías, Antioquia`, celular `3215994825`. Nombre en tickets corregido de "Panaderia de
  Berlín" (residuo del clon) a "Café Bar Berlín". Los tickets/facturas NO leen esto de la BD —
  está hardcodeado en cada plantilla (mismo patrón sin fuente única que Tulio/Esquina, ver
  `kalreco/CLAUDE.md`); la fila de `negocios` también se actualizó, mismo dato, por consistencia
  con lo que sí lee la app (respuesta de login, etc).
- ✅ **2026-08-30** — Inventario inicial cargado (migración 091: 17 categorías/234 productos/
  21 insumos) · POS con venta múltiple + carrito unificado + impresión térmica corregida en
  7 archivos + fix bug abonos/pago cliente (migración 092) — ver incidentes 8-10 abajo.
- ⏳ **Pendiente**: fotos reales del local (las actuales son de un generador de imágenes,
  placeholder de Google Stitch).

## ⚠️ Incidentes y bugs reales encontrados (para no repetirlos)

### 1. Colisión de proyecto Docker tumbó producción de Kalreco (2026-08-26)
Esta carpeta (`infra/`) y `kalreco/infra/` se llaman igual, y ambos `docker-compose.yml`
declaraban un servicio YAML llamado `backend`. Docker Compose usa el nombre de la carpeta
contenedora como nombre de proyecto por defecto → `(proyecto=infra, servicio=backend)` coincidía
con Kalreco. Un `docker compose up` acá **recreó/reemplazó `kalreco_backend`**, tumbando el
login de Tulio/Hogar/Esquina varios minutos. **Fix:** campo `name: berlin` explícito en este
`docker-compose.yml` (y `name: infra` agregado también al de Kalreco, defensivo) — el proyecto
ya no depende del nombre de carpeta, no puede volver a colisionar. **Nunca quitar ese campo.**

### 2. `git push` colgado — Git Credential Manager en entorno sandbox
En este entorno de desarrollo (Claude Code sandbox), `git push` a un repo nuevo se cuelga
indefinidamente: el sistema intenta abrir un flujo de autorización interactivo (SSO/browser)
del Git Credential Manager de Windows, invisible para el proceso. **Fix:** `credential.helper`
reseteado a nivel local de este repo (`git config --local --add credential.helper ""` seguido de
`--add credential.helper store`) con un Personal Access Token del usuario, sin depender de GCM.

### 3. Índices con nombre sin prefijo colisionaron entre schemas (BD)
`idx_planilla_items_planilla`/`producto` en el schema original de Tulio no llevaban el prefijo
`pan_` en su propio *nombre* de índice (solo la tabla sí). Al clonar con `sed pan_→br_`, esos
2 nombres no cambiaron y colisionaron con los índices reales de Tulio — Postgres los saltó
silenciosamente (`NOTICE: already exists`). Fix aplicado en la migración 083 y con SQL
correctivo directo en producción.

### 4. `.env` corrupto al parchear con `sed` encadenado
Al reemplazar placeholders del `.env` con 2 `sed -i` seguidos, el `SUPABASE_SERVICE_ROLE_KEY`
quedó con un valor 3× más largo de lo real dentro del contenedor (confirmado con `sha256sum`,
reproducible incluso reescribiendo el archivo entero). Causa real: la clave se había transcrito
mal **al leerla de una captura de pantalla** en vez de copiarla del archivo origen. **Lección:
nunca retipear una clave larga leída de una imagen — copiarla programáticamente
(`grep`/`cut`) del archivo real, sin que pase por transcripción manual.**

### 5. nginx del panel — bloque de caché regex rompía el `alias` de `/login/`
Al mover el panel de la raíz a `/login/` (Vite `base:'/login/'`), un `location ~*
\.(js|css|...)$` separado para cachear estáticos no heredaba el `alias` del bloque
`/login/` — nginx buscaba los archivos en `/usr/share/nginx/html/login/...` (no existe) → 404
en todo el bundle JS/CSS. Fix: un único bloque `location /login/ { alias ...; try_files ...; }`
maneja todo, sin bloque de caché separado (se puede reintroducir después, con cuidado de
heredar el mismo alias).

### 6. Landing dependía de Tailwind CDN en tiempo real — reportado por un cliente del usuario
El diseño de Google Stitch usa `<script src="cdn.tailwindcss.com">` para su preview — funciona
mientras el script cargue, pero si el navegador del visitante lo bloquea (extensión de
privacidad, adblocker, red corporativa; común en Incógnito) **toda la página pierde el
estilo** porque no hay CSS local de respaldo. Confirmado con captura real de un cliente del
usuario: página sin estilos, lista con bullets, sin tema oscuro. **Fix:** `tailwindcss` CLI
compila `styles.css` en el build de Docker (`apps/landing/tailwind.config.js` +
`src/input.css`); `index.html` ya no depende de ningún script de terceros para su estilo.
**Lección: nunca dejar en producción un `<script>` de CDN que genere CSS en tiempo real — sirve
para prototipar rápido (así lo entregan herramientas como Google Stitch), pero hay que
compilarlo antes de desplegar.**

### 7. `basename` + ruta propia duplicaban el prefijo — URL quedaba `/login/login`
Al mover el panel a `/login/` se le puso `basename="/login"` al `BrowserRouter`, pero además
quedó una `<Route path="/login" element={<Login/>}/>` separada de la ruta raíz (`<Route
path="/">`, con el Shell). El `basename` ya suma el prefijo `/login` a CUALQUIER ruta interna,
así que esa ruta propia terminaba resolviendo `/login` + `/login` = `/login/login`. Reportado
por un cliente del usuario (captura con la URL doble). **Fix (`App.tsx`):** se eliminó la ruta
`/login` separada — `Login` se renderiza en la ruta raíz (`RootGate`, según
`isAuthenticated`), igual que antes hacía `PrivateRoute` (eliminado, ya no se usa). Cerrar
sesión ahora deja la URL limpia en `.../login/`.
**Lección: con `basename` seteado, ningún `<Route path="...">` ni `<Navigate to="...">` debe
repetir ese mismo prefijo — el router ya lo antepone a todo automáticamente.**

### 8. `br_abonos.cuenta_id` bloqueaba todo abono/pago a cliente — "Error de base de datos"
Reportado por el cliente con captura. `br_abonos` (generada por `pg_dump` del schema real de
Tulio en la migración 083) tiene `cuenta_id UUID NOT NULL` — columna huérfana, de un diseño de
`pan_cuentas_cobrar` que nunca se implementó en ningún controller. `clientes.controller.js`
(clonado de Tulio) siempre insertó `venta_id`/`tipo` en su lugar — columnas que no existen en
la tabla real. Insert fallaba siempre. **Fix (migración 092, en el repo `kalreco`):**
`cuenta_id` pasa a nullable + se agregan `venta_id`/`tipo` — alinea la tabla al esquema que el
código ya usa. Mismo bug, mismo fix, en `pan_abonos` de Tulio (nunca antes probado ahí).

### 9. POS — venta múltiple + carrito unificado (2026-08-30, commit `83d3bbd`)
A pedido del cliente, mismo patrón que Esquina del Crédito: pestañas de "ventas en pausa"
arriba del catálogo (atender varios clientes sin perder el carrito de cada uno, key propia
`br_pos_ventas_pausa`) + la pantalla de pago dejó de ser un paso aparte — ahora un solo panel
con la lista de ítems y, siempre visible debajo, los métodos de pago/numpad/selector de
cliente y un único botón "Cobrar". El éxito de venta pasó a modal (no pantalla completa) para
no tapar las pestañas. **Mesas no se tocó** — tiene su propio carrito, copiado visualmente del
POS pero sin compartir código ni estado.

### 10. Impresión térmica ilegible — mismo patrón ya corregido 3× en Esquina (commit `83d3bbd`)
Courier New + letra <13px + gris/rojo/verde en vez de negro sólido, en 7 archivos: POS, Mesas,
Caja, Facturación, Clientes, Proveedores, Reportes (este último SÍ es térmica 80mm, no A4 —
hubo que verificarlo, no asumirlo). Fix: Arial `font-weight:600`, tamaños a 13px+, colores a
`#000`. **Fuera de alcance:** el documento A4 "Factura de Compra a Proveedor" dentro de
`ProveedoresPage.tsx` — mismo riesgo si se imprime en la térmica del negocio, pero es un
cambio de layout más grande, sin confirmar con el cliente que hoy salga mal.

**Verificado en vivo en producción (2026-08-30), navegando el panel real:** tab "Venta 1" +
"Nueva venta" renderizan bien · producto agregado al carrito y botón "P. Completo" visibles a
la vez (sin pantalla aparte, confirmado) · **abono real probado**: cliente Luisa Herrera,
factura VT-20260831-0001-27, deuda $12.000 → abono $5.000 efectivo exitoso → saldo $7.000,
queda en historial. Antes de este fix daba "Error de base de datos" siempre. **Decisión del
cliente: este abono de prueba se queda, no se revierte.** Los 401/MIME vistos en consola al
probar eran caché vieja del Service Worker (PWA) tras el deploy, no bug de código — se
resuelve solo limpiando caché/recargando si algún usuario ve pantalla en blanco tras un
deploy futuro. Impresión térmica: cambio verificado en el HTML, pendiente que el cliente
confirme en la impresora física con el próximo ticket real.

### 11. Panel de pago no se veía igual a Esquina (commit `90b5367`, mismo día)
El cliente comparó capturas: faltaba selector de cliente siempre visible, "Pago Completo"
destacado ancho completo, grid de métodos en 2 columnas (tenía 4-en-fila), y la barra
arrastrable entre lista de items y bloque de pago. Fix: reestructurado el bloque de pago con
esos 4 elementos, mismo patrón visual de Esquina (colores propios de Berlín/Tulio, no se
copiaron los colores de Esquina). Se agregó también scroll con rueda del mouse en la barra de
categorías (antes solo flechitas/trackpad) — mismo límite existe hoy en Esquina, no se tocó
ahí. Desplegado y confirmado por el usuario en producción.

### 12. Pago mixto POS (migración 093, commit con `387f926`)
`br_ventas` no tenía columnas para split de pago — se agregaron `monto_efectivo`/
`monto_transferencia`. `ventas.controller.js` valida suma=total (tolerancia $1) en `crear()`,
y `actualizarCaja()` gana rama `mixto` con 2 llamadas RPC separadas (antes hubiera contado
el 100% como efectivo, mismo patrón de bug ya visto en Esquina/Hogar). Nuevo botón "Mixto" en
POS con 2 inputs enmascarados + validación en vivo.

### 13. Cursor invisible en "Efectivo recibido" + rename "Transferencia"→"Pago Electrónico"
El campo de efectivo era un `<p>` de solo lectura — sin cursor ni foco visibles. Se convirtió
a `<input>` real (`ref` + autofocus al elegir método), compatible con el NumPad táctil y con
el listener global de teclado (que ya ignoraba `INPUT` activo). Además, "Transferencia" se
renombró a **"Pago Electrónico"** en 9 archivos del panel — solo texto visible; el valor
interno `metodo_pago==='transferencia'` (comparaciones, claves de mapas, nombre de variables)
quedó intacto a propósito, sin impacto en BD.

### 14. Dashboard/tiles y top-nav — módulos ocultos a pedido del cliente
Tiles "Mojes" y "Etiquetas" ocultos del grid de `BerlinDashboard.tsx` (2026-09-01). El cliente
señaló con captura que el tab "Producción" seguía visible en la barra superior aunque el tile
ya no estaba — se ocultó también en `BerlinShell.tsx` (`ALL_TABS` + filtro `panadero` en
`getTabsByRol`), commit `70c05ad`. En ambos casos la ruta (`/mojes`, `/etiquetas`) sigue viva,
solo se retiró del descubrimiento en UI — reversible sin tocar backend.

### 15. Paleta café no cambiaba el look real del POS — causa raíz: hex sueltos sin token
Cambiar solo `tailwind.config.js` (`brand.dark/navy/card`) no bastó — grep encontró ~70 usos
de hex arbitrario (`bg-[#0D1B2A]`, `bg-[#112240]`, `bg-[#162C50]`, `bg-[#1A2F4A]`) en 14
archivos, especialmente el panel de pago del POS, completamente desconectados del token.
Migrados todos al hex nuevo (vía `sed`) para que el próximo cambio de paleta sí se propague.
Tras mostrar un mockup en vivo (3 opciones: café actual / gris neutro / gris cálido), el
cliente eligió **gris cálido**: `brand.dark:#1C1A18, navy:#2C2925, card:#403A32` (dorado sin
cambios). Confirmado en producción con captura — mejor contraste, cursor de efectivo visible.

### 16. Mejoras POS/Caja/Dashboard a pedido del cliente (2026-09-03)

Tres pedidos, aplicados por partes:

**Parte 1 — botón "Pago Completo" del POS se veía siempre "activo" (`POS.tsx`).** El botón
destacado ancho completo tenía estado NO-seleccionado con fondo/borde/texto naranja tenue
(`bg-[#EA580C]/10`), que se leía como seleccionado aunque el método activo fuera otro. Los
otros 4 botones del grid sí quedaban neutros. Fix: estado NO-seleccionado ahora
`bg-brand-dark border-white/5 text-gray-500`, idéntico al grid; seleccionado sigue naranja
sólido. En Mesas este problema no existe (los 5 botones usan estilo uniforme).

**Parte 3 — tile "Pérdidas" (`/mermas`) oculto del Dashboard (`BerlinDashboard.tsx`).** Mismo
patrón que incidente 14 (Mojes/Etiquetas): quitado de `ALL_MODULES` y de la lista de rol
`panadero`. Ruta `/mermas` sigue viva, reversible sin tocar backend. No estaba en el top-nav.

**Parte 2 — caja compartida por negocio + Nequi/QR dentro de Pago Electrónico + cierre
parcial.** Ver `kalreco/CLAUDE.md` (migración 094, BD compartida) — pendiente/en curso al
momento de escribir esto.

## 📄 Documentación relacionada

- `README.md` (este repo) — resumen corto para quien clona el repo por primera vez.
- `kalreco/CLAUDE.md` — sección "🍺 NEGOCIO — Berlín" con el cross-reference y las migraciones
  de BD (que viven en ese repo porque la base de datos es compartida).
