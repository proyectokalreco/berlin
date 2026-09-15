// ============================================================
// estaciones.controller.js
// Estaciones de preparación (Cocina, Bebidas y Barra, ...) — a qué
// punto de despacho pertenece cada categoría de producto, y qué
// cajero la gestiona. CRUD simple; el módulo de Comandas (fase 2)
// las usa para enrutar los pedidos de mesa a la pantalla correcta.
// ============================================================
const supabase = require('../../../config/supabase');

const listar = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_estaciones')
      .select('*')
      .eq('activa', true)
      .order('orden');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const { nombre, color, orden } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const { data, error } = await supabase
      .from('br_estaciones')
      .insert({ nombre: nombre.trim(), color: color || '#EA580C', orden: orden || 0, activa: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizar = async (req, res, next) => {
  try {
    const { nombre, color, orden, activa } = req.body;
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (color  !== undefined) updates.color  = color;
    if (orden  !== undefined) updates.orden  = orden;
    if (activa !== undefined) updates.activa = activa;
    const { data, error } = await supabase
      .from('br_estaciones')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const eliminar = async (req, res, next) => {
  try {
    // Soft-delete — igual que categorías: si tiene categorías o empleados
    // asignados, quedan con estacion_id NULL (ON DELETE SET NULL), no se
    // bloquea el borrado.
    await supabase.from('br_estaciones').update({ activa: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = { listar, crear, actualizar, eliminar };
