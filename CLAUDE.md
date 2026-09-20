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
parcial** (migración 094, BD compartida — detalle en `kalreco/CLAUDE.md`):
- **Caja compartida:** `caja.controller.js` deja de filtrar el turno por `usuario_apertura_id`
  — 1 turno abierto por negocio por día (índice único `br_turnos_caja(fecha) WHERE
  estado='abierto'`, antes `(fecha, usuario_apertura_id)`). Si un usuario abre caja y otro
  entra, el segundo ve la misma caja y puede vender. `cerrarCaja` suma el día completo (sin
  filtrar `vendedor_id`), gana regla de permiso (admin siempre; cajero solo si él la abrió;
  vendedor nunca) y `desglose_vendedores`. Mismo criterio que Esquina (079).
- **Nequi/QR en Pago Electrónico:** `metodo_pago='qr'` se suma dentro de `transferencia` en
  `cerrarCaja`/`ventasTurno`/`resumenDia`; columna "QR / Nequi" quitada de Caja (paneles +
  ticket) y el botón quitado del modal de cobro de Mesas. `total_ventas_qr` queda en 0.
- **Un solo panel de ventas:** con caja compartida "Ventas del turno" y "Ventas del día —
  todos los cajeros" eran lo mismo → se dejó uno solo, y la KPI redundante "Ventas del turno"
  se quitó de la fila superior.
- **Cierre parcial:** botón + modal en `CajaPage.tsx` — resumen del turno en vivo + efectivo
  contado opcional + impresión de tiquete 80mm "TURNO EN CURSO · NO ES CIERRE DEFINITIVO",
  sin cerrar la caja. Clon del de Esquina, tema oscuro Berlín.
- `tsc`/`node -c` limpios. **Desplegado y confirmado por el usuario en producción
  (2026-09-03):** migración 094 aplicada (`DROP INDEX` / `CREATE INDEX` OK), backend+panel
  reconstruidos, "todo funciona bien". Commits `berlin` `ca85f95` (partes 1+3) + `07bc430`
  (parte 2), `kalreco` `1a74cf4` (migración 094).

### 17. Búsqueda tolerante en todo el panel (2026-09-09) — solo frontend

Reporte del cliente: en Inventario (y otros módulos) el buscador obligaba a escribir el
nombre exacto. **Causa real diagnosticada — NO eran mayúsculas** (el código ya hacía
`toLowerCase()` de ambos lados, y el backend usa `.ilike` que también es case-insensitive):
1. **Acentos.** Los nombres del negocio traen tildes (`AROMÁTICA`, `CAFÉ`, `LIMÓN`, `PIÑA`).
   `"aromática".includes("aromatica")` → `false`. Por eso "debo poner el nombre exacto".
2. **Orden de palabras.** `.includes()` de substring contiguo → `"queso palito"` no encuentra
   `"PALITO DE QUESO"`.
3. Un solo campo (solo `nombre`).

**Solución — helper compartido `apps/panel/src/lib/buscar.ts`:**
```ts
normalizar(s)  // minúsculas + sin tildes (NFD + quita U+0300-036F) + espacios colapsados
coincide(termino, ...campos)  // todos los tokens del término en ALGÚN campo, cualquier orden
```
`coincide('')` devuelve `true` (sin filtro).

**Aplicado a los filtros del navegador** (`toLowerCase().includes()` → `coincide()`), ampliando
campos: Inventario productos (nombre + código + **categoría**), Inventario insumos (nombre +
**proveedor** + unidad), POS y Mesas catálogo (nombre + código + categoría), Recetas,
Facturación, Proveedores (4 tabs).

**Los `q` del backend pasaron a filtrarse en el navegador** (decisión del cliente: opción 3A —
sin tocar la BD ni el backend). Se carga la lista completa una vez (`limit` alto) y se filtra
con `coincide`: ClientesPage (lista + pickers encargo/separe), POS cliente, Mesas cliente y
catálogo, Etiquetas, Mermas, Proveedores `buscar-items` (hook `useBuscarItems` — productos +
insumos cargados una vez). El parámetro `q` sigue existiendo en el backend, solo dejó de
usarse desde el panel.

**`ProductosTerminados.tsx` eliminado** — archivo muerto, no estaba ruteado en `App.tsx`
(la ruta `/inventario` usa `MateriasPrimas.tsx`).

`tsc --noEmit` + `npm run build` limpios. **Sin tocar backend.** Alcance: solo Berlín (Tulio/
Esquina/Hogar tienen el mismo patrón, quedan para otra sesión). Commit `f990ee8`.
**✅ Desplegado (rebuild de `panel`) y confirmado por el usuario en producción (2026-09-09):**
buscar "jug" en Inventario encuentra "JUGO EN AGUA" / "JUGO EN LECHE".

### 18. Badge de receta mostraba "Horneada" para recetas Frito/Bebida (2026-09-11) — solo frontend

Reporte del cliente: recetas creadas como "Frito" o "Bebida Fría" (jugos, limonadas) aparecían
en la lista con el badge "Horneada". El dato guardado en BD **era correcto** — el modal de
edición leía y resaltaba bien el tipo real; el bug era solo de visualización en la lista.

**Causa** (`RecetasPage.tsx`, componente `RecetaCard`): el badge y el bloque de detalle
comparaban `tipo_receta` contra solo 2 valores (`'congelada'`, `'frito'`) con un `if/else` de
2 ramas — cualquier otro valor (`'bebida_caliente'`, `'bebida_fria'`, o un combo `"a+b"`) caía
al `else` y mostraba "Horneada" sin importar el tipo real. Quedó desactualizado cuando se
agregaron Bebida Caliente/Bebida Fría al selector (el modal de creación sí los contemplaba,
la lista nunca se actualizó a la par).

**Fix:**
- Badge: nuevo lookup `TIPO_BADGE` (los 5 tipos, icono+color+label) — recorre
  `tipo_receta.split('+')` y muestra un badge por proceso (soporta combos reales, ej.
  `"horneada+frito"`), en vez de un `if/else` de 2 casos con default incorrecto.
- Detalle (acordeón): temperatura/tiempo de horno y tiempo de congelado pasaron de
  mutuamente excluyentes (`if/else`) a condiciones independientes por `.includes()` sobre el
  split — un combo horno+congelado ahora muestra ambos; frito/bebidas no muestran nada extra
  (no tienen campos propios en el schema, correcto).
- `types/index.ts`: `Receta.tipo_receta` ensanchado de `'horneada'|'congelada'|'frito'` a
  `string` — el tipo mentía, ya admitía `bebida_caliente`/`bebida_fria`/combos desde antes.

Sin cambios de backend ni de BD — el dato siempre estuvo bien, era puramente de presentación.
`tsc --noEmit` + `npm run build` limpios.

### 19. POS — modal Sabor + Base para Jugos/Limonadas (2026-09-11)

Pedido del cliente: cada combo sabor+base (JUGO FRESA AGUA, JUGO FRESA LECHE, JUGO LULO
AGUA...) es un producto/receta aparte — la categoría "JUGOS EN LECHE" sola ya tiene 7 cards,
más las de "JUGOS EN AGUA", lentifica encontrar un jugo en el POS. Tocar el chip de esas
categorías (o "LIMONADAS") ahora abre un modal en vez de la grilla suelta.

**Detección de categorías por nombre, no por ID fijo** (`POS.tsx`, reutiliza
`normalizar()`/`coincide()` de `lib/buscar.ts`, mismo helper del incidente 17): jugos =
categoría cuyo nombre normalizado empieza con `jugos` y contiene `agua`/`leche`; limonadas =
empieza con `limonada`. Sin config en BD — agregar otra familia (sodas, malteadas) es una
línea más en el propio archivo, sin migración.

**`saboresJugos`** cruza los productos de las 2 categorías de jugo, agrupando por el nombre
del producto sin la palabra final Agua/Leche (el sabor sale del nombre real, no de una lista
hardcodeada) → `{sabor, agua?, leche?}`. **`saboresLimonada`** son los productos de la
categoría limonadas tal cual (decisión del cliente: solo sabor, sin paso de base — hoy no
existen limonadas en leche).

**Modal** (mismo patrón visual que "Venta Libre", ya existente en el mismo archivo): paso 1
elegir sabor (grid de botones), paso 2 (solo jugos) elegir Agua/Leche — deshabilitada la base
que no exista para ese sabor —, cantidad, botón Agregar resuelve el producto real y lo mete al
carrito con `agregarConCantidad` (mismo patrón de merge que `addItem`, pero con la cantidad
exacta en vez de +1).

Sin backend, sin BD. Alcance: solo POS — Mesas no se tocó (decisión del cliente). `tsc
--noEmit` + `npm run build` limpios.

**Desplegado 2026-09-11 — el cliente reportó 2 problemas al probar:**

