// ============================================================
// configuracion.controller.js
// Parámetros del sistema (porcentaje costos operativos, etc.)
// ============================================================
const supabase = require('../../../config/supabase')

// GET /panaderia/configuracion
const listar = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_configuracion')
      .select('clave, valor, descripcion, updated_at')
      .order('clave')
    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

// PUT /panaderia/configuracion/:clave  (update o insert si no existe)
const actualizar = async (req, res, next) => {
  try {
    const { valor, descripcion } = req.body
    if (valor === undefined || valor === null) {
      return res.status(400).json({ error: 'El campo valor es requerido' })
    }
    const clave = req.params.clave
    const now   = new Date().toISOString()

    // Intentar UPDATE primero
    const { data: updated, error: errUpd } = await supabase
      .from('br_configuracion')
      .update({ valor: String(valor), descripcion: descripcion ?? null, updated_at: now })
      .eq('clave', clave)
      .select()
      .maybeSingle()
    if (errUpd) throw errUpd

    // Si no existía la fila, INSERT
    if (!updated) {
      const { data: inserted, error: errIns } = await supabase
        .from('br_configuracion')
        .insert({ clave, valor: String(valor), descripcion: descripcion ?? null, updated_at: now })
        .select()
        .single()
      if (errIns) throw errIns
      return res.json(inserted)
    }

    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { listar, actualizar }
