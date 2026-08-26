/**
 * Script: create-admin.js
 * Crea el usuario admin.berlin@kalreco.com en la BD compartida (`usuarios`).
 *
 * Uso (dentro del contenedor, una vez desplegado):
 *   docker exec -it berlin_backend node src/scripts/create-admin.js
 *
 * O localmente (con las mismas env vars que usa el backend):
 *   node src/scripts/create-admin.js
 */

require('dotenv').config();
const bcrypt    = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth:     { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  }
);

// ── Admin de Berlín ────────────────────────────────────────
const ADMIN = {
  email:      'admin.berlin@kalreco.com',
  nombre:     'Admin',
  apellido:   'Berlín',
  password:   'berlin2026*',   // ← cambiar desde el panel después del primer login
  rol:        'admin_berlin',
  negocio_id: '916a3918-6157-4b2a-9a30-36b42b1906d4',  // Tenant ID de Berlín (migración 082)
};
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🍺 Berlín — Creación de usuario administrador\n');

  const { data: existing } = await supabase
    .from('usuarios')
    .select('id, email')
    .eq('email', ADMIN.email)
    .single();

  if (existing) {
    console.log(`⚠️  Ya existe un usuario con email: ${ADMIN.email}`);
    console.log(`   ID: ${existing.id}`);
    process.exit(0);
  }

  const password_hash = await bcrypt.hash(ADMIN.password, 12);

  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      email:         ADMIN.email,
      password_hash,
      nombre:        ADMIN.nombre,
      apellido:      ADMIN.apellido,
      rol:           ADMIN.rol,
      negocio_id:    ADMIN.negocio_id,
      activo:        true,
    })
    .select('id, email, nombre, rol, negocio_id')
    .single();

  if (error) {
    console.error('❌ Error creando usuario:', error.message);
    process.exit(1);
  }

  console.log('✅ Usuario administrador creado:');
  console.log(`   Email:      ${data.email}`);
  console.log(`   Nombre:     ${data.nombre}`);
  console.log(`   Rol:        ${data.rol}`);
  console.log(`   Negocio ID: ${data.negocio_id}`);
  console.log(`   ID:         ${data.id}`);
  console.log('\n🔐 Credenciales de acceso:');
  console.log(`   Email:    ${ADMIN.email}`);
  console.log(`   Password: ${ADMIN.password}`);
  console.log('\n⚠️  Cambia la contraseña después del primer login.\n');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