1. **"Limonadas" no abría el modal aunque "Jugos" sí.** Causa probable: la detección usaba
   `normalizar(nombre).startsWith('jugos'|'limonada')` — si el nombre real de esa categoría
   tiene algo antes (típico: el cliente tecleó un emoji dentro del campo *nombre* en vez de en
   el campo *emoji* aparte de `ModalGestionCategorias`), `startsWith` no matchea.
   **Fix:** `startsWith` → `includes` en las 3 detecciones (jugos agua, jugos leche,
   limonadas) — mismo criterio, más tolerante.
2. **La barra de categorías no se puede reordenar** — "JUGOS EN AGUA"/"JUGOS EN LECHE" (creadas
   el 11-sep, después de las 17 categorías originales) quedan al final de la barra, hay que
   scrollear con la flechita para llegar. `br_categorias.orden` ya existía en la BD y el
   backend ya ordenaba por ahí (`categorias.controller.js` línea 63) — **nada en el panel
   dejaba editarlo** (toda categoría nueva nace con `orden: 0`).
   **Fix:** arrastrar-y-soltar en Inventario → Categorías (`ModalGestionCategorias`,
   `MateriasPrimas.tsx`), mismo patrón `@dnd-kit` que ya usa `BerlinDashboard.tsx` para
   reordenar los tiles (`SortableCategoriaRow`, drag solo desde el ícono de agarre — Editar/
   Eliminar/Expandir siguen funcionando con clic normal). Al soltar, `PUT
   /berlin/categorias/:id` con `orden` secuencial (endpoint ya lo soportaba, solo faltaba
   quien lo llamara). Afecta el orden en POS, Mesas e Inventario por igual — todos leen el
   mismo endpoint. ⚠️ El cliente todavía tiene que hacer **una pasada manual** arrastrando
   Jugos/Limonada al principio — antes de eso, con todas las categorías en `orden=0`, el orden
   entre ellas sigue siendo el que Postgres devuelva (probablemente creación), sin cambios.

Sin migración, sin cambios de backend (el campo y el endpoint ya soportaban esto). `tsc
--noEmit` + `npm run build` limpios.

**⚠️ Falsa alarma tras el segundo deploy — Service Worker (PWA), no bug de código.** El
cliente reportó que ni "Limonadas" abría el modal ni aparecía el botón "Reordenar", **con el
código ya desplegado y caché del navegador "limpiada"**. Se verificó con captura la categoría
"LIMONADAS" en Inventario: bien nombrada (sin emoji ni prefijo), 6 productos bien asignados —
descartaba de plano mi hipótesis de nombre raro. La pista real: el botón "Reordenar" tampoco
aparecía, y ese código no depende para nada de nombres de categoría — si un cambio sin
relación tampoco se veía, el navegador simplemente no estaba corriendo el bundle nuevo.

