// ============================================================
// mesas.controller.js
// Módulo de gestión de mesas del restaurante/panadería.
// Cada mesa tiene un estado (libre/ocupada) y puede tener
// una orden activa asignada a un mesero autenticado por PIN.
// Al cobrar genera br_venta integrada con caja y contabilidad.
// ============================================================
const supabase = require('../../../config/supabase')
const { fechaColombia, rangoDiaColombia } = require('../../../utils/fecha')

const SELECT_MESA = `
  id, numero, nombre, capacidad, estado, activa,
  orden_activa:br_ordenes_mesa(
    id, mesero_id, estado, total, created_at, notas,
    mesero:mesero_id(id, nombre, color, usuario_id),
    items:br_orden_mesa_items(
      id, cantidad, precio_unitario, subtotal, notas,
      producto:producto_id(id, nombre, imagen_url, precio_venta, unidad_venta)
    )
  )
`

// ── GET /mesas ────────────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_mesas')
      .select(SELECT_MESA)
      .eq('activa', true)
      .order('numero')
    if (error) throw error

    // Adjuntar solo la orden abierta a cada mesa
    const mesas = (data || []).map(m => ({
      ...m,
      orden_activa: (m.orden_activa || []).find(o => o.estado === 'abierta') ?? null,
    }))
    res.json(mesas)
  } catch (err) { next(err) }
}

