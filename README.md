# Berlín

Café Bar Berlín — plataforma de gestión (POS, Mesas, Inventario, Recetas, Producción, Caja,
Libro Diario, Facturación) + landing pública.

Negocio **independiente** de Kalreco/mymulticentro.com (cliente distinto de Alexander Restrepo).
Comparte la misma instancia de Supabase (`kalreco_db`) que Kalreco, aislado por su propio
esquema de tablas (`br_*`) y su propio Tenant ID en `negocios`, pero corre en su propio código,
contenedores y subdominio: `berlin.mymulticentro.com`.

- Landing pública: `https://berlin.mymulticentro.com/`
- Panel: `https://berlin.mymulticentro.com/login/`
- Tenant ID (`negocios.id`): `916a3918-6157-4b2a-9a30-36b42b1906d4`
- Rol admin: `admin_berlin` (único acceso además de `super_admin` de plataforma)
- Clonado estructuralmente de Panadería de Tulio (mismo stack, mismos módulos)

Ver **`CLAUDE.md`** para la documentación técnica completa (arquitectura, identificadores,
deploy, incidentes reales encontrados y sus fixes).

## Estructura

```
apps/
  backend/   Node.js + Express — API propia, puerto 4001
  panel/     React + Vite + Tailwind — build con base:'/login/'
  landing/   HTML estático + Tailwind CLI (compila styles.css en el build de Docker)
infra/
  docker-compose.yml   proyecto Docker aislado (name: berlin)
```

Las migraciones de base de datos (schema `br_*`, tenant central, datos reales) viven en el
repo de Kalreco (`database/migrations/082-087`), porque comparten la misma BD.

## Deploy

```bash
cd /opt/berlin && git pull origin main
cd /opt/berlin/infra && docker compose up -d --build
```
