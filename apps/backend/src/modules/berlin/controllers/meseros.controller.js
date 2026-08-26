// ============================================================
// meseros.controller.js
// ============================================================
const supabase = require('../../../config/supabase')

const listar = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_meseros')
      .select('id, nombre, color, activo, created_at')
      .eq('activo', true).order('nombre')
    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

const crear = async (req, res, next) => {
  try {
    const { nombre, pin, color } = req.body
    if (!nombre?.trim()) return res.status(400).json({ error: 'nombre requerido' })
    if (!pin || String(pin).length !== 4) return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos' })
    const { data, error } = await supabase.from('br_meseros')
      .insert({ nombre: nombre.trim(), pin: String(pin), color: color || '#00C49A' })
      .select('id, nombre, color, activo').single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
}

const actualizar = async (req, res, next) => {
  try {
    const { nombre, pin, color, activo } = req.body
    const updates = {}
    if (nombre)  updates.nombre = nombre.trim()
    if (pin)     updates.pin    = String(pin)
    if (color)   updates.color  = color
    if (activo !== undefined) updates.activo = activo
    updates.updated_at = new Date().toISOString()
    const { data, error } = await supabase.from('br_meseros')
      .update(updates).eq('id', req.params.id).select('id, nombre, color, activo').single()
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

// Verificar PIN — sin exponer el PIN almacenado
const verificarPin = async (req, res, next) => {
  try {
    const { pin } = req.body
    const { data: mesero } = await supabase.from('br_meseros')
      .select('id, nombre, color, pin, activo').eq('id', req.params.id).maybeSingle()
    if (!mesero || !mesero.activo) return res.status(404).json({ error: 'Mesero no encontrado' })
    if (mesero.pin !== String(pin)) return res.status(401).json({ error: 'PIN incorrecto' })
    res.json({ ok: true, mesero: { id: mesero.id, nombre: mesero.nombre, color: mesero.color } })
  } catch (err) { next(err) }
}

const eliminar = async (req, res, next) => {
  try {
    // Soft-delete: marcar como inactivo
    const { error } = await supabase.from('br_meseros')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, crear, actualizar, eliminar, verificarPin }
