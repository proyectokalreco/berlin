# El Barril

Restaurante Bar El Barril ("Berlín Café Bar") — plataforma de gestión (POS, Mesas,
Inventario, Recetas, Producción, Caja, Libro Diario, Facturación).

Negocio **independiente** de Kalreco/mymulticentro.com (cliente distinto de
Alexander Restrepo). Comparte la misma instancia de Supabase (`kalreco_db`) que
Kalreco, aislado por su propio esquema de tablas (`br_*`) y su propio Tenant ID
en `negocios`, pero corre en su propio código, contenedores y subdominio:
`elbarril.mymulticentro.com`.

- Tenant ID (`negocios.id`): `916a3918-6157-4b2a-9a30-36b42b1906d4`
- Rol admin: `admin_elbarril` (único acceso además de `super_admin` de plataforma)
- Clonado estructuralmente de Panadería de Tulio (mismo stack, mismos módulos)

## Estructura

```
apps/
  backend/   Node.js + Express — API propia, puerto 4001
  panel/     React + Vite + Tailwind (Fase 2, pendiente)
  landing/   Página pública (Fase 3, pendiente)
```

Las migraciones de base de datos (schema `br_*`, tenant central) viven en el
repo de Kalreco (`database/migrations/082-085`), porque comparten la misma BD.