Mismo patrón ya documentado en este proyecto ("los 401/MIME eran caché vieja del Service
Worker tras el deploy, no bug de código", incidente sesión 2026-08-30): esta app es una PWA
con Service Worker — **"limpiar caché del navegador" (Ctrl+Shift+Supr) no limpia el caché del
Service Worker**, son almacenamientos distintos. Confirmado pidiendo al cliente probar en
ventana de incógnito (bypasea el SW por completo) — ahí sí funcionó todo (modal de Limonadas
abre con los 6 sabores, botón Reordenar visible) — y al reintentar en la ventana normal
también empezó a andar (el SW se actualizó solo). **Ninguna de las dos features tenía bug —
las dos ya funcionaban desde el commit `8c41d54`.**

**Lección para la próxima vez que "ya desplegué pero sigue igual":** antes de asumir bug de
código, probar en una ventana de incógnito. Si ahí funciona, es el Service Worker — solución
del lado del navegador (F12 → Application → Service Workers → Unregister → Storage → Clear
site data → recargar), no hace falta tocar el repo.

### 20. POS — modal Sabor para Aromáticas (2026-09-11) + hallazgo pendiente de clasificación

**Reporte del cliente:** varias recetas de aromáticas (canela, frutos rojos, hierbabuena...)
están linkeadas a un producto vía receta, pero ese producto sigue apareciendo en Inventario
como "Compra y venta" en vez de "De receta" — importante porque `tipo_producto`/`origen`
determina si el POS deja vender con stock en 0.

**Investigado, no se tocó nada de esto todavía (falta confirmar con el cliente):**
- Descartado que el formulario de editar producto ignore el valor real: `MateriasPrimas.tsx`
  inicializa el toggle leyendo `producto.tipo_producto` de la BD tal cual — si muestra
  "Compra y venta" es porque la fila real en BD dice eso.
- Descartado que el importador de Excel lo pise: el UPSERT-por-nombre (`MateriasPrimas.tsx`,
  import de productos) no envía `tipo_producto` ni `origen` al actualizar un existente.
- `sincronizarTipoProducto()` en `recetas.controller.js` sí marca el producto como `receta`
  siempre que la receta se guarde con `producto_id` — y esto funciona hoy para otras recetas
  (`ADICION QUESO` muestra bien el badge "Receta"). Hipótesis más probable: al crear cada
  receta de aromática se usó "+ Crear nuevo" en el selector de producto en vez de buscar y
  elegir la aromática que ya existía del Excel original → quedó un **producto duplicado**
  (uno viejo `compra_venta` que es el que se ve/vende, otro nuevo `receta` al que apunta la
  receta pero que nadie usa) — mismo patrón ya visto con "REPISA" duplicado en Esquina del
  Crédito. Reforzado por un hallazgo real: **"AROMATICA FRUTOS ROJOS" vive en la categoría
  "Bebidas Calientes"**, no en "Aromáticas" como sus 9 hermanas — típico de un producto creado
  al vuelo desde el formulario de receta. No se confirmó aún con una búsqueda directa si hay
  fila duplicada — pendiente, es corrección de datos, no de código.
- **El bloqueo por stock=0 es solo visual, del lado del frontend** (`ProductCard` en
  `POS.tsx` deshabilita el click si `stock_actual<=0` salvo `origen==='receta'`) —
  `ventas.controller.js` nunca valida stock al crear una venta. Por eso la clasificación mal
  hecha **no bloquea** el modal nuevo (ver abajo), que no tiene ese chequeo.

**Modal Sabor para Aromáticas** — mismo patrón que Jugos/Limonadas, pero **por nombre de
producto, no por categoría** (decisión explícita del cliente, justo para que
"AROMATICA FRUTOS ROJOS" entre al modal aunque esté mal categorizada):
`saboresAromaticas` = productos cuyo nombre normalizado empieza con `aromatica`. Se
generalizaron los 3 puntos que antes distinguían solo `'jugo'|'limonada'` a un tercer grupo
`'aromatica'` (mismo flujo "solo sabor" que ya tenía Limonada — sin paso Agua/Leche), vía una
lista `soloSaborList` que apunta a `saboresLimonada` o `saboresAromaticas` según el grupo.

Sin backend, sin BD. `tsc --noEmit` + `npm run build` limpios.

**✅ Resuelto (2026-09-11) — no era bug, ni duplicado.** El cliente probó "AROMATICA FRUTOS
ROJOS": una sola fila activa en Inventario (descarta duplicado), categoría ya corregida a
"AROMATICAS". Se le pidió abrir esa receta en Recetas y volver a guardarla **sin cambiar
nada** — como `sincronizarTipoProducto()` se dispara sin condición en cada guardado de
receta, si el `producto_id` coincide con esa fila, el simple re-guardado la sincroniza. Así
fue: 9 de las 10 aromáticas pasaron a badge "Receta" con solo reabrir y guardar cada receta,
sin tocar código ni BD directamente. Causa real de por qué no se habían sincronizado nunca:
sin determinar (probablemente creadas/editadas antes de una versión donde este flujo no se
disparaba igual, o simplemente nunca se volvió a guardar la receta después de vincular el
producto) — no se investigó más porque el cliente ya lo resolvió con el re-guardado y no vale
la pena seguir cavando en algo que ya no reproduce. Quedaba 1 excepción: "AROMATICAS PANELITA" sigue en "Compra y venta"/Agotado — consultado
con el cliente, **caso cerrado, se deja así** (no se toca).

### 21. Mesas — nombre de mesa poco visible (2026-09-14) — solo frontend

Reporte del cliente con captura: en la tarjeta de mesa, el **nombre** (`MESA LENCERIA`, `MESA
CONO`, etc.) se veía en `text-[10px] text-gray-500` — gris apagado, casi ilegible — mientras el
**número** (`1`, `2`...) era el texto grande (`text-2xl font-black text-white`). El cliente
pidió que el nombre sea lo que más resalte.

**Fix** (`MesaCard`, `MesasPage.tsx`): cuando la mesa tiene nombre, el nombre pasa a ser el
texto principal (`text-lg font-black text-white`) y el número baja a referencia chica debajo
(`Mesa N`, `text-[11px] text-gray-500`). Mesas sin nombre (solo número, ej. mesas 3, 4, 5...)
quedan igual que antes — no hay nombre que resaltar.

Sin backend, sin BD, sin tocar `ModalGestionCategorias` ni el modal de gestión de mesas (ese ya
usa `text-sm`, no reportado como problema). `tsc --noEmit` + `npm run build` limpios.

**✅ Desplegado y confirmado por el usuario en producción (2026-09-14, commit `154025a`)** con
captura: nombres de mesa (MESA 1, MESA 2, MESA BAÑO...) ahora en blanco grande, número como
referencia chica debajo.

### 22. Roles, login con username, y caja/POS bloqueados por el horario del negocio (2026-09-14, commit `6dc8e95`)

Cuatro pedidos del cliente en un solo mensaje, con captura de un intento de login fallido
(`cajero.berlin@kalreco.com` → "No tienes acceso a este negocio").

1. **Cajero bloqueado en login.** `ROLES_PERMITIDOS` del login (`auth/routes.js`) solo tenía
   `['super_admin', 'admin_berlin']` — decisión explícita del incidente 16 ("por ahora no se
   crean usuarios cajero/vendedor"). El cliente ya quería crear cajeros → se agrega `'cajero'`
   a la lista.
2. **Login con username** (migración 098, repo `kalreco`): `usuarios.username TEXT UNIQUE
   NULL` — columna en la tabla central, compartida con los 4 negocios de Multicentros
   (nullable, no afecta a nadie que no la use). El login (`identificador`) prueba `email` si
   trae `@`, si no prueba `username` — convive con el correo, no lo reemplaza.
3. **Solo 2 cargos en el selector de Empleados** (Cajero/Administrador) — el resto de `CARGOS`
   se conserva para mostrar bien el badge de empleados ya creados con otro cargo, solo se
   ocultan del `<select>`. Además, un empleado creado **sin** acceso al sistema ahora puede
   recibir acceso después desde "Editar empleado" (antes esa opción solo existía al crear —
   confirmado por el cliente con captura: el toggle "Acceso al sistema" no dejaba hacer nada
   en modo edición).
4. **Bug real de horario, no solo un ajuste — el negocio opera de 1pm a 5am del día
   siguiente.** El sistema decidía "hay turno abierto" comparando la columna `fecha` del
   turno contra la fecha calendario de **hoy** (`fechaColombia()`). Pasada la medianoche esa
   fecha cambia, y aunque la caja de la 1pm siguiera abierta:
   - El cajero (no el admin, que tiene bypass) quedaba bloqueado del POS/Mesas entre 12am y
     5am ("POS Bloqueado").
   - Si alguien cerraba la caja a esa hora, solo sumaba las ventas de medianoche en
     adelante — **perdía todas las ventas de la tarde/noche anterior** (`cerrarCaja` sumaba
     por `rangoDiaColombia(hoy)`, un rango calendario, no el turno real).
   - El KPI "Ventas del turno" en vivo también quedaba en $0 tras medianoche.

   **Fix** (`caja.controller.js`, solo Caja/POS — sin tocar Reportes/Libro Diario/Planilla,
   que siguen por fecha calendario normal): "turno activo" pasa a ser simplemente el único
   turno con `estado='abierto'` (ya garantizado por `abrirCaja` que solo hay uno a la vez),
   sin filtrar por `fecha`. Las ventas que se suman al cerrar/al KPI en vivo se calculan
   desde `apertura_at` del turno hasta el momento actual, no por rango de día calendario. El
   aviso de "turno olvidado de un día anterior" (`turno-pendiente`) pasa de disparar por
   `fecha ≠ hoy` a disparar por antigüedad (>20h abierto), para seguir avisando si de verdad
   se les quedó una caja sin cerrar sin molestar durante el turno normal de madrugada.

Sin migración de este repo aparte de la 098 (`kalreco`). `tsc --noEmit` + `npm run build`
(panel) y `node -c` (backend) limpios. **✅ Desplegado y confirmado por el usuario en
producción (2026-09-14, commit `6dc8e95`)** — requirió que el usuario corriera primero
`git pull` en `/opt/kalreco` (el archivo de la migración 098 no estaba ahí todavía) antes de
aplicar la migración y reconstruir Berlín.

### 23. Formato de miles, username editable, Mi Perfil, fix crear proveedor desde factura (2026-09-14, commit `6eaa980`)

Cuatro pedidos más del cliente el mismo día, tras confirmar el incidente 22 en producción.

1. **Formato de miles en toda la plata del sistema.** Helper nuevo `apps/panel/src/lib/
   dinero.ts` (`fmtDinero`/`soloDigitos`) — mismo patrón que ya existía suelto en
   `CajaPage.tsx` (`fmtInput`/`stripDigits`) y en `MateriasPrimas.tsx`/`FormCrear*Rapido.tsx`
   (`parseInt(...).toLocaleString('es-CO')`), centralizado para no repetirlo. Aplicado a los
   **13 campos de dinero** que seguían en `type="number"` sin formato: `ProveedoresPage.tsx`
   (costo insumo, precio producto, precio_unitario/precio_venta de ítems de factura,
   precio_unitario de pedido, monto de compra — 6 campos en un solo archivo), `MateriasPrimas.tsx`
   (costo_unitario x2, formulario principal + edición rápida), `EmpleadosPage.tsx` (salario),
   `GastosPage.tsx` (monto), `POS.tsx`/`MesasPage.tsx` (precio de Venta Libre),
   `PlanillaPage.tsx` (precioVenta). **No se tocó** cantidad/stock/porcentaje/tiempo/número de
   mesa/capacidad — se revisó campo por campo antes de tocar nada, eso no es plata.
2. **Username editable en un empleado ya creado** — el `select` del backend
   (`empleados.controller.js`, listar/crear/actualizar) no traía la columna `username`
   (agregada el mismo día en el incidente 22); el modal de edición solo mostraba el correo
   de solo lectura. Ahora trae el campo y `actualizar()` lo guarda si viene explícito en el
   body (`usuario_username !== undefined`), sin pisar el username existente en cada guardado
   normal del formulario.
3. **"Mi Perfil" — feature nueva, no existía nada.** El avatar/nombre del header
   (`BerlinShell.tsx`) era puramente decorativo, sin `onClick`. Ahora abre
   `components/PerfilModal.tsx` — nombre, apellido, correo, username y cambio de contraseña
   (con contraseña actual obligatoria para cambiarla). Backend `PUT /api/auth/perfil` ya
   existía (nombre/apellido/email/password) desde antes de este repo — se le agregó soporte
   de `username` con validación de unicidad; `GET /api/auth/me` y el login también devuelven
   `username` ahora para que quede disponible en el store desde el arranque.
4. **Bug real — "no me deja crear un proveedor" era un problema de capas visuales, no de
   lógica.** El cliente aclaró que el fallo específico era el link "+ Crear proveedor nuevo"
   **desde adentro** del modal "Registrar factura proveedor" (no el botón normal de la
   pestaña Proveedores, que sí funcionaba). Investigado frontend (mutación/validación),
   ruta, backend (`crear()`) y schema de `br_proveedores` — los 3 niveles estaban correctos.
   La causa real: ambos modales usan `fixed inset-0 z-50`, y el modal de factura se define
   **después** en el JSX (pinta encima en el DOM) — al abrir "Nuevo proveedor" desde dentro
   de la factura, el modal nuevo quedaba **pintado detrás** de la factura, invisible. El
   clic sí funcionaba (el estado cambiaba), solo que no se veía nada distinto en pantalla.
   Fix: `z-[60]` en el modal "Nuevo proveedor" — gana la pelea de capas sin importar el
   orden del JSX.

Sin migración. `tsc --noEmit` + `npm run build` limpios. **✅ Desplegado y confirmado por el
usuario en producción (2026-09-14, commit `6eaa980`).**

### 24. Módulo Comandas — Mesas enruta a Cocina/Barra por categoría (2026-09-15, 4 fases)

Restaurante con **2 puntos de despacho**: Cocina (comidas/preparaciones, gestionada por
`cajero1.berlin`) y Bebidas y Barra (jugos/licores/gaseosas/pasteles/vitrina, gestionada por
`cajero.berlin`). Pedido: al enviar un pedido de mesa, cada cajero debe ver en su propia
pantalla solo los productos de su área, sin importar de qué mesa vienen, con impresión
automática de la comanda (sin precios) para control.

**Investigado antes de diseñar** (WebSearch, sistemas KDS reales — Toast/Square): categoría→
estación con herencia, comanda (sin precio) vs cuenta (con precio) como 2 vistas del mismo
pedido, ítems con **estado individual** (no "rondas" como entidades separadas) para que un
pedido en curso distinga lo nuevo de lo ya despachado, cierre de caja (dinero) desacoplado del
reporte operativo por estación.

**Decisiones confirmadas con el cliente antes de tocar código** (`AskUserQuestion`): el rango
de mesas mencionado inicialmente (1-8/9-14) NO es una regla real, solo categoría→estación
enruta; cada "Enviar pedido" manda solo lo nuevo, no reemplaza todo; la comanda se imprime
automático al enviar (cada estación tiene su propio dispositivo dedicado con la sesión del
cajero abierta todo el turno, confirmado); el desglose del cierre es solo ventas de mesa, no
todo el POS.

**Fase 1 — esquema (commit `db9f8db`, migración 099):**
`br_estaciones` (id, nombre, color, orden, activa) sembrada con "Cocina" y "Bebidas y Barra" —
escalable a una 3ª estación agregando una fila, sin tocar código. `estacion_id` (FK nullable)
en `br_categorias` y en `br_empleados` (solo aplica a cargo Cajero). Backend
`estaciones.controller.js` (CRUD simple) + `/berlin/estaciones`. Selector de estación en
`ModalGestionCategorias` (`MateriasPrimas.tsx`) y en `EmpleadosPage.tsx`.

**Fase 2 — comandas por estación (commit `9ef1501`, migración 100):**
`br_orden_mesa_items.enviado_at`/`visto_at`. `enviarPedido` deja de bloquear reenvíos (antes
rechazaba si la notificación anterior seguía sin leer) — cada click manda solo los ítems con
`enviado_at IS NULL`, los marca, y notifica. Nuevo `components/ComandasPanel.tsx` — ícono chef
hat en el header (junto a lo que era la campana), modal **no bloqueante**, poll cada 4s (misma
infraestructura que ya existía), agrupa por mesa filtrando por la estación del usuario
(`br_empleados.estacion_id` vía `usuario_id`; admin ve las 2 estaciones juntas). Imprime sola
la comanda (sin precios, 80mm) apenas detecta ítems nuevos — guarda ids ya impresos en un
`ref` para no repetir en cada poll. Botón "Preparado" por mesa marca `visto_at` de los ítems
de esa estación (`PATCH /comandas/mesas/:ordenId/visto`).

**Fase 3 — Mixto en Mesas (commit `34a1637`):** el carrito de Mesas no tenía el método Mixto
que ya tenía POS. Agregado con el mismo patrón visual (Pago Completo destacado + grid 2
columnas + inputs "Dividir pago") y misma validación (suma = total, tolerancia $1).
`mesas.controller.js#cobrar` valida y guarda `monto_efectivo`/`monto_transferencia` en
`br_ventas` (columnas ya existían, migración 093); el RPC de turno reparte entre los 2
bolsillos en vez de contar todo como efectivo (mismo bug ya corregido antes en
`ventas.controller.js`, no se había replicado acá).

**Fase 4 — desglose por estación en el cierre (commit `7018151`, migración 101):**
`br_ventas.origen` ('pos'|'mesa', default 'pos'; ventas históricas con `notas LIKE 'Mesa %'`
etiquetadas retroactivo). Helper `obtenerDesgloseEstaciones(desde, hasta)` en
`caja.controller.js` — suma `br_venta_items` de ventas `origen='mesa'` agrupadas por la
estación de la categoría del producto (nombre, cantidad, valor). Conectado en `cerrarCaja` y
`cerrarTurnoHistorico` (mismo rango que ya usan para el arqueo — el dinero no cambia en nada).
Endpoint `GET /caja/desglose-estaciones` para el cierre parcial (turno en curso). Sección
"DESPACHO POR ÁREA — MESAS" nueva en el tiquete impreso de los 3 tipos de cierre.

Requiere migraciones 099-101 (repo `kalreco`) aplicadas antes del deploy de cada fase.
`tsc --noEmit`/`npm run build` (panel) y `node -c` (backend) limpios en las 4.
**✅ Desplegado y confirmado por el usuario en producción, las 4 fases (2026-09-15).**

### 25. 3 bugs reales encontrados al probar Comandas en producción (2026-09-15)

**Bug 1 — Mesas no agrupaba productos repetidos (commit `675ed9d`).** Captura del cliente: 6
filas separadas de "AGUA PEQUEÑA" (una por cada tap) en vez de 1 línea con cantidad 4 — el
carrito de POS sí agrupa. Causa: `agregarItem` (`mesas.controller.js`) siempre insertaba una
fila nueva, sin lógica de merge. Fix: si el producto (mismo `precio_unitario`/`notas`) ya está
en la orden **y aún no se envió a las estaciones** (`enviado_at IS NULL`), se suma a esa línea
en vez de crear otra; un ítem ya enviado nunca se toca — evita que una unidad nueva quede
invisible para la cocina sin re-enviarse (regla de la Fase 2 intacta).

**Bug 2 — campana de notificaciones sin utilidad, eliminada (mismo commit).** El cliente
reportó que al desplegar la campana "no hacía nada, solo informar, generaba confusión" —
confirmado en código: cada notificación era texto plano sin `onClick` ni acción por ítem,
solo un botón genérico "Marcar leído". El panel de Comandas (Fase 2) ya cubre ese caso con
acción real (ver ítems por mesa, imprimir, marcar preparado), así que la campana quedó
redundante y confusa. Se eliminó `NotifBell` completo de `BerlinShell.tsx` (función + render
+ import `Bell` sin uso).

**Bug 3 — Mesas decía "No hay caja abierta" con Caja mostrando "Turno abierto" (commit
`796bb83`).** Mismo bug del incidente 22 (horario 1pm-5am) pero en un lugar que el fix
original no tocó: `tomarMesa()` (`mesas.controller.js`) tenía su **propio** chequeo de caja
duplicado, con la lógica vieja (`fecha=hoy()` + `usuario_apertura_id IN negocioUsers`) —
nunca se corrigió cuando se arregló `turnoActivo`/`turnoNegocioActivo` en `caja.controller.js`.
El turno de Luisa, abierto la tarde anterior, seguía abierto — `caja.controller.js` lo
encontraba bien (sin filtro de fecha), pero `tomarMesa` con la lógica vieja no. Fix: mismo
criterio en los dos lugares — el turno activo es el único con `estado='abierto'`, sin filtrar
fecha ni usuario. La regla "solo cierra quien abrió + admin" (incidente 22) seguía bien, no
se tocó.

Sin migración en los 3. `node -c` limpio (bugs 1 y 3, solo backend); `tsc`+`build` limpios
(bug 2, solo frontend). **✅ Desplegados y confirmados por el usuario en producción.**

### 26. Mesas — modal Sabor+Base Jugos/Limonadas/Aromáticas, igual que POS (2026-09-16, commit `6ff8dbe`)

**Extensión de alcance pedida por el cliente** (no era bug): incidentes 19/20 habían dejado el
modal Sabor+Base solo en POS por decisión del cliente ("Mesas no se tocó"). El cliente revirtió
esa decisión: "debe funcionar igual que en el Módulo POS." Se portó verbatim la lógica de
`POS.tsx` a `MesasPage.tsx` — detección de categoría (`idsJugosAgua`/`idsJugosLeche`/
`idsLimonadas` vía `normalizar(cat.nombre).includes(...)`, Aromáticas por **nombre de producto**
`startsWith('aromatica')`), estado `modalVariante`, `confirmarModalVariante`, intercept en el
click de categoría, y el modal JSX completo (Paso 1 sabor → Paso 2 base+cantidad). `tsc`+`build`
limpios, solo frontend, sin migración.

**Falso bug reportado después de desplegar:** cliente probó con cajeros (Luisa/Isabela) y el
modal no aparecía — solo grid plano — mientras que con Marivel (otro cajero) sí funcionaba.
Parecía un problema de rol, pero `GET /berlin/categorias` no filtra por rol/estación — todos los
usuarios reciben las mismas categorías, así que el código no podía distinguir por rol. Causa
real: **Service Worker con bundle viejo cacheado** en el dispositivo de Luisa/Isabela (mismo
patrón de [[feedback_pwa_service_worker_cache]], van 2 veces ya en Berlín). Confirmado probando
en incógnito: funciona igual para todos los roles. **No tocar código por reportes de "funciona
distinto según el usuario" sin antes descartar caché del SW — pedir prueba en incógnito primero.**

**Bug real encontrado el mismo día: renombrar la categoría rompía el modal.** El cliente
renombró "JUGOS EN LECHE" → "JUGOS" (fusionando/simplificando categorías en Inventario) y el
modal dejó de aparecer, cayendo al grid plano — en POS y en Mesas. Causa: la detección original
de `idsJugosAgua`/`idsJugosLeche` exigía que el **nombre de la categoría** contuviera literalmente
"agua" o "leche" (`normalizar(c.nombre).includes('jugos') && includes('leche')`); al quitar esa
palabra del nombre, la categoría dejaba de matchear cualquiera de los dos sets → `esJugo` daba
`false`. Diseño frágil: el modal dependía de cómo el cliente decidiera nombrar sus categorías.
Fix (POS.tsx y MesasPage.tsx): la categoría "es jugo" ahora solo requiere que el nombre contenga
"jugo" (`idsJugos`, un único set, sin exigir agua/leche); la **base** (agua/leche) se deriva del
**nombre del producto** (última palabra), no de en qué categoría vive — así el cliente puede
fusionar/renombrar categorías de Inventario libremente sin romper el modal. Un producto sin
sufijo agua/leche en su nombre (caso real: "JUGO MARACUYÁ", sin variante) queda disponible bajo
cualquiera de los dos botones de base en vez de bloquear el paso 2. `tsc`+`build` limpios, solo
frontend, sin migración.

### 27. Módulo Comandas — 7 pedidos en 5 fases + 3 rondas de ajustes en producción (2026-09-16)

Tras el modal Sabor+Base (incidente 26), el cliente pidió 7 mejoras al módulo Comandas/Mesas.
Investigado el código existente antes de tocar nada (`mesas.controller.js`, `ComandasPanel.tsx`,
`MesasPage.tsx`) y presentado un plan por fases — mismo patrón que el módulo Comandas original
(incidente 24), con confirmación de despliegue entre cada una.

**Fase A (commit `e4ae4d1`, sin migración) — rename + fix real de seguridad.** Botón
`"Enviar pedido al cajero"` → `"Enviar pedido comanda"`. **Bug real encontrado:**
`cancelarOrden()` no tenía NINGÚN chequeo de dueño (ni frontend ni backend) — cualquier cajero
autenticado podía cancelar la orden de **cualquier** mesa. El guardia de "mesa de otro" en
`handleClickMesa` solo aplicaba a `rol === 'mesero'`, rol que no existe en Berlín (son
`cajero`/`admin_berlin`/`super_admin`) — nunca corría. Fix en los dos lados: solo
`br_meseros.usuario_id` del que tomó la mesa + admin como respaldo pueden cancelar (decisión
explícita del cliente: **solo** cancelar queda restringido, ver/agregar ítems a mesa ajena
sigue abierto, "porque creo que ya funciona así" — no era cierto, pero el alcance pedido fue
ese). Coincide con [[feedback_bypass_dos_capas]].

**Fase B (commit `6237a2d`, migración 102) — imagen por mesa.** `br_mesas.imagen_url`, sube
archivo o pega URL reusando `ProductImageInput` (componente ya existente, mismo endpoint
`/berlin/upload/imagen*` de productos). `MesaCard` la muestra de fondo con degradado oscuro
para que el texto siga legible.

**Fase C (commit `da8089c`) — imprimir manual.** Antes `ComandasPanel` solo auto-imprimía al
detectar ítems nuevos, sin botón para reimprimir después. Botón "Imprimir" agregado junto a
"Preparado" en cada mesa del desplegable.

**Fase D (commit `3f1b74f`) — alerta de pedido nuevo.** Toast "🔔 Pedido nuevo — Mesa X" cuando
llegan ítems nuevos a una mesa, incluida una que la estación ya había marcado lista antes.

**Fase E (commit `9d56f66`, migración 103) — estado "Servido" manual.** Nueva columna
`br_orden_mesa_items.servido_at`, **independiente** de `visto_at` (que significa "cocina/barra
terminó de preparar", no "el cajero lo entregó al cliente"). Botón por ítem en el carrito de
Mesas (`Servir`/`Servido`), badge en `MesaCard` calculado en vivo desde los ítems reales (sin
columna nueva en la mesa).

**Ronda de ajustes 1 (commit `85a8f94`) — tras la primera prueba.** El cliente reportó: (1) el
badge de la mesa no salía — resultó ser Service Worker cacheado, confirmado en incógnito, no
bug; (2) el desplegable de Comandas solo tenía Imprimir/Preparado, sin forma de marcar Servido
ahí mismo — pedido explícito: **"esto debe ser más dinámico"**. Cambio real:
`comandasPendientes()` dejó de ocultar el ítem al marcar `visto_at` (antes desaparecía de la
lista apenas "preparado", sin dar chance de ver/accionar el segundo estado) — ahora solo
desaparece al marcar `servido_at`. Botón Preparado y botón Servido por ítem, directo en el
desplegable. El panel ya no solo parpadea el ícono: se abre solo (`setOpen(true)`) cuando llega
un pedido nuevo.

**Ronda de ajustes 2 (commit `89b05d5`) — tras la segunda prueba.** El cliente insistió:
**"no le coloques el chulo verde por defecto, deja que lo haga manualmente el cajero"** — el
botón "Todo preparado" (marcaba en bloque, en silencio) se **eliminó por completo**; cada ítem
se marca uno por uno, nunca en bloque ni automático. Botón inicial por ítem "Preparado" →
"Preparando" (más claro: representa que aún se está preparando, no que ya terminó). **Bug real
encontrado:** la query de `comandas-pendientes` usa `refetchInterval: 4_000`, pero React Query
**pausa ese polling cuando la pestaña/ventana pierde el foco** (`refetchIntervalInBackground`
por defecto `false`) — en un dispositivo dedicado de cocina/barra que no siempre está en primer
plano, un pedido nuevo no aparecía solo. Causa real del reporte "cuando adiciono otro producto
no se muestra en el listado de la mesa" (confirmado con el cliente: no había presionado
"Enviar pedido comanda" en la prueba anterior — pero el bug de polling en 2º plano era real
igual, corregido a la vez).

**Ronda de ajustes 3 (commit `50bc5c1`) — tras la tercera prueba.** El cliente señaló
confusión real: la etiqueta estática "✓ Preparado" (cocina/barra terminó) se veía casi igual
al botón "Servido" (cajero entregó), mismo verde/check — un cajero podía pensar que ya se
sirvió cuando ni siquiera salió de cocina. Fix: "Listo en cocina/barra" con ícono `ChefHat`
azul, distinto del botón dorado "Servido" con ícono `Utensils`; fila de acciones aparte del
nombre para que nunca quede cortada con nombres de producto largos. **Pregunta de diseño del
cliente:** *"cuando todo está preparado y servido... ¿qué debe hacer el sistema para indicarle
al cajero que puede cobrar?"* — resuelto con 3 elementos (las 3 opciones que el cliente pidió
juntas): badge de la mesa más notorio (`💰 Listo para cobrar`, dorado pulsando), toast + botón
Cobrar resaltado/pulsando en el carrito la primera vez que la mesa completa queda servida, y
alerta cruzada también en `ComandasPanel` (ambas estaciones) — necesaria porque ninguna
pantalla de estación puede saber que la mesa quedó *toda* servida mirando solo sus propios
ítems (una mesa puede tener productos de Cocina y de Barra a la vez); el panel ahora también
sondea `/berlin/mesas` para detectarlo.

**Ajustes finales (commit `929c65e`, sin migración).** Campo "Efectivo recibido" del modal de
cobro en Mesas era un `<p>` de solo lectura sin cursor (el numpad sí escribía el valor, pero
sin foco visible) — cambiado a `<input>` real con foco automático al elegir Efectivo, mismo
patrón que ya tenía `POS.tsx` (`efectivoInputRef` + `useEffect`), que se le había quedado por
fuera al clonar el flujo a Mesas. Rol `cajero` ganó acceso en el Dashboard a Proveedores,
Gastos y Cuentas por Pagar (ya tenía Cuentas por Cobrar) — el backend no tenía ningún
`authorize()` en esas rutas, el único candado era el tile del Dashboard (`MODULOS_POR_ROL`).

Todo `tsc`+`build` limpios en cada commit. **✅ Las 5 fases + las 3 rondas de ajustes,
desplegadas y confirmadas por el usuario en producción — "todo quedó bien".**

### 28. Login username sin mayúsculas + desglose caja por cajero/módulo + campana + bloqueo Cobrar (2026-09-17)

Cuatro pedidos del cliente el mismo día, todos investigados antes de tocar código (siguiendo
el patrón habitual de este repo — leer el código real, no suponer).

**1) Login por username sensible a mayúsculas (commit `d7b64df`).** `LUISAH` fallaba con
"Credenciales inválidas" aunque la contraseña fuera correcta. Causa confirmada en
`auth/routes.js`: el login normalizaba el correo con `.toLowerCase()` pero **no** el username
— `.eq('username', identificador)` exacto. Fix: `.ilike('username', identificador)`
(coincidencia exacta, insensible a mayúsculas, sin comodines) solo para esa rama. La
contraseña sigue exacta vía `bcrypt.compare()`, sin cambios ahí — a propósito, el cliente pidió
explícitamente que la contraseña respete mayúsculas/números/símbolos tal cual.

