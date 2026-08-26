// ============================================================
// clientes.controller.js
// ============================================================
const supabase = require('../../../config/supabase')

// ── Listar ────────────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query
    let query = supabase.from('br_clientes').select('*').eq('activo', true).order('nombre').limit(parseInt(limit))
    if (q) query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
    const { data } = await query
    res.json(data || [])
  } catch (err) { next(err) }
}

const crear = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_clientes').insert(req.body).select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
}

const obtener = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_clientes').select('*').eq('id', req.params.id).single()
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json(data)
  } catch (err) { next(err) }
}

const actualizar = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_clientes').update(req.body).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

const historialPedidos = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_pedidos')
      .select('numero_pedido,fecha_entrega,total,estado,tipo')
      .eq('cliente_id', req.params.id)
      .order('fecha_pedido', { ascending: false })
      .limit(20)
    res.json(data || [])
  } catch (err) { next(err) }
}

// ── GET /clientes/:id/saldo ───────────────────────────────────
// Retorna facturas a crédito pendientes con saldo por factura + abonos
const saldoDetalle = async (req, res, next) => {
  try {
    const clienteId = req.params.id

    // Ventas a crédito con saldo pendiente > 0
    const { data: ventas } = await supabase
      .from('br_ventas')
      .select(`
        id, numero_venta, fecha, total, saldo_pendiente, estado,
        items:br_venta_items(cantidad, precio_unitario, subtotal,
          producto:producto_id(nombre))
      `)
      .eq('cliente_id', clienteId)
      .eq('metodo_pago', 'credito')
      .eq('estado', 'completada')
      .gt('saldo_pendiente', 0)
      .order('fecha', { ascending: false })

    // Abonos del cliente
    const { data: abonos } = await supabase
      .from('br_abonos')
      .select('id, monto, tipo, metodo_pago, notas, created_at, venta_id, registrado_por:usuarios(nombre)')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(50)

    const totalPendiente = (ventas || []).reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0)

    res.json({
      ventas:          ventas || [],
      abonos:          abonos || [],
      total_pendiente: totalPendiente,
    })
  } catch (err) { next(err) }
}

// ── POST /clientes/:id/abonar ─────────────────────────────────
// Registra un abono al saldo del cliente (total, parcial o por factura)
const abonar = async (req, res, next) => {
  try {
    const clienteId = req.params.id
    const { monto, tipo = 'parcial', venta_id, metodo_pago = 'efectivo', notas } = req.body

    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) return res.status(400).json({ error: 'monto debe ser mayor que 0' })

    // Crear abono
    const { data: abono, error: errAbono } = await supabase
      .from('br_abonos')
      .insert({
        cliente_id:     clienteId,
        venta_id:       venta_id || null,
        monto:          montoNum,
        tipo,
        metodo_pago,
        notas:          notas?.trim() || null,
        registrado_por: req.user.id,
      })
      .select()
      .single()
    if (errAbono) throw errAbono

    // Reducir saldo_pendiente
    if (venta_id) {
      // Abono a factura específica
      const { data: venta } = await supabase
        .from('br_ventas').select('saldo_pendiente').eq('id', venta_id).single()
      if (venta) {
        const nuevo = Math.max(0, Number(venta.saldo_pendiente) - montoNum)
        await supabase.from('br_ventas').update({ saldo_pendiente: nuevo }).eq('id', venta_id)
      }
    } else {
      // Abono general: distribuir por orden de antigüedad
      const { data: ventas } = await supabase
        .from('br_ventas')
        .select('id, saldo_pendiente')
        .eq('cliente_id', clienteId)
        .eq('metodo_pago', 'credito')
        .gt('saldo_pendiente', 0)
        .order('fecha', { ascending: true })

      let restante = montoNum
      for (const v of (ventas || [])) {
        if (restante <= 0) break
        const descuento = Math.min(restante, Number(v.saldo_pendiente))
        await supabase.from('br_ventas')
          .update({ saldo_pendiente: Number(v.saldo_pendiente) - descuento })
          .eq('id', v.id)
        restante -= descuento
      }
    }

    // Registrar en movimientos contables
    await supabase.from('br_movimientos_contables').insert({
      tipo:            'ingreso',
      categoria:       'abono_credito',
      concepto:        `Abono crédito cliente — ${tipo}`,
      monto:           montoNum,
      metodo_pago,
      referencia_tipo: 'abono',
      referencia_id:   abono.id,
      registrado_por:  req.user.id,
    })

    res.status(201).json(abono)
  } catch (err) { next(err) }
}

