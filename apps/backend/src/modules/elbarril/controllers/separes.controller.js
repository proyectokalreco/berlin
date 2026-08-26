// ============================================================
// separes.controller.js
// Separes: producto EN inventario que se aparta para un cliente.
// El stock se descuenta al confirmar la entrega.
// ============================================================
const supabase = require('../../../config/supabase')

const SELECT_SEPARE = `
  id, cantidad, precio_acordado, anticipo,
  fecha_limite, estado, notas, created_at, updated_at,
  cliente:cliente_id(id, nombre, telefono),
  producto:producto_id(id, nombre, imagen_url, stock_actual, precio_venta, unidad_venta),
  usuario:registrado_por(id, nombre)
`

// ── GET /separes ──────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { cliente_id, estado, limit = 50, offset = 0 } = req.query
    let q = supabase.from('br_separes').select(SELECT_SEPARE)
      .order('fecha_limite', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
    if (cliente_id) q = q.eq('cliente_id', cliente_id)
    if (estado)     q = q.eq('estado', estado)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

// ── POST /separes ─────────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { cliente_id, producto_id, cantidad, precio_acordado, anticipo, fecha_limite, notas, metodo_pago = 'efectivo' } = req.body
    if (!cliente_id)  return res.status(400).json({ error: 'cliente_id requerido' })
    if (!producto_id) return res.status(400).json({ error: 'producto_id requerido' })

    const qty = Number(cantidad) || 1

    // Verificar stock disponible
    const { data: prod } = await supabase.from('br_productos')
      .select('id, nombre, stock_actual').eq('id', producto_id).single()
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' })
    if (Number(prod.stock_actual) < qty) {
      return res.status(400).json({
        error: `Stock insuficiente. Disponible: ${prod.stock_actual}`,
      })
    }

    const { data, error } = await supabase.from('br_separes')
      .insert({
        cliente_id,
        producto_id,
        cantidad:       qty,
        precio_acordado: Number(precio_acordado) || prod.precio_venta || 0,
        anticipo:       Number(anticipo) || 0,
        fecha_limite:   fecha_limite || null,
        notas:          notas?.trim() || null,
        registrado_por: req.user.id,
      })
      .select(SELECT_SEPARE)
      .single()
    if (error) throw error

    // Si hay anticipo, registrar movimiento contable
    if (Number(anticipo) > 0) {
      await supabase.from('br_movimientos_contables').insert({
        fecha:           new Date().toISOString().split('T')[0],
        tipo:            'ingreso',
        categoria:       'anticipo_separe',
        concepto:        `Anticipo separe: ${prod.nombre}`,
        monto:           Number(anticipo),
        metodo_pago,
        referencia_tipo: 'separe',
        referencia_id:   data.id,
        registrado_por:  req.user.id,
      })
    }

    res.status(201).json(data)
  } catch (err) { next(err) }
}

// ── PATCH /separes/:id/entregar ───────────────────────────────
// Al entregar: descuenta stock del producto + registra movimiento
const entregar = async (req, res, next) => {
  try {
    const { metodo_pago = 'efectivo', notas } = req.body

    const { data: separe } = await supabase.from('br_separes')
      .select('id, cantidad, precio_acordado, anticipo, estado, producto_id, producto:producto_id(nombre)')
      .eq('id', req.params.id).maybeSingle()

    if (!separe) return res.status(404).json({ error: 'Separe no encontrado' })
    if (separe.estado === 'entregado') return res.status(400).json({ error: 'Separe ya entregado' })
    if (separe.estado === 'cancelado') return res.status(400).json({ error: 'Separe cancelado' })

    const saldoFinal = Math.max(0, Number(separe.precio_acordado) - Number(separe.anticipo))

    // Marcar como entregado
    const { data, error } = await supabase.from('br_separes')
      .update({ estado: 'entregado', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(SELECT_SEPARE)
      .single()
    if (error) throw error

    // Descontar stock del producto terminado
    await supabase.rpc('br_ajustar_stock_producto', {
      p_id:    separe.producto_id,
      p_delta: -Number(separe.cantidad),
    })

    // Registrar saldo final en movimientos
    if (saldoFinal > 0) {
      await supabase.from('br_movimientos_contables').insert({
        fecha:           new Date().toISOString().split('T')[0],
        tipo:            'ingreso',
        categoria:       'separe_entregado',
        concepto:        `Entrega separe: ${separe.producto?.nombre ?? 'Producto'}`,
        monto:           saldoFinal,
        metodo_pago,
        referencia_tipo: 'separe',
        referencia_id:   separe.id,
        registrado_por:  req.user.id,
      })
    }

    res.json({ separe: data, saldo_cobrado: saldoFinal })
  } catch (err) { next(err) }
}

// ── PATCH /separes/:id/cancelar ───────────────────────────────
const cancelar = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_separes')
      .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(SELECT_SEPARE)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

// ── DELETE /separes/:id ───────────────────────────────────────
// Solo permite eliminar separes en estado cancelado
const eliminar = async (req, res, next) => {
  try {
    const { data: sep } = await supabase.from('br_separes')
      .select('id, estado').eq('id', req.params.id).maybeSingle()
    if (!sep) return res.status(404).json({ error: 'Separe no encontrado' })
    if (sep.estado !== 'cancelado') return res.status(409).json({ error: 'Solo se pueden eliminar separes cancelados' })
    const { error } = await supabase.from('br_separes').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, crear, entregar, cancelar, eliminar }