**2) Desglose de ventas por cajero y por módulo (POS/Mesas) en Caja + Facturación (mismo
commit).** Con la caja compartida entre varios cajeros, el cliente pidió poder ver quién vendió
qué y desde dónde al cerrar. Investigación encontró 3 huecos reales:
- `cerrarCaja()` ya tenía `desglose_vendedores` (por cajero) pero sin separar POS de Mesas, y
  solo se veía en el ticket impreso, nunca en pantalla.
- `cerrarTurnoHistorico()` (cierre manual/histórico) **no tenía desglose de vendedores en
  absoluto**.
- `ventasTurno()` (el que alimenta el Cierre Parcial en vivo) **tampoco lo tenía**.

Fix: helper único `construirDesgloseVendedores(ventas)` en `caja.controller.js` — agrupa por
`vendedor_id` y anida el total en `{pos, mesa}` usando `br_ventas.origen` (ya existía desde
migración 101). Usado en los 3 endpoints. `CajaPage.tsx`: tabla en pantalla (card "Resultado
del cierre" que queda visible tras cerrar, además del modal de Cierre Parcial en vivo) y en el
ticket impreso de las 3 vistas. `ventas.controller.js listar()` agrega `origen` al select;
`FacturacionPage.tsx` muestra badge POS/MESA + nombre del cajero por factura (lista, preview y
export a Excel) — antes el módulo de origen ni se traía del backend.

**3) Alerta de Comandas con sonido (commits `66d4bb7`→`e2dd1f0`).** Pedido: que la alerta de
pedido nuevo también suene, no solo parpadee. Implementado con Web Audio API, sin archivo de
audio (`ComandasPanel.tsx`). Primera versión: beep de 1-2 tonos simple. El cliente pidió
"como campana, con el mayor volumen posible" — segunda versión: varios osciladores en relación
**inarmónica** (parciales típicos de una campana real, no múltiplos exactos de la fundamental,
eso es lo que da el timbre metálico) con ataque rápido + decaimiento exponencial lento, picos
sumando ~0.99 de ganancia (máximo posible sin distorsionar el destino de audio). Pedido nuevo =
doble campanada; "mesa lista para cobrar" = campanada única en otro tono, para distinguirlas de
oído. ⚠️ Los navegadores exigen una interacción real (clic/toque) antes de dejar sonar audio —
en un dispositivo dedicado esto se desbloquea solo con el primer toque de la sesión.

