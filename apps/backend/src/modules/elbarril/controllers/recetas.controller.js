const supabase = require('../../../config/supabase');

const listar = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_recetas')
      .select(`*, producto:producto_id(id, nombre, imagen_url, precio_venta),
               ingredientes:br_receta_ingredientes(*, insumo:insumo_id(id, nombre, unidad_medida, costo_unitario))`)
      .eq('activo', true)
      .order('nombre')
    res.json(data || [])
  } catch (err) { next(err) }
}

const obtener = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_recetas')
      .select(`*, producto:producto_id(*), ingredientes:br_receta_ingredientes(*, insumo:insumo_id(*))`)
      .eq('id', req.params.id).single()
    if (!data) return res.status(404).json({ error: 'Receta no encontrada' })
    res.json(data)
  } catch (err) { next(err) }
}

async function calcCosto(id) {
  const { data } = await supabase.from('br_receta_ingredientes')
    .select('cantidad, insumo:insumo_id(costo_unitario)').eq('receta_id', id)
  const c = (data || []).reduce(
    (s, i) => s + parseFloat(i.cantidad) * parseFloat(i.insumo?.costo_unitario || 0), 0
  )
  await supabase.from('br_recetas').update({ costo_calculado: c }).eq('id', id)
  return c
}

// Cuando una receta se vincula a un producto, el producto pasa a tipo_producto='receta'
async function sincronizarTipoProducto(productoId) {
  if (!productoId) return
  await supabase.from('br_productos')
    .update({ tipo_producto: 'receta', origen: 'receta' })
    .eq('id', productoId)
}

const crear = async (req, res, next) => {
  try {
    const { ingredientes, ...rd } = req.body
    const { data, error } = await supabase.from('br_recetas').insert(rd).select().single()
    if (error) throw error
    if (ingredientes?.length) {
      await supabase.from('br_receta_ingredientes')
        .insert(ingredientes.map(i => ({ ...i, receta_id: data.id })))
    }
    await calcCosto(data.id)
    // Marcar el producto vinculado como tipo 'receta'
    await sincronizarTipoProducto(rd.producto_id)
    res.status(201).json(data)
  } catch (err) { next(err) }
}

const actualizar = async (req, res, next) => {
  try {
    const { ingredientes, ...rd } = req.body
    await supabase.from('br_recetas').update(rd).eq('id', req.params.id)
    if (ingredientes) {
      await supabase.from('br_receta_ingredientes').delete().eq('receta_id', req.params.id)
      await supabase.from('br_receta_ingredientes')
        .insert(ingredientes.map(i => ({ ...i, receta_id: req.params.id })))
    }
    const c = await calcCosto(req.params.id)
    // Marcar el producto vinculado como tipo 'receta'
    await sincronizarTipoProducto(rd.producto_id)
    const { data } = await supabase.from('br_recetas').select('*').eq('id', req.params.id).single()
    res.json({ ...data, costo_calculado: c })
  } catch (err) { next(err) }
}

const calcularCosto = async (req, res, next) => {
  try {
    const c = await calcCosto(req.params.id)
    res.json({ costo_calculado: c })
  } catch (err) { next(err) }
}

const eliminar = async (req, res, next) => {
  try {
    const { error } = await supabase.from('br_recetas').update({ activo: false }).eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, crear, actualizar, calcularCosto, eliminar }
