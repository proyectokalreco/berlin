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
│   └── landing/     HTML estático — página pública, sin build
└── infra/
    └── docker-compose.yml   name: berlin (proyecto Docker aislado)
```

Las **migraciones de base de datos** (schema `br_*`, tenant central) viven en el repo de
**Kalreco** (`database/migrations/082-086`), porque la BD es compartida — nunca crear
migraciones acá, ni aplicar SQL suelto fuera de esa carpeta.

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

## 📦 Estado de fases (2026-08-26)

- ✅ **Fase 0** — BD: 38 tablas `br_*`, 71 FKs, 10 funciones, aplicado en producción.
- ✅ **Fase 1** — Backend: 24 controllers clonados de Tulio, login aislado, verificado con curl.
- ✅ **Fase 2** — Panel: 24 páginas, app de un solo negocio (sin Sidebar/Layout multi-negocio de
  Kalreco, rutas propias en la raíz del router), `tsc`/`build` limpios.
- ✅ **Fase 3** — Landing: diseño provisto por el usuario (Google Stitch), adaptado con logo
  real + link de login + navegación por anclas.
- ⏳ **Pendiente**: NIT/dirección/teléfono/horario reales (el cliente los tiene ficticios por
  ahora); fotos reales del local (las actuales son de un generador de imágenes, placeholder).

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

## 📄 Documentación relacionada

- `README.md` (este repo) — resumen corto para quien clona el repo por primera vez.
- `kalreco/CLAUDE.md` — sección "🍺 NEGOCIO — Berlín" con el cross-reference y las migraciones
  de BD (que viven en ese repo porque la base de datos es compartida).