**4) Bloquear "Cobrar" hasta que todo esté servido (commit `e2dd1f0`).** Pedido explícito:
"que el botón de cobrar en mesas no se active hasta que no se haya servido el pedido... y esté
todo listo". Antes el botón siempre estaba disponible con `puedeCobar` (solo chequeo de rol).
Nuevo cálculo `listoParaCobrar = items.length > 0 && items.every(i => i.enviado_at &&
i.servido_at)` — bloquea si hay algo sin enviar a comanda O sin marcar servido, con mensaje
explicando cuál de las dos cosas falta. **Mismo candado repetido en el backend** (`cobrar()`
en `mesas.controller.js`, 400 con mensaje claro) — coincide con [[feedback_bypass_dos_capas]],
para que no se pueda saltar llamando la API directo.

`node -c`/`tsc`+`build` limpios en todos los commits. **✅ Los 4 puntos desplegados y
confirmados por el usuario en producción — "ya probé todo muy bien".**

### 29. Carrito de POS — rediseño a tarjeta blanca estilo Demo, luego revertido a oscuro + achicado (2026-09-18, commits `f6d6a21`→`1a75a56`)

Pedido: que el carrito de POS "tenga el mismo diseño del negocio Demo" (screenshots de
referencia). Investigado `kalreco/.../credito/demo/pos/POS.tsx` (clon de Esquina del
Crédito) antes de tocar nada: usa una tarjeta **blanca** (`bg-white`, texto oscuro,
miniaturas redondeadas, pastilla "N productos") dentro de un panel general oscuro —
estructura ya casi idéntica a la de Berlín (mismo patrón "igual que Esquina del Crédito"
documentado en el propio código), solo cambiaban los colores.