// ── POST /clientes/:id/pagar-todo ─────────────────────────────
// Salda todas las facturas pendientes del cliente de una vez
const pagarTodo = async (req, res, next) => {
  try {
    const clienteId = req.params.id
    const { metodo_pago = 'efectivo', notas } = req.body

    const { data: ventas } = await supabase
      .from('br_ventas')
      .select('id, saldo_pendiente')
      .eq('cliente_id', clienteId)
      .eq('metodo_pago', 'credito')
      .gt('saldo_pendiente', 0)

    if (!ventas?.length) return res.status(400).json({ error: 'No hay saldo pendiente' })

    const totalMonto = ventas.reduce((s, v) => s + Number(v.saldo_pendiente), 0)

    // Crear un abono total
    const { data: abono, error } = await supabase
      .from('br_abonos')
      .insert({
        cliente_id:     clienteId,
        monto:          totalMonto,
        tipo:           'total',
        metodo_pago,
        notas:          notas?.trim() || null,
        registrado_por: req.user.id,
      })
      .select().single()
    if (error) throw error

    // Saldar todas las ventas
    for (const v of ventas) {
      await supabase.from('br_ventas').update({ saldo_pendiente: 0 }).eq('id', v.id)
    }

    // Movimiento contable
    await supabase.from('br_movimientos_contables').insert({
      tipo:            'ingreso',
      categoria:       'abono_credito',
      concepto:        'Pago total saldo cliente',
      monto:           totalMonto,
      metodo_pago,
      referencia_tipo: 'abono',
      referencia_id:   abono.id,
      registrado_por:  req.user.id,
    })

    res.json({ abono, total_pagado: totalMonto })
  } catch (err) { next(err) }
}

// ── POST /clientes/:id/deuda-manual ──────────────────────────
// Registra una deuda/cobro manual (no viene de POS) directamente en el saldo del cliente.
const registrarDeudaManual = async (req, res, next) => {
  try {
    const clienteId = req.params.id
    const { monto, descripcion, notas } = req.body

    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) return res.status(400).json({ error: 'monto debe ser mayor que 0' })
    if (!descripcion?.trim())       return res.status(400).json({ error: 'descripcion requerida' })

    // Crear entrada en br_ventas tipo crédito con saldo_pendiente
    const hoy   = new Date().toISOString().split('T')[0]
    const fecha = hoy.replace(/-/g, '')
    const { count: ventasHoy } = await supabase
      .from('br_ventas').select('*', { count: 'exact', head: true })
      .gte('fecha', `${hoy}T00:00:00`).lte('fecha', `${hoy}T23:59:59`)
    const seq  = (((ventasHoy || 0) + 1)).toString().padStart(4, '0')
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0')
    const numero_venta = `DM-${fecha}-${seq}-${rand}` // DM = Deuda Manual

    const { data: venta, error } = await supabase.from('br_ventas')
      .insert({
        numero_venta,
        cliente_id:      clienteId,
        vendedor_id:     req.user.id,
        subtotal:        montoNum,
        descuento:       0,
        redondeo:        0,
        total:           montoNum,
        metodo_pago:     'credito',
        saldo_pendiente: montoNum,
        notas:           `[DEUDA MANUAL] ${descripcion.trim()}${notas ? ' — ' + notas : ''}`,
        estado:          'completada',
      })
      .select().single()
    if (error) throw error

    res.status(201).json(venta)
  } catch (err) { next(err) }
}

const eliminar = async (req, res, next) => {
  try {
    const id = req.params.id

    const { data: ventas } = await supabase.from('br_ventas')
      .select('id').eq('cliente_id', id).eq('metodo_pago', 'credito').gt('saldo_pendiente', 0)
    if (ventas?.length) return res.status(409).json({ error: 'El cliente tiene deuda pendiente. Salda el saldo antes de eliminar.' })

    const { count: separes } = await supabase.from('br_separes')
      .select('id', { count: 'exact', head: true }).eq('cliente_id', id).eq('estado', 'activo')
    if (separes > 0) return res.status(409).json({ error: `El cliente tiene ${separes} separe(s) activo(s).` })

    const { count: encargos } = await supabase.from('br_encargos')
      .select('id', { count: 'exact', head: true }).eq('cliente_id', id).in('estado', ['pendiente', 'en_produccion'])
    if (encargos > 0) return res.status(409).json({ error: `El cliente tiene ${encargos} encargo(s) pendiente(s).` })

    const { error } = await supabase.from('br_clientes').update({ activo: false }).eq('id', id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

const resumen = async (req, res, next) => {
  try {
    const [
      { data: ventasCredito },
      { count: separesActivos },
      { count: encargosActivos },
    ] = await Promise.all([
      supabase.from('br_ventas').select('cliente_id, saldo_pendiente').eq('metodo_pago', 'credito').gt('saldo_pendiente', 0),
      supabase.from('br_separes').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
      supabase.from('br_encargos').select('id', { count: 'exact', head: true }).in('estado', ['pendiente', 'en_produccion']),
    ])
    const totalCartera = (ventasCredito || []).reduce((s, v) => s + (parseFloat(v.saldo_pendiente) || 0), 0)
    const idsConDeuda = [...new Set((ventasCredito || []).filter(v => v.cliente_id).map(v => v.cliente_id))]
    res.json({
      total_cartera:       totalCartera,
      clientes_con_deuda:  idsConDeuda.length,
      ids_con_deuda:       idsConDeuda,
      separes_activos:     separesActivos || 0,
      encargos_pendientes: encargosActivos || 0,
    })
  } catch (err) { next(err) }
}

module.exports = { listar, crear, obtener, actualizar, eliminar, historialPedidos, saldoDetalle, abonar, pagarTodo, registrarDeudaManual, resumen }
