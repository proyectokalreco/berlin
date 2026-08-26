// ============================================================
// notificaciones.controller.js
// Notificaciones en tiempo real para cajero/admin.
// Principalmente usado para alertar pedidos de mesas.
// ============================================================
const supabase = require('../../../config/supabase')

// GET /panaderia/notificaciones/pendientes
// Devuelve notificaciones no leídas (polling cada 15s)
const pendientes = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_notificaciones')
      .select('id, tipo, titulo, mensaje, datos, created_at')
      .eq('leida', false)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

// PUT /panaderia/notificaciones/leer-todas
const leerTodas = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('br_notificaciones')
      .update({ leida: true })
      .eq('leida', false)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// PUT /panaderia/notificaciones/:id/leer
const leerUna = async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('br_notificaciones')
      .update({ leida: true })
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { pendientes, leerTodas, leerUna }
