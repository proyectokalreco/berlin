// ============================================================
// mermas.controller.js
// Registro de productos dañados / mermas de producción.
// Al crear una merma, descuenta el stock del producto terminado.
// ============================================================
const supabase = require('../../../config/supabase')

const SELECT_MERMA = `
  id, fecha, cantidad, motivo, descripcion, valor_perdida, created_at,
  producto:producto_id(id, nombre, imagen_url, unidad_venta, precio_venta),
  usuario:registrado_por(id, nombre, apellido)
`

const MOTIVOS_VALIDOS = ['vencimiento', 'accidente', 'mala_coccion', 'devolucion', 'prueba', 'otro']

// ── GET /panaderia/mermas ─────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { desde, hasta, motivo, limit = 50, offset = 0 } = req.query
    let q = supabase
      .from('br_mermas')
      .select(SELECT_MERMA)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (desde)  q = q.gte('fecha', desde)
    if (hasta)  q = q.lte('fecha', hasta)
    if (motivo) q = q.eq('motivo', motivo)

    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

// ── GET /panaderia/mermas/resumen ─────────────────────────────
const resumen = async (req, res, next) => {
  try {
    const hoy = new Date().toISOString().split('T')[0]
    const inicioMes = hoy.slice(0, 7) + '-01'

    const { data: hoyData } = await supabase
      .from('br_mermas')
      .select('valor_perdida')
      .eq('fecha', hoy)

    const { data: mesData } = await supabase
      .from('br_mermas')
      .select('valor_perdida, motivo')
      .gte('fecha', inicioMes)
      .lte('fecha', hoy)

    const totalHoy = (hoyData || []).reduce((s, m) => s + Number(m.valor_perdida || 0), 0)
    const totalMes  = (mesData  || []).reduce((s, m) => s + Number(m.valor_perdida || 0), 0)

    const porMotivo = {}
    for (const m of (mesData || [])) {
      const k = m.motivo || 'otro'
      porMotivo[k] = (porMotivo[k] || 0) + 1
    }

    res.json({ totalHoy, totalMes, porMotivo, countHoy: (hoyData || []).length, countMes: (mesData || []).length })
  } catch (err) { next(err) }
}

// ── POST /panaderia/mermas ────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { producto_id, cantidad, motivo, descripcion, fecha } = req.body

    if (!producto_id) return res.status(400).json({ error: 'producto_id es requerido' })
    const qty = Number(cantidad)
    if (!qty || qty <= 0) return res.status(400).json({ error: 'cantidad debe ser mayor que 0' })
    if (motivo && !MOTIVOS_VALIDOS.includes(motivo)) {
      return res.status(400).json({ error: `motivo inválido. Válidos: ${MOTIVOS_VALIDOS.join(', ')}` })
    }

    // Obtener precio de venta del producto para calcular valor_perdida
    const { data: producto } = await supabase
      .from('br_productos')
      .select('id, precio_venta, stock_actual')
      .eq('id', producto_id)
      .maybeSingle()
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' })

    const valorPerdida = qty * Number(producto.precio_venta || 0)

    const { data: merma, error } = await supabase
      .from('br_mermas')
      .insert({
        producto_id,
        cantidad:        qty,
        motivo:          motivo || 'otro',
        descripcion:     descripcion?.trim() || null,
        fecha:           fecha || new Date().toISOString().split('T')[0],
        registrado_por:  req.user.id,
        valor_perdida:   valorPerdida,
      })
      .select(SELECT_MERMA)
      .single()
    if (error) throw error

    // Descontar stock del producto terminado
    await supabase.rpc('br_ajustar_stock_producto', { p_id: producto_id, p_delta: -qty })

    res.status(201).json(merma)
  } catch (err) { next(err) }
}

// ── DELETE /panaderia/mermas/:id ──────────────────────────────
// Solo admin/propietario. Revierte el stock.
const eliminar = async (req, res, next) => {
  try {
    const { data: merma } = await supabase
      .from('br_mermas')
      .select('id, producto_id, cantidad')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!merma) return res.status(404).json({ error: 'Merma no encontrada' })

    await supabase.from('br_mermas').delete().eq('id', req.params.id)

    // Revertir stock
    await supabase.rpc('br_ajustar_stock_producto', {
      p_id:    merma.producto_id,
      p_delta: Number(merma.cantidad),
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, resumen, crear, eliminar }
