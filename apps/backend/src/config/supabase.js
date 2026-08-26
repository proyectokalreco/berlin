const { createClient } = require('@supabase/supabase-js');
const ws = require('ws'); // Requerido en Node.js < 22 para @supabase/realtime-js v3+

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Cliente con service role — solo para backend (NO exponer al frontend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
    realtime: {
      transport: ws,   // Fix Node.js 20: no tiene WebSocket nativo
    },
  }
);

module.exports = supabase;
