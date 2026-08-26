// ============================================================
// encargos.controller.js
// Pedidos de productos a fabricar que NO están en inventario.
// Descuenta insumos SOLO al entregar (no al crear).
// ============================================================
const supabase = require('../../../config/supabase')

const SELECT_ENCARGO = `
  id, descripcion, cantidad, precio_acordado, anticipo,
  fecha_entrega, estado, notas, created_at, updated_at,
  cliente:cliente_id(id, nombre, telefono),
  producto:producto_id(id, nombre, imagen_url),
  usuario:registrado_por(id, nombre)
`

// ── GET /encargos ─────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { cliente_id, estado, limit = 50, offset = 0 } = req.query
    let q = supabase.from('br_encargos').select(SELECT_ENCARGO)
      .order('fecha_entrega', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
    if (cliente_id) q = q.eq('cliente_id', cliente_id)
    if (estado)     q = q.eq('estado', estado)
    const { data, error } = await q
    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

// ── POST /encargos ────────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { cliente_id, producto_id, descripcion, cantidad, precio_acordado, anticipo, fecha_entrega, notas, metodo_pago = 'efectivo' } = req.body
    if (!cliente_id)   return res.status(400).json({ error: 'cliente_id requerido' })
    if (!descripcion)  return res.status(400).json({ error: 'descripcion requerida' })
    if (!fecha_entrega) return res.status(400).json({ error: 'fecha_entrega requerida' })

    const { data, error } = await supabase.from('br_encargos')
      .insert({
        cliente_id,
        producto_id:    producto_id || null,
        descripcion:    descripcion.trim(),
        cantidad:       Number(cantidad) || 1,
        precio_acordado: Number(precio_acordado) || 0,
        anticipo:       Number(anticipo) || 0,
        fecha_entrega,
        notas:          notas?.trim() || null,
        registrado_por: req.user.id,
      })
      .select(SELECT_ENCARGO)
      .single()
    if (error) throw error

    // Si hay anticipo, registrar movimiento contable
    if (Number(anticipo) > 0) {
      await supabase.from('br_movimientos_contables').insert({
        fecha:           new Date().toISOString().split('T')[0],
        tipo:            'ingreso',
        categoria:       'anticipo_encargo',
        concepto:        `Anticipo encargo: ${descripcion.trim()}`,
        monto:           Number(anticipo),
        metodo_pago,
        referencia_tipo: 'encargo',
        referencia_id:   data.id,
        registrado_por:  req.user.id,
      })
    }

    res.status(201).json(data)
  } catch (err) { next(err) }
}

// ── PATCH /encargos/:id/estado ────────────────────────────────
const actualizarEstado = async (req, res, next) => {
  try {
    const { estado, notas } = req.body
    const ESTADOS = ['pendiente', 'en_produccion', 'listo', 'cancelado']
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido' })

    const { data, error } = await supabase.from('br_encargos')
      .update({ estado, notas: notas?.trim() ?? undefined, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(SELECT_ENCARGO)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

// ── PATCH /encargos/:id/entregar ──────────────────────────────
// Al entregar: registra el pago final en movimientos contables.
// No descuenta insumos (el panadero lo registra en Planilla de Producción).
const entregar = async (req, res, next) => {
  try {
    const { metodo_pago = 'efectivo', notas } = req.body

    const { data: encargo } = await supabase.from('br_encargos')
      .select('id, descripcion, precio_acordado, anticipo, estado, cliente:cliente_id(nombre)')
      .eq('id', req.params.id).maybeSingle()

    if (!encargo) return res.status(404).json({ error: 'Encargo no encontrado' })
    if (encargo.estado === 'entregado') return res.status(400).json({ error: 'Encargo ya entregado' })
    if (encargo.estado === 'cancelado') return res.status(400).json({ error: 'Encargo cancelado' })

    const saldoFinal = Math.max(0, Number(encargo.precio_acordado) - Number(encargo.anticipo))

    // Marcar como entregado
    const { data, error } = await supabase.from('br_encargos')
      .update({ estado: 'entregado', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(SELECT_ENCARGO)
      .single()
    if (error) throw error

    // Registrar saldo final en movimientos si hay pago
    if (saldoFinal > 0) {
      await supabase.from('br_movimientos_contables').insert({
        fecha:           new Date().toISOString().split('T')[0],
        tipo:            'ingreso',
        categoria:       'encargo_entregado',
        concepto:        `Entrega encargo: ${encargo.descripcion}`,
        monto:           saldoFinal,
        metodo_pago,
        referencia_tipo: 'encargo',
        referencia_id:   encargo.id,
        registrado_por:  req.user.id,
      })
    }

    res.json({ encargo: data, saldo_cobrado: saldoFinal })
  } catch (err) { next(err) }
}

// ── DELETE /encargos/:id ──────────────────────────────────────
// Solo permite eliminar encargos en estado cancelado
const eliminar = async (req, res, next) => {
  try {
    const { data: enc } = await supabase.from('br_encargos')
      .select('id, estado').eq('id', req.params.id).maybeSingle()
    if (!enc) return res.status(404).json({ error: 'Encargo no encontrado' })
    if (enc.estado !== 'cancelado') return res.status(409).json({ error: 'Solo se pueden eliminar encargos cancelados' })
    const { error } = await supabase.from('br_encargos').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, crear, actualizarEstado, entregar, eliminar }