**Decisión confirmada con el cliente antes de tocar código:** mismo diseño/estructura que
Demo, pero manteniendo el naranja de marca de Berlín (`#EA580C`) como acento en vez del
verde/violeta de Demo — igual criterio que cada negocio de Kalreco conserva su propio color
sobre el mismo patrón visual.

**Commit `f6d6a21`** — recoloreado completo del panel derecho de `POS.tsx` (contenedor,
cabecera + pastilla de cantidad, lista de ítems, divisor arrastrable, bloque de pago
completo, los 5 métodos de pago, buscador/tarjeta de cliente, totales, botón Cobrar) y los 3
componentes que solo usa el carrito (`MiniIcon`, `NumPad`, `CrearClienteRapidoPOS`) — de
oscuro (`bg-brand-navy`/`#1C1A18`) a blanco/slate, sin tocar catálogo ni modales.

**Reversión — el cliente probó y pidió volver atrás (commits `568aeaf`→`1a75a56`):**
1. `568aeaf`: "quita el fondo blanco, que tenga el mismo color de fondo de toda la
   aplicación, tal como estaba antes" — `git checkout` del `POS.tsx` al commit anterior al
   rediseño (revierte 100% los colores) + de paso quita el grid de dígitos del `NumPad`
   (7-8-9.../CLR-0-DEL): el campo "Efectivo recibido" ya es un `<input>` real (teclado
   físico o táctil del sistema), el keypad en pantalla solo ocupaba espacio. Quedan las 4
   denominaciones rápidas ($1K/$2K/$5K/$10K).
2. `88933f0`: tampoco hacían falta las denominaciones rápidas — `NumPad` y `DENOMINACIONES`
   eliminados por completo (sin otro uso en el archivo). Campo Efectivo reduce
   `py-2.5`/`text-2xl` → `py-1.5`/`text-lg`.
3. `e76996c`: el botón Cobrar quedaba fuera de pantalla en ventanas/laptops más bajas — se
   reduce el alto de **todo** el bloque de pago (cliente, Pago Completo, grid de 4 métodos,
   caja Cambio, Totales) y el propio botón Cobrar (`py-4`→`py-2.5`).
4. `1a75a56`: la caja de "Efectivo recibido" pasa de layout vertical (label arriba, monto
   abajo) a una sola fila (label a la izquierda, monto a la derecha) — mismo dato, menos alto.

Resultado final: **mismo tema oscuro de siempre**, pero con el bloque de pago notablemente
más compacto que antes del rediseño — el Cobrar ya no se corta ni en ventanas bajas.
`tsc`+`build` limpios en cada commit. **✅ Desplegado y confirmado por el usuario en
producción** (captura: carrito con 4 productos, Efectivo $50.000, Cambio $20.000, botón
Cobrar totalmente visible).

### 30. Mesas — carrito redimensionable + "Dividir cuenta" (cobro parcial por persona) (2026-09-18/20, commits `bb204bc`→`ff4e9e0`, migración 110)

Dos pedidos seguidos del cliente sobre el módulo Mesas, ambos investigados antes de tocar código
(y con plan aprobado por fases).

**A) Carrito de Mesas redimensionable (commit `bb204bc`, solo panel).** Mismo patrón que ya tenía
`POS.tsx` (handle horizontal catálogo↔carrito + divisor vertical ítems↔pago) portado a `VistaOrden`
de `MesasPage.tsx`. Keys de `localStorage` **propias de Mesas** (`berlin-mesas-panel-width`,
`berlin-mesas-payment-height`) — nunca reutilizar las de POS (`pos-panel-width`/`pos-payment-height`).

**B) Dividir cuenta — varias personas en una mesa, cada una paga lo suyo.** Antes `cobrar()` cobraba
SIEMPRE toda la orden en una sola venta y liberaba la mesa. Ahora se puede cobrar por partes: una
venta/factura/ticket por cobro, la mesa sigue abierta hasta que no quede nada pendiente.