// ── POST /mesas ───────────────────────────────────────────────
const crear = async (req, res, next) => {
  try {
    const { numero, nombre, capacidad } = req.body
    if (!numero) return res.status(400).json({ error: 'numero requerido' })
    const { data, error } = await supabase.from('br_mesas')
      .insert({ numero: parseInt(numero), nombre: nombre?.trim() || null, capacidad: parseInt(capacidad) || 4 })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
}

// ── PUT /mesas/:id ────────────────────────────────────────────
const actualizar = async (req, res, next) => {
  try {
    const { numero, nombre, capacidad, activa } = req.body
    const { data, error } = await supabase.from('br_mesas')
      .update({ numero, nombre: nombre?.trim() || null, capacidad, activa })
      .eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/abrir ─────────────────────────────────────
// Abre una orden para la mesa. Verifica PIN del mesero.
const abrirMesa = async (req, res, next) => {
  try {
    const { mesero_id, pin } = req.body
    const mesaId = req.params.id

    // Verificar PIN
    const { data: mesero } = await supabase.from('br_meseros')
      .select('id, nombre, pin, activo').eq('id', mesero_id).maybeSingle()
    if (!mesero || !mesero.activo) return res.status(404).json({ error: 'Mesero no encontrado' })
    if (mesero.pin !== pin) return res.status(401).json({ error: 'PIN incorrecto' })

    // Verificar mesa libre
    const { data: mesa } = await supabase.from('br_mesas')
      .select('id, estado').eq('id', mesaId).maybeSingle()
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
    if (mesa.estado === 'ocupada') return res.status(400).json({ error: 'Mesa ya está ocupada' })

    // Crear orden
    const { data: orden, error: errOrden } = await supabase.from('br_ordenes_mesa')
      .insert({ mesa_id: mesaId, mesero_id, estado: 'abierta' })
      .select('id, mesa_id, mesero_id, estado, created_at, mesero:mesero_id(id,nombre,color)')
      .single()
    if (errOrden) throw errOrden

    // Marcar mesa como ocupada
    await supabase.from('br_mesas').update({ estado: 'ocupada' }).eq('id', mesaId)

    res.status(201).json(orden)
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/tomar ─────────────────────────────────────
// Flujo nuevo: el usuario logueado toma la mesa directamente.
// No requiere PIN (ya está autenticado). Verifica que haya
// una caja abierta en el negocio antes de permitirlo.
const tomarMesa = async (req, res, next) => {
  try {
    const mesaId   = req.params.id
    const { id: userId, nombre, apellido, negocio_id: negocioId, rol } = req.user
    const hoy      = fechaColombia()
    const ROLES_SIN_CAJA = ['admin_berlin', 'admin', 'super_admin']

    // 1. Verificar que haya caja abierta en este negocio (admin/superadmin exentos)
    const { data: negocioUsers } = await supabase.from('usuarios')
      .select('id').eq('negocio_id', negocioId).eq('activo', true)
    const userIds = (negocioUsers || []).map(u => u.id)

    if (userIds.length && !ROLES_SIN_CAJA.includes(rol)) {
      const { data: turno } = await supabase.from('br_turnos_caja')
        .select('id').eq('fecha', hoy).eq('estado', 'abierto')
        .in('usuario_apertura_id', userIds).limit(1).maybeSingle()
      if (!turno) {
        return res.status(400).json({
          error: 'No hay caja abierta. Un cajero debe abrir el turno antes de atender mesas.'
        })
      }
    }

    // 2. Verificar mesa libre
    const { data: mesa } = await supabase.from('br_mesas')
      .select('id, estado').eq('id', mesaId).maybeSingle()
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' })
    if (mesa.estado === 'ocupada') {
      const { data: ordenActiva } = await supabase.from('br_ordenes_mesa')
        .select('mesero:mesero_id(nombre)')
        .eq('mesa_id', mesaId).eq('estado', 'abierta').maybeSingle()
      const meseroNombre = ordenActiva?.mesero?.nombre ?? 'otro mesero'
      return res.status(400).json({ error: `Mesa ocupada — asignada a ${meseroNombre}` })
    }

    // 3. Buscar o crear registro br_meseros para este usuario
    // br_meseros NO tiene negocio_id — búsqueda solo por usuario_id o nombre
    const nombreCompleto = apellido ? `${nombre} ${apellido}` : nombre

    let { data: mesero } = await supabase.from('br_meseros')
      .select('id, nombre, color')
      .eq('usuario_id', userId)
      .maybeSingle()

    if (!mesero) {
      // Intenta encontrar por nombre completo (para vincular registros existentes)
      const { data: byNombre } = await supabase.from('br_meseros')
        .select('id, nombre, color')
        .eq('nombre', nombreCompleto)
        .maybeSingle()

      if (byNombre) {
        // Vincular usuario_id al registro existente
        await supabase.from('br_meseros').update({ usuario_id: userId }).eq('id', byNombre.id)
        mesero = byNombre
      } else {
        // Crear nuevo registro mesero para este usuario
        const COLORS = ['#00C49A','#E91E8C','#F59E0B','#3B82F6','#A855F7','#F97316','#10B981','#EF4444']
        const color  = COLORS[Math.floor(Math.random() * COLORS.length)]
        const { data: nuevo, error: errM } = await supabase.from('br_meseros')
          .insert({ nombre: nombreCompleto, color, pin: '0000', activo: true, usuario_id: userId })
          .select('id, nombre, color').single()
        if (errM) throw errM
        mesero = nuevo
      }
    }

    // 4. Crear orden
    const { data: orden, error: errOrden } = await supabase.from('br_ordenes_mesa')
      .insert({ mesa_id: mesaId, mesero_id: mesero.id, estado: 'abierta' })
      .select('id, mesa_id, mesero_id, estado, created_at, mesero:mesero_id(id,nombre,color,usuario_id)')
      .single()
    if (errOrden) throw errOrden

    await supabase.from('br_mesas').update({ estado: 'ocupada' }).eq('id', mesaId)
    res.status(201).json(orden)
  } catch (err) { next(err) }
}

// ── GET /mesas/:id/orden ──────────────────────────────────────
const obtenerOrden = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_ordenes_mesa')
      .select(`
        id, estado, total, notas, created_at,
        mesa:mesa_id(id, numero, nombre),
        mesero:mesero_id(id, nombre, color),
        items:br_orden_mesa_items(
          id, cantidad, precio_unitario, subtotal, notas, created_at,
          producto:producto_id(id, nombre, imagen_url, precio_venta, unidad_venta)
        )
      `)
      .eq('mesa_id', req.params.id)
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Sin orden activa' })
    res.json(data)
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/orden/items ───────────────────────────────
const agregarItem = async (req, res, next) => {
  try {
    const { producto_id, cantidad, notas, precio_unitario, nombre_libre } = req.body
    const qty = Number(cantidad) || 1

    // Obtener orden activa
    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select('id, total').eq('mesa_id', req.params.id).eq('estado', 'abierta').maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa en esta mesa' })

    // Obtener precio del producto
    const { data: prod } = await supabase.from('br_productos')
      .select('id, precio_venta').eq('id', producto_id).single()
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' })

    // precio_unitario del body tiene prioridad (Venta Libre); sino usa precio de BD
    const precio   = precio_unitario ? Number(precio_unitario) : Number(prod.precio_venta)
    const subtotal = precio * qty
    // nombre_libre solo para Venta Libre — se guarda en notas con prefijo para el ticket
    const notasFinal = nombre_libre
      ? `[${nombre_libre.trim()}]${notas ? ' ' + notas.trim() : ''}`
      : (notas?.trim() || null)

    // Insertar ítem
    const { data: item, error } = await supabase.from('br_orden_mesa_items')
      .insert({ orden_id: orden.id, producto_id, cantidad: qty, precio_unitario: precio, subtotal, notas: notasFinal })
      .select(`id, cantidad, precio_unitario, subtotal, notas, producto:producto_id(id, nombre, imagen_url, precio_venta, unidad_venta)`)
      .single()
    if (error) throw error

    // Recalcular total desde ítems reales (evita race condition al agregar rápido)
    const { data: todosItems } = await supabase
      .from('br_orden_mesa_items').select('subtotal').eq('orden_id', orden.id)
    const nuevoTotal = (todosItems || []).reduce((s, i) => s + Number(i.subtotal), 0)
    await supabase.from('br_ordenes_mesa')
      .update({ total: nuevoTotal, updated_at: new Date().toISOString() })
      .eq('id', orden.id)

    res.status(201).json(item)
  } catch (err) { next(err) }
}

// ── PATCH /mesas/:id/orden/items/:itemId ─────────────────────
// Actualiza la cantidad de un ítem (usado por botones +/-)
const actualizarItem = async (req, res, next) => {
  try {
    const { itemId } = req.params
    const qty = Number(req.body.cantidad)
    if (!qty || qty < 1) return res.status(400).json({ error: 'cantidad inválida' })

    const { data: item } = await supabase.from('br_orden_mesa_items')
      .select('id, precio_unitario, subtotal, orden_id, cantidad')
      .eq('id', itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })

    const nuevoSubtotal = Number(item.precio_unitario) * qty
    const diff          = nuevoSubtotal - Number(item.subtotal)

    await supabase.from('br_orden_mesa_items')
      .update({ cantidad: qty, subtotal: nuevoSubtotal })
      .eq('id', itemId)

    // Recalcular total desde ítems reales (evita race condition)
    const { data: todosItems } = await supabase
      .from('br_orden_mesa_items').select('subtotal').eq('orden_id', item.orden_id)
    const nuevoTotal = (todosItems || []).reduce((s, i) => s + Number(i.subtotal), 0)
    await supabase.from('br_ordenes_mesa')
      .update({ total: nuevoTotal, updated_at: new Date().toISOString() })
      .eq('id', item.orden_id)

    res.json({ ok: true, cantidad: qty, subtotal: nuevoSubtotal })
  } catch (err) { next(err) }
}

// ── DELETE /mesas/:id/orden/items/:itemId ─────────────────────
const eliminarItem = async (req, res, next) => {
  try {
    const { itemId } = req.params

    const { data: item } = await supabase.from('br_orden_mesa_items')
      .select('id, subtotal, orden_id').eq('id', itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })

    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select('id, total').eq('id', item.orden_id).single()

    await supabase.from('br_orden_mesa_items').delete().eq('id', itemId)

    // Recalcular total desde ítems reales (evita race condition)
    const { data: todosItems } = await supabase
      .from('br_orden_mesa_items').select('subtotal').eq('orden_id', item.orden_id)
    const nuevoTotal = (todosItems || []).reduce((s, i) => s + Number(i.subtotal), 0)
    await supabase.from('br_ordenes_mesa')
      .update({ total: nuevoTotal, updated_at: new Date().toISOString() })
      .eq('id', item.orden_id)

    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/cobrar ────────────────────────────────────
// Crea br_venta desde la orden + libera la mesa
const cobrar = async (req, res, next) => {
  try {
    const { metodo_pago = 'efectivo', cliente_id, caja_id, redondeo = 0, idempotency_key } = req.body
    const mesaId = req.params.id

    // Idempotencia: si ya se cobró esta mesa con este key, devolver la venta existente
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('br_ventas')
        .select('*, br_venta_items(*)')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existing) return res.status(200).json({ venta: existing, mesa: null })
    }

    // Obtener orden activa con items
    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select(`id, total, mesa_id, mesero_id, items:br_orden_mesa_items(producto_id, cantidad, precio_unitario, subtotal)`)
      .eq('mesa_id', mesaId).eq('estado', 'abierta').maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa' })
    if (!orden.items?.length) return res.status(400).json({ error: 'La orden no tiene ítems' })

    const { data: mesa } = await supabase.from('br_mesas').select('numero, nombre').eq('id', mesaId).single()

    const subtotal    = orden.items.reduce((s, i) => s + Number(i.subtotal), 0)
    const redondeoNum = Number(redondeo) || 0
    const total       = Math.max(0, subtotal + redondeoNum)

    // Generar número de venta (timezone Colombia)
    const hoy   = fechaColombia()
    const fecha = hoy.replace(/-/g, '')
    const { desde: desdeDia, hasta: hastaDia } = rangoDiaColombia(hoy)
    const { count: ventasHoy } = await supabase.from('br_ventas')
      .select('*', { count: 'exact', head: true })
      .gte('fecha', desdeDia).lte('fecha', hastaDia)
    const seq  = ((ventasHoy || 0) + 1).toString().padStart(4, '0')
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0')
    const numero_venta = `MS-${fecha}-${seq}-${rand}` // MS = Mesa

    // Crear venta
    // Nota: caja_id FK referencia br_caja (tabla original), turnoActivo.id es br_turnos_caja
    // → dejamos null para evitar violación de FK; turno se actualiza por separado
    const { data: venta, error: errVenta } = await supabase.from('br_ventas')
      .insert({
        numero_venta,
        cliente_id:      cliente_id || null,
        vendedor_id:     req.user.id,
        subtotal,
        descuento:       0,
        redondeo:        redondeoNum,
        total,
        metodo_pago,
        caja_id:         null,
        notas:           `Mesa ${mesa?.numero ?? ''}${mesa?.nombre ? ' - ' + mesa.nombre : ''}`,
        idempotency_key: idempotency_key || null,
        saldo_pendiente: metodo_pago === 'credito' ? total : null,
      })
      .select().single()
    if (errVenta) throw errVenta

    // Insertar items de venta
    const ventaItems = orden.items.map(i => ({
      venta_id:        venta.id,
      producto_id:     i.producto_id,
      cantidad:        i.cantidad,
      precio_unitario: i.precio_unitario,
      descuento:       0,
      subtotal:        i.subtotal,
    }))
    await supabase.from('br_venta_items').insert(ventaItems)

    // Descontar stock: productos normales → stock_actual;
    // categoría sin_stock_control (Preparaciones de Cafetería) → insumos de receta.
    const { deducirInsumosReceta } = require('./helpers/deducirInsumosReceta');
    for (const item of orden.items) {
      const { data: prod } = await supabase
        .from('br_productos')
        .select('categoria:categoria_id(sin_stock_control)')
        .eq('id', item.producto_id)
        .single();

      if (prod?.categoria?.sin_stock_control) {
        await deducirInsumosReceta(item.producto_id, Number(item.cantidad));
      } else {
        await supabase.rpc('br_descontar_stock_producto', {
          p_producto_id: item.producto_id,
          p_cantidad:    Number(item.cantidad),
        });
      }
    }

    // Actualizar totales del turno activo (br_turnos_caja) si se proveyó caja_id
    if (caja_id && metodo_pago !== 'credito') {
      const tipo_turno = metodo_pago === 'transferencia' ? 'venta_transferencia'
        : metodo_pago.includes('qr') ? 'venta_qr' : 'venta_efectivo'
      await supabase.rpc('br_actualizar_totales_turno', {
        p_turno_id:   caja_id,
        p_monto:      total,
        p_tipo:       tipo_turno,
        p_num_ventas: 1,
      }) // error silencioso — no bloquear la venta
    }

    // Movimiento contable (schema: tipo, categoria, concepto, monto, referencia_tipo, referencia_id, registrado_por)
    await supabase.from('br_movimientos_contables').insert({
      tipo:            'ingreso',
      categoria:       'venta_mesa',
      concepto:        `Venta mesa ${mesa?.numero ?? ''} — ${numero_venta}`,
      monto:           total,
      metodo_pago,
      referencia_tipo: 'venta',
      referencia_id:   venta.id,
      registrado_por:  req.user.id,
    })

    // Cerrar orden + liberar mesa
    await supabase.from('br_ordenes_mesa')
      .update({ estado: 'cobrada', total, updated_at: new Date().toISOString() })
      .eq('id', orden.id)
    await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', mesaId)

    // Marcar como leídas las notificaciones de esta mesa
    await supabase.from('br_notificaciones')
      .update({ leida: true })
      .eq('leida', false)
      .contains('datos', { mesa_id: mesaId })

    res.json({ venta, orden_id: orden.id })
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/cancelar-orden ───────────────────────────
const cancelarOrden = async (req, res, next) => {
  try {
    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select('id').eq('mesa_id', req.params.id).eq('estado', 'abierta').maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa' })

    await supabase.from('br_ordenes_mesa').update({ estado: 'cancelada' }).eq('id', orden.id)
    await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/enviar-pedido ────────────────────────────
// Mesero notifica al cajero que el pedido está listo para cobrar
const enviarPedido = async (req, res, next) => {
  try {
    const mesaId = req.params.id

    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select(`
        id, total,
        items:br_orden_mesa_items(id),
        mesero:mesero_id(nombre),
        mesa:mesa_id(numero, nombre)
      `)
      .eq('mesa_id', mesaId)
      .eq('estado', 'abierta')
      .maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa' })

    // Verificar que no haya ya una notificación pendiente para esta orden
    const { data: notifExistente } = await supabase.from('br_notificaciones')
      .select('id')
      .eq('leida', false)
      .contains('datos', { orden_id: orden.id })
      .maybeSingle()
    if (notifExistente) {
      return res.status(400).json({ error: 'El pedido ya fue enviado al cajero y está pendiente de cobro.' })
    }

    const mesa      = orden.mesa
    const mesero    = orden.mesero
    const numItems  = orden.items?.length ?? 0
    const mesaNom   = mesa?.nombre ? `${mesa.numero} — ${mesa.nombre}` : `Mesa ${mesa?.numero ?? ''}`
    const totalFmt  = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(orden.total))

    const { error } = await supabase.from('br_notificaciones').insert({
      tipo:       'nueva_orden_mesa',
      titulo:     `🍽️ Pedido listo — ${mesaNom}`,
      mensaje:    `${mesero?.nombre ?? 'Mesero'} envió pedido · ${numItems} producto${numItems !== 1 ? 's' : ''} · Total ${totalFmt}`,
      datos:      { mesa_id: mesaId, orden_id: orden.id, mesa_numero: mesa?.numero, total: orden.total },
      creada_por: req.user.id,
    })
    if (error) throw error

    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── DELETE /mesas/:id ─────────────────────────────────────────
const eliminar = async (req, res, next) => {
  try {
    const { data: mesa } = await supabase.from('br_mesas')
      .select('estado').eq('id', req.params.id).maybeSingle()
    if (mesa?.estado === 'ocupada') return res.status(400).json({ error: 'No se puede eliminar una mesa ocupada' })
    await supabase.from('br_mesas').update({ activa: false }).eq('id', req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, crear, actualizar, eliminar, abrirMesa, tomarMesa, obtenerOrden, agregarItem, actualizarItem, eliminarItem, cobrar, cancelarOrden, enviarPedido }