*Decisiones del cliente (`AskUserQuestion`):* selección **mixta** (línea completa o unidad por unidad),
candado servido **solo sobre lo seleccionado** (lo de otra persona puede seguir en cocina), redondeo
a $50 **por cada factura**, y el cobro parcial **debe funcionar sin conexión** ("el objetivo es que
este software trabaje fuera de línea").

**Fase 1 — BD + backend (`bf593db` berlin, `68a2533` kalreco; migración 110):**
- `br_orden_mesa_items.venta_id` (FK `br_ventas`, NULL = pendiente) + `pagado_at`. Un ítem con
  `venta_id` ya está cobrado y se sabe en qué factura. Si se cobra **parte** de una línea (2 de 3
  unidades) la fila original queda con lo pendiente (`cantidad` reducida) y se inserta una fila nueva
  con lo pagado. Rollback documentado en el archivo.
- `cobrar()` (`mesas.controller.js`) acepta `items: [{item_id, cantidad}]`. **Sin `items` cobra todo
  lo pendiente** (compatible con el cobro completo y con la cola offline anterior).
- **`br_ordenes_mesa.total` pasó a significar "total PENDIENTE de cobro"** mientras la orden está
  abierta (helper `recalcularTotalOrden`, suma solo ítems con `venta_id IS NULL`) — por eso la tarjeta
  de mesa y el tablero muestran lo que falta sin cambios. Al cerrarse (`cerrarOrdenCobrada`) queda
  `total` = consumo completo (pagado + pendiente), igual que el significado histórico.
- **Reclamo optimista de ítems:** después de crear la venta se marcan los ítems con
  `update ... .is('venta_id', null).eq('cantidad', <la leída>)`; si otro cobro se los llevó → se deshace
  todo (ítems + borra la venta) y responde **409**, *antes* de tocar stock, caja o contabilidad. Si el
  insert de la venta choca con el índice único de `idempotency_key` (doble envío simultáneo, `23505`)
  devuelve la venta ya creada.
- Protecciones: `actualizarItem`/`eliminarItem`/`marcarServidoItem` rechazan ítems ya cobrados;
  `cancelarOrden` se bloquea si hay cobros parciales; quitar lo **último pendiente** de una mesa con
  algo ya cobrado cierra la mesa sola (`orden_cerrada: true`). Respuesta de `cobrar()`:
  `{venta, orden_id, mesa_liberada, total_pendiente}`.
- Stock/insumos se descuentan **solo de lo cobrado** en ese cobro; `numero_venta`/turno/movimiento
  contable por venta sin cambios (Caja, Libro Diario, Facturación y desgloses leen de `br_ventas`, así
  que varias facturas por mesa cuadran solas — no se tocó nada de eso).
- ⚠️ **Orden de despliegue: migración primero, backend después** (el backend ya lee las columnas).

**Fase 2 — pantalla (`b6605c4`):** foto (`CobroSnap`) de todo lo que se cobra tomada al pulsar Cobrar
— la respuesta llega después y el polling de la orden (4 s) puede haber cambiado los datos vivos
(ticket con datos viejos/nuevos mezclados); `cobrarKey` es estado y se **regenera tras cada cobro**;
`total/redond/totalFinal` = lo que se cobra ahora (selección o todo lo pendiente); `MesaCard` y
`ComandasPanel.mesaTodoServida` ignoran ítems ya cobrados; ticket con título "CUENTA PARCIAL DE MESA".

**Fase 3 — sin conexión (`e5964dc`, `useOfflineMesasCobro.ts` reescrito):**
- Solo el **cobro** se encola offline (agregar productos, enviar pedido y marcar servido siguen
  necesitando red, como siempre — tomar una mesa entera offline sería un proyecto aparte).
- Cobro sin red → cola local con su key + **comprobante PROVISIONAL** impreso (`PROV-xxxxxx`; el
  número `MS-…` lo asigna el servidor al sincronizar y el toast relaciona ambos). Antes un cobro
  encolado no imprimía nada.
- **Reserva local de unidades:** mientras un cobro está en cola, sus unidades se restan de lo
  pendiente en pantalla (`_reservado`), no se pueden editar ni volver a cobrar. Un cobro encolado sin
  `items` (completo) reserva toda la mesa.
- "Cobrar todo" con cola presente **manda `items` explícitos** (si no, el servidor cobraría también
  las unidades reservadas → doble cobro al sincronizar).
- Cada cobro sale de la cola **solo después de refrescar la orden** (si no, sus unidades
  reaparecerían como cobrables un instante).
- ⚠️ **Cambio de comportamiento:** un cobro rechazado por el servidor por algo que NO es la red ya no
  se descarta en silencio (antes `// descartar`): queda en la cola con `error`, aviso rojo en el
  tablero con **Reintentar / Descartar** — es plata que el cajero ya recibió.
- La pantalla vuelve sola al tablero si la mesa pasa de `ocupada` a `libre` (p. ej. al sincronizar
  el último cobro guardado).

**Ventana "Dividir cuenta" (`28feae1`):** el botón del carrito abre un modal grande (una fila por
producto pendiente: stepper por unidad, "Toda la línea", "Marcar servido" si falta, resumen pendiente/
ya cobrado, "Elegir todo lo servido", "Limpiar", total con redondeo) en vez de la selección apretada
dentro del carrito de 280 px. "Cobrar selección" abre **encima** el modal de cobro de siempre
(`z-[60]` sobre `z-50`); tras cada cobro parcial la ventana sigue abierta para la siguiente persona y
se cierra sola al saldar la mesa (`modoDividir` = ventana abierta). El carrito lateral volvió al
normal con totales de todo lo pendiente (`totalFinalCarrito`, separado de `totalFinal`).

**Teclado numérico del modal de cobro de Mesas eliminado (`ff4e9e0`, pedido del cliente):**
`NumPadMesas`, `DENOMINACIONES` y el import `Delete` — el campo "Efectivo recibido" ya es un `<input>`
real (mismo criterio que POS en el incidente 29).

`node -c`, `tsc --noEmit` y `npm run build` limpios en cada commit. **✅ Desplegado; el usuario probó
en producción la ventana "Dividir cuenta" y el modal de cobro con una selección real (Mesa 6).**
⏳ **Sin confirmar todavía por el usuario:** el flujo **offline** de cobro parcial (encolar →
comprobante provisional → sincronizar) y el aviso rojo de cobro rechazado — probar con F12 → Red →
"Sin conexión". Lo que **no** se probó contra BD antes del deploy: la lógica de `cobrar()`/reclamo
(solo `node -c`); se validó en vivo por el cliente.

### 31. Mesas — cambiar el pedido de una mesa a otra (trasladar) (2026-09-20, commit `e4edf19`, sin migración)

Pedido del cliente: "un cliente se sienta, hace su pedido y después decide cambiar de mesa" — mover
el pedido completo a otra mesa **sin que se afecte nada del pedido ni su estado**.

*Decisiones del cliente (`AskUserQuestion`):* solo a mesas **libres** (unir con una ocupada sería otra
función, más compleja), **cualquier usuario con acceso a Mesas** puede trasladar (mover no pierde ni
borra nada; no se restringe como cancelar), aviso a cocina/barra **solo en pantalla** (sin tiquete),
y —por su recordatorio de que "la app siempre debe poder trabajar fuera de línea"— los cobros guardados
sin conexión **deben sobrevivir al traslado**.

**Diseño (verificado en el código antes de tocar nada):** un pedido está atado a su mesa por una sola
columna, `br_ordenes_mesa.mesa_id`; los ítems cuelgan de la orden. Trasladar = cambiar esa columna y los
estados de las 2 mesas; ítems (enviado/visto/servido/cobrado), mesero, total y fechas no se tocan, por
eso no se reimprime ni se repite nada en comandas (los ids de ítem no cambian).

- **Backend — `POST /mesas/:id/trasladar {destino_id}` (`mesas.controller.js`, `trasladar`):** valida
  destino existente/activo/`libre`/sin orden abierta. **No hay transacciones en supabase-js ni índice
  único de 1 orden abierta por mesa** (`idx_br_ordenes_mesa_estado` es solo un índice normal), así que:
  reserva el destino con `update ... .eq('estado','libre')` (409 si otro se lo llevó), mueve la orden con
  update condicional (`id`+`mesa_id` origen+`estado='abierta'`), libera el origen, y si el paso 2 falla
  revierte el destino a libre. Responde `{orden_id, origen_id, destino_id}`.
- **`cobrar()` ubica la orden por `orden_id`** si viene en el body (si no, por mesa como siempre) y usa
  `orden.mesa_id` como mesa vigente para etiquetar la venta y liberar. Los cobros que se encolan sin
  conexión ahora llevan `orden_id` → se sincronizan contra el **pedido**, no contra una mesa que ya pudo
  cambiar. `useOfflineMesasCobro.tagOrden(mesaId, ordenId)` etiqueta al trasladar los cobros guardados
  **antes** de esta versión (sin `orden_id`). `VistaOrden` recibe `colaTodos` y filtra los suyos por
  `orden_id` (o por mesa si no lo traen); `handleCobroSync` refresca todas las órdenes (`['mesa-orden']`).
- **Pantalla:** botón "Cambiar de mesa" junto a "Cancelar orden" → ventana con las mesas libres →
  `confirm()` → al éxito el padre etiqueta la cola, hace `setVistaOrden(destino)` y **`VistaOrden` lleva
  `key={mesaActual.id}`** para abrir la mesa nueva limpia. ⚠️ Sin ese `key` y sin cambiar de vista de
  inmediato, mi efecto "Mesa saldada y liberada" (mesa `ocupada`→`libre`) se disparaba por error al
  liberarse la mesa vieja y devolvía al tablero.
- **`ComandasPanel.tsx`:** `mesaPorOrdenRef` (orden_id → nombre de mesa) detecta el mismo pedido en otra
  mesa y muestra el toast "🔄 El pedido de X pasó a Y" (sin reimprimir). Además la marca de "ya avisado"
  del aviso 💰 *lista para cobrar* pasó a ser **por pedido** (`claveAviso = orden_activa.id`) y no por
  mesa: si no, un pedido ya servido trasladado a otra mesa repetía la alerta y su sonido.
- **Límite conocido:** el traslado **requiere conexión** (igual que agregar productos, enviar pedido o
  marcar servido; solo el cobro se encola offline). Hacer todo Mesas offline de principio a fin exigiría
  copia local del pedido + cola de operaciones + resolución de conflictos → propuesto como proyecto
  aparte, sin aprobar todavía.

`node -c`, `tsc --noEmit` y `npm run build` limpios. **✅ Desplegado (backend + panel); el usuario
probó el traslado en producción y reporta "todo bien" (captura de la ventana con las mesas libres).**
⏳ **Sin confirmar explícitamente por el usuario:** cobro guardado sin conexión + traslado (incluso
hecho desde otro dispositivo) y el aviso en el panel de Comandas de cocina/barra.

### 32. Comida — "¿completo o modificar?" en POS y Mesas + categorías "Sin control de stock" (2026-09-20, commit `c7346b6`, migración 111)

Pedido del cliente: un cliente pide una hamburguesa y quiere quitarle componentes (piña, lechuga…) y/o
agregarle varias salsas, **al mismo precio**. Las salsas y toppings viven en las categorías `SALSAS` (10)
y `TOPPINGS` (6) — **dos categorías separadas**, no una "Salsas y Toppings". Pidió: (1) que esos productos
se puedan incluir con stock 0 y sin costo sin afectar la contabilidad; (2) que al vender un producto de
la categoría COMIDA, antes de ponerlo en el carrito (POS **y** Mesas), se pregunte si va completo o se
modifica.

**Hallazgos del código antes de diseñar (no suponer):**
- El formulario de producto exigía `precio_venta > 0` (`MateriasPrimas.tsx`, `valid`) — por eso las 16
  salsas/toppings estaban a **$1** (mismo truco que "Venta Libre"). El CHECK de BD sí permite `>= 0`.
- `categoria.sin_stock_control` **existía en la BD pero no había NINGUNA pantalla para activarlo**. POS/
  Mesas ya lo respetan (`agotado`/`sinStock` falso) y `cobrar()`/`ventas.crear` con esa bandera llaman
  `deducirInsumosReceta` en vez de descontar el stock del producto (sin receta = no-op).
- `br_orden_mesa_items.notas` ya existía; `agregarItem` la acepta y **no junta** líneas con notas
  distintas; `ComandasPanel` ya imprime `notas` en la comanda. POS **no** tenía notas y
  `br_venta_items` no tenía la columna.
- ⚠️ Descartado a propósito: modelar salsas/toppings como **líneas $0 aparte**. Si su categoría no
  tiene estación no aparecen en ninguna comanda (`comandasPendientes` filtra por `estacion_id`) y el
  candado "Cobrar" exige `enviado_at && servido_at` en TODAS las líneas → el cajero tendría que
  marcar cada salsa como servida. Y Kalreco ya revirtió una categoría "sin contabilidad" en Esquina
  (2026-08-24) por riesgo contable: aquí basta precio $0, sin banderas que excluyan ventas.

*Decisiones del cliente (`AskUserQuestion`, todas la opción recomendada):* la modificación se guarda
como **nota de la línea de comida** (no líneas aparte) · la pregunta sale en **todos** los productos de
COMIDA (incluido DESECHABLE, donde sobra pero es inofensiva) · en POS la cocina se entera por la
**nota en el ticket y la factura** (sin tiquete de cocina aparte) · la ventana lleva **nota libre**
opcional.

**Implementación:**
- **Migración 111 (repo kalreco):** `br_venta_items.notas TEXT` (aditiva, nullable, rollback en el
  archivo). ⚠️ **Aplicar ANTES de desplegar el backend** — `ventas.crear` y `mesas.cobrar` ya la
  escriben; sin la columna cada venta de POS/Mesas fallaría.
- **`lib/comida.ts`:** detección por **nombre** de categoría (`normalizar(...).includes('comida' |
  'topping' | 'salsa')`, mismo criterio tolerante que Jugos/Limonadas) y `armarNotaModificacion` →
  `"SIN: PIÑA, LECHUGA · SALSAS: BBQ, MAYONESA · <nota libre>"`.
- **`components/ModalModificarComida.tsx` (compartido POS + Mesas):** paso 1 = dos botones grandes
  (Completo con `autoFocus`, Modificar); paso 2 = toppings (todos "con"; se toca el que NO lleva →
  tachado en rojo), salsas (se tocan las que se agregan), nota libre (120 caracteres), "Agregar
  modificada" deshabilitado hasta que haya algún cambio. Solo produce TEXTO.
- **POS (`POS.tsx`):** `addItem` intercepta productos de COMIDA (`idsComida`) → `agregarNormal` o
  `agregarConNotas`; `CartItem.notas`; `itemKey = "<producto_id>|<notas>"` (la misma modificación
  suma, una distinta abre línea aparte); `notas` viaja en el payload de `ventas` y en el de la cola
  offline (`useOfflineQueue.ts`); se muestra en el carrito y en el ticket (`** nota`).
- **Mesas (`MesasPage.tsx`):** `handleClickProducto` intercepta igual y manda `notas` a
  `agregarProd` (el backend ya la guardaba/agrupaba); notas visibles en el carrito, en la ventana de
  Dividir cuenta y en el ticket (`imprimirTicketMesa`, incluidos los cobros parciales y los
  comprobantes provisionales offline).
- **Backend:** `ventas.crear` guarda `notas` (recortada a 300); `ventas.listar`/`obtener` la devuelven;
  `mesas.cobrar` la copia de la orden a `br_venta_items` (también en la fila pagada de un cobro
  parcial); `productos.crearCategoria`/`actualizarCategoria` aceptan `sin_stock_control`.
- **Facturación:** la vista previa y la reimpresión muestran la nota.
- **Categorías "Sin control de stock":** casilla nueva en Inventario → Categorías (crear y editar) —
  nunca se marca Agotado, no descuenta stock al vender y **permite precio $0** (el formulario de
  producto acepta `>= 0` cuando su categoría tiene la bandera).
- **Seguridad:** las notas las escribe el cajero y se meten en el HTML de la ventana de impresión →
  se **escapan** (`&`, `<`, `>`) en POS, Mesas y Facturación.

**Datos en producción (SQL corrido por el usuario, `UPDATE 16`):**
```sql
UPDATE br_productos SET precio_venta = 0
WHERE categoria_id IN (SELECT id FROM br_categorias WHERE nombre IN ('SALSAS','TOPPINGS'));
```
La bandera **"Sin control de stock"** de SALSAS y TOPPINGS (lo que las deja no-Agotado y sin descuento
de stock) se marcó por SQL, corrido por el usuario (2026-09-20):
```sql
UPDATE br_categorias SET sin_stock_control = true WHERE nombre IN ('SALSAS','TOPPINGS');   -- UPDATE 2
```

**Ajuste posterior (mismo día):** al abrir una salsa/topping en Inventario el formulario **seguía
bloqueando el precio $0** ("Ingresa el Precio de Venta para poder guardar", capturas del usuario con
SALSA BBQ y CEBOLLA). Causa: mi regla `permiteCero` dependía de que la categoría tuviera la casilla
"Sin control de stock" marcada, y no lo estaba. Fix (`MateriasPrimas.tsx`): `permiteCero` = casilla
marcada **o** categoría SALSAS/TOPPINGS **por nombre** (`esCategoriaSalsas`/`esCategoriaToppings`, la
misma detección del modal) — el $0 ya no depende de un clic previo. La casilla sigue siendo lo que
evita el "Agotado" y el descuento de stock.

**Límites conocidos:** las salsas/toppings **siguen siendo productos sellables** por separado (ahora a
$0); la ventana los usa solo como lista de opciones. La pregunta sale en todo producto de COMIDA. Los
toppings/salsas se toman de los productos de esas categorías al cargar la pantalla (si se crea uno
nuevo, hay que recargar).

`node -c`, `tsc --noEmit` y `npm run build` limpios. **✅ Desplegado:** migración 111 aplicada
(`ALTER TABLE`), backend + panel reconstruidos, `UPDATE 16` corrido. El usuario abrió en producción la
ventana en Mesas (capturas: "Completo/Modificar", toppings tachados —lechuga, tomate—, salsas marcadas
—berenjena, pimentón— y nota libre "Bien Cocida").

✅ **CONFIRMADO POR EL USUARIO EN PRODUCCIÓN (2026-09-20):**
- Tras el ajuste `e105118` el formulario de producto guarda SALSAS/TOPPINGS con precio $0 ("ya
  funciona", captura con "Guardar cambios" habilitado y precio 0) y la bandera "Sin control de stock"
  está aplicada en las 2 categorías (`UPDATE 2`).
- **Venta por POS con modificación:** la captura del ticket `VT-20260920-0007-37` muestra la línea
  `HAMURGUESA PULLED PORK` con `** SIN: LECHUGA, RIPIO PAPA · SALSAS: SALSA BERENJENA · bien cocida`
  bajo el nombre, precio sin cambio ($26.000) y total $36.000 (junto a CHORIARO $10.000) — es decir: la
  ventana en POS, la nota en el carrito, el guardado de la venta (columna `notas` de la migración 111
  operando) y el ticket impreso funcionan.
- El usuario indicó "Ya probé todo" (Mesas, comanda, factura, POS); la única evidencia visual que
  adjuntó de esa ronda es el ticket de POS de arriba.

**Caso cerrado.** Nada pendiente de esta función.

## 📄 Documentación relacionada

- `README.md` (este repo) — resumen corto para quien clona el repo por primera vez.
- `kalreco/CLAUDE.md` — sección "🍺 NEGOCIO — Berlín" con el cross-reference y las migraciones
  de BD (que viven en ese repo porque la base de datos es compartida).
