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
  id, numero, nombre, capacidad, estado, activa, imagen_url,
  orden_activa:br_ordenes_mesa(
    id, mesero_id, estado, total, created_at, notas,
    mesero:mesero_id(id, nombre, color, usuario_id),
    items:br_orden_mesa_items(
      id, cantidad, precio_unitario, subtotal, notas, enviado_at, servido_at, venta_id, pagado_at,
      producto:producto_id(id, nombre, imagen_url, precio_venta, unidad_venta)
    )
  )
`

// Cobro parcial (migración 110): br_ordenes_mesa.total = total PENDIENTE de cobro
// (ítems con venta_id NULL) mientras la orden está abierta. Los ítems ya cobrados
// (venta_id NOT NULL) quedan en la orden como historial pero no suman.
const recalcularTotalOrden = async (ordenId) => {
  const { data: todos } = await supabase
    .from('br_orden_mesa_items').select('subtotal, venta_id').eq('orden_id', ordenId)
  const filas      = todos || []
  const pendientes = filas.filter(i => !i.venta_id)
  const total      = pendientes.reduce((s, i) => s + Number(i.subtotal), 0)
  await supabase.from('br_ordenes_mesa')
    .update({ total, updated_at: new Date().toISOString() })
    .eq('id', ordenId)
  return { total, pendientes: pendientes.length, pagados: filas.length - pendientes.length }
}

// Cierra la orden como cobrada (total = consumo completo, pagado + pendiente),
// libera la mesa y marca leídas sus notificaciones.
const cerrarOrdenCobrada = async (ordenId, mesaId) => {
  const { data: todos } = await supabase
    .from('br_orden_mesa_items').select('subtotal').eq('orden_id', ordenId)
  const totalConsumo = (todos || []).reduce((s, i) => s + Number(i.subtotal), 0)
  await supabase.from('br_ordenes_mesa')
    .update({ estado: 'cobrada', total: totalConsumo, updated_at: new Date().toISOString() })
    .eq('id', ordenId)
  await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', mesaId)
  await supabase.from('br_notificaciones')
    .update({ leida: true })
    .eq('leida', false)
    .contains('datos', { mesa_id: mesaId })
}

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
    const { numero, nombre, capacidad, imagen_url } = req.body
    if (!numero) return res.status(400).json({ error: 'numero requerido' })
    const { data, error } = await supabase.from('br_mesas')
      .insert({ numero: parseInt(numero), nombre: nombre?.trim() || null, capacidad: parseInt(capacidad) || 4, imagen_url: imagen_url || null })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err) { next(err) }
}

// ── PUT /mesas/:id ────────────────────────────────────────────
const actualizar = async (req, res, next) => {
  try {
    const { numero, nombre, capacidad, activa, imagen_url } = req.body
    const updates = { numero, nombre: nombre?.trim() || null, capacidad, activa }
    if (imagen_url !== undefined) updates.imagen_url = imagen_url || null
    const { data, error } = await supabase.from('br_mesas')
      .update(updates)
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
    const { id: userId, nombre, apellido, rol } = req.user
    const ROLES_SIN_CAJA = ['admin_berlin', 'admin', 'super_admin']

    // 1. Verificar que haya caja abierta en el negocio (admin/superadmin exentos).
    // Caja compartida: el único turno con estado='abierto' es el activo, sin
    // filtrar por fecha calendario ni por quién lo abrió — mismo criterio que
    // caja.controller.js (horario 1pm-5am, ver incidente 22). Filtrar por
    // fecha=hoy() rompía esto justo después de medianoche con un turno de la
    // tarde anterior todavía abierto.
    if (!ROLES_SIN_CAJA.includes(rol)) {
      const { data: turno } = await supabase.from('br_turnos_caja')
        .select('id').eq('estado', 'abierto').limit(1).maybeSingle()
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
          id, cantidad, precio_unitario, subtotal, notas, created_at, enviado_at, servido_at, venta_id, pagado_at,
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

    // Igual que el carrito de POS: si el mismo producto (mismo precio/nota) ya está
    // en la orden y todavía NO se envió a las estaciones (enviado_at NULL), se suma
    // a esa línea en vez de crear una fila aparte — un producto = una línea con
    // cantidad, no N filas repetidas. Un ítem ya enviado nunca se toca (evita que
    // una unidad nueva quede oculta para la cocina sin re-enviarse).
    let itemQuery = supabase.from('br_orden_mesa_items')
      .select('id, cantidad, subtotal')
      .eq('orden_id', orden.id)
      .eq('producto_id', producto_id)
      .eq('precio_unitario', precio)
      .is('enviado_at', null)
      .is('venta_id', null)
    itemQuery = notasFinal ? itemQuery.eq('notas', notasFinal) : itemQuery.is('notas', null)
    const { data: existente } = await itemQuery.maybeSingle()

    let item, error
    if (existente) {
      const nuevaCantidad = Number(existente.cantidad) + qty
      const nuevoSubtotal = precio * nuevaCantidad
      ;({ data: item, error } = await supabase.from('br_orden_mesa_items')
        .update({ cantidad: nuevaCantidad, subtotal: nuevoSubtotal })
        .eq('id', existente.id)
        .select(`id, cantidad, precio_unitario, subtotal, notas, producto:producto_id(id, nombre, imagen_url, precio_venta, unidad_venta)`)
        .single())
    } else {
      ;({ data: item, error } = await supabase.from('br_orden_mesa_items')
        .insert({ orden_id: orden.id, producto_id, cantidad: qty, precio_unitario: precio, subtotal, notas: notasFinal })
        .select(`id, cantidad, precio_unitario, subtotal, notas, producto:producto_id(id, nombre, imagen_url, precio_venta, unidad_venta)`)
        .single())
    }
    if (error) throw error

    // Recalcular total pendiente desde ítems reales (evita race condition al agregar rápido)
    await recalcularTotalOrden(orden.id)

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
      .select('id, precio_unitario, subtotal, orden_id, cantidad, venta_id')
      .eq('id', itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })
    if (item.venta_id) return res.status(400).json({ error: 'Este producto ya fue cobrado — no se puede modificar.' })

    const nuevoSubtotal = Number(item.precio_unitario) * qty

    await supabase.from('br_orden_mesa_items')
      .update({ cantidad: qty, subtotal: nuevoSubtotal })
      .eq('id', itemId)

    // Recalcular total pendiente desde ítems reales (evita race condition)
    await recalcularTotalOrden(item.orden_id)

    res.json({ ok: true, cantidad: qty, subtotal: nuevoSubtotal })
  } catch (err) { next(err) }
}

// ── DELETE /mesas/:id/orden/items/:itemId ─────────────────────
const eliminarItem = async (req, res, next) => {
  try {
    const { itemId } = req.params

    const { data: item } = await supabase.from('br_orden_mesa_items')
      .select('id, subtotal, orden_id, venta_id').eq('id', itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })
    if (item.venta_id) return res.status(400).json({ error: 'Este producto ya fue cobrado — no se puede quitar.' })

    await supabase.from('br_orden_mesa_items').delete().eq('id', itemId)

    // Recalcular total pendiente desde ítems reales (evita race condition)
    const { pendientes, pagados } = await recalcularTotalOrden(item.orden_id)

    // Si ya se cobró parte de la mesa y con este ítem se acaba lo pendiente, la
    // orden queda saldada: se cierra y se libera la mesa.
    if (pendientes === 0 && pagados > 0) {
      await cerrarOrdenCobrada(item.orden_id, req.params.id)
      return res.json({ ok: true, orden_cerrada: true })
    }

    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── PATCH /mesas/:id/orden/items/:itemId/servido ─────────────
// Estado manual "servido al cliente" — distinto de visto_at (cocina/
// barra lo preparó). Lo marca el cajero que atiende la mesa. Toggle:
// si ya estaba servido lo desmarca (por si se marcó por error).
const marcarServidoItem = async (req, res, next) => {
  try {
    const { itemId } = req.params
    const { data: item } = await supabase.from('br_orden_mesa_items')
      .select('id, servido_at, venta_id').eq('id', itemId).maybeSingle()
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })
    if (item.venta_id) return res.status(400).json({ error: 'Este producto ya fue cobrado.' })

    const { data, error } = await supabase.from('br_orden_mesa_items')
      .update({ servido_at: item.servido_at ? null : new Date().toISOString() })
      .eq('id', itemId)
      .select('id, servido_at')
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/cobrar ────────────────────────────────────
// Crea una br_venta con lo que se cobra. Cobro parcial (dividir cuenta): body.items =
// [{ item_id, cantidad }] — cobra solo esas unidades; sin body.items cobra todo lo
// pendiente (compatible con el cobro completo y con la cola offline anterior). La
// orden se cierra y la mesa se libera solo cuando no queda nada pendiente.
const cobrar = async (req, res, next) => {
  try {
    const {
      metodo_pago = 'efectivo', cliente_id, caja_id, redondeo = 0, idempotency_key,
      monto_efectivo, monto_transferencia, items: itemsSel, orden_id,
    } = req.body
    let mesaId = req.params.id

    // Idempotencia: si ya se cobró con este key, devolver la venta existente
    const buscarPorKey = async () => {
      const { data: existing } = await supabase
        .from('br_ventas')
        .select('*, br_venta_items(*)')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      return existing
    }
    if (idempotency_key) {
      const existing = await buscarPorKey()
      if (existing) return res.status(200).json({ venta: existing, mesa: null, replay: true })
    }

    // Obtener orden activa con items. Si viene orden_id (los cobros guardados sin conexión
    // lo mandan) se ubica POR ORDEN y no por mesa: el pedido pudo trasladarse a otra mesa
    // entre que el cobro se guardó y se sincronizó.
    let qOrden = supabase.from('br_ordenes_mesa')
      .select(`id, total, mesa_id, mesero_id, items:br_orden_mesa_items(id, producto_id, cantidad, precio_unitario, subtotal, notas, enviado_at, visto_at, servido_at, venta_id)`)
    qOrden = orden_id ? qOrden.eq('id', orden_id) : qOrden.eq('mesa_id', mesaId)
    const { data: orden } = await qOrden.eq('estado', 'abierta').maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa' })
    mesaId = orden.mesa_id   // la mesa vigente del pedido (puede no ser la del URL si se trasladó)
    if (!orden.items?.length) return res.status(400).json({ error: 'La orden no tiene ítems' })

    const pendientes = orden.items.filter(i => !i.venta_id)
    if (!pendientes.length) return res.status(400).json({ error: 'No hay productos pendientes de cobro en esta mesa' })

    // Selección: [{ item, cantidad, completa, subtotal }]
    let seleccion
    if (Array.isArray(itemsSel) && itemsSel.length) {
      const vistos = new Set()
      seleccion = []
      for (const s of itemsSel) {
        const cant = Number(s.cantidad)
        const item = pendientes.find(i => i.id === s.item_id)
        if (!item) {
          const yaCobrado = orden.items.some(i => i.id === s.item_id && i.venta_id)
          return res.status(yaCobrado ? 409 : 400).json({
            error: yaCobrado
              ? 'Alguno de los productos ya fue cobrado. Actualiza la mesa e inténtalo de nuevo.'
              : 'Selección inválida: producto no pertenece a esta mesa.',
          })
        }
        if (!Number.isFinite(cant) || cant <= 0 || cant > Number(item.cantidad) + 1e-9 || vistos.has(item.id)) {
          return res.status(400).json({ error: 'Selección inválida: cantidad incorrecta o producto repetido.' })
        }
        vistos.add(item.id)
        const completa = Math.abs(cant - Number(item.cantidad)) < 1e-9
        seleccion.push({
          item, cantidad: completa ? Number(item.cantidad) : cant, completa,
          subtotal: completa ? Number(item.subtotal) : Math.round(Number(item.precio_unitario) * cant * 100) / 100,
        })
      }
    } else {
      seleccion = pendientes.map(item => ({
        item, cantidad: Number(item.cantidad), completa: true, subtotal: Number(item.subtotal),
      }))
    }

    // Solo lo que se cobra debe estar enviado Y servido — mismo candado del frontend,
    // repetido acá para que no se pueda saltar por API directa. Lo que queda pendiente
    // (de otra persona) puede seguir en cocina.
    const sinEnviar = seleccion.some(s => !s.item.enviado_at)
    const sinServir = seleccion.some(s => !s.item.servido_at)
    if (sinEnviar || sinServir) {
      return res.status(400).json({
        error: sinEnviar
          ? 'No se puede cobrar: hay productos sin enviar a comanda.'
          : 'No se puede cobrar: hay productos sin servir en la mesa.',
      })
    }

    const { data: mesa } = await supabase.from('br_mesas').select('numero, nombre').eq('id', mesaId).single()

    const subtotal    = seleccion.reduce((s, x) => s + x.subtotal, 0)
    const redondeoNum = Number(redondeo) || 0
    const total       = Math.max(0, subtotal + redondeoNum)

    let montoEfectivoVal = null
    let montoTransferenciaVal = null
    if (metodo_pago === 'mixto') {
      montoEfectivoVal = parseFloat(monto_efectivo)
      montoTransferenciaVal = parseFloat(monto_transferencia)
      if (!Number.isFinite(montoEfectivoVal) || !Number.isFinite(montoTransferenciaVal) || montoEfectivoVal < 0 || montoTransferenciaVal < 0) {
        return res.status(400).json({ error: 'Pago mixto requiere monto_efectivo y monto_transferencia' })
      }
      if (Math.abs((montoEfectivoVal + montoTransferenciaVal) - total) > 1) {
        return res.status(400).json({ error: 'La suma de efectivo + transferencia no coincide con el total' })
      }
    }

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
        origen:          'mesa',
        caja_id:         null,
        notas:           `Mesa ${mesa?.numero ?? ''}${mesa?.nombre ? ' - ' + mesa.nombre : ''}`,
        idempotency_key: idempotency_key || null,
        saldo_pendiente: metodo_pago === 'credito' ? total : null,
        monto_efectivo:      montoEfectivoVal,
        monto_transferencia: montoTransferenciaVal,
      })
      .select().single()
    if (errVenta) {
      // Doble envío simultáneo con la misma key (índice único): devolver la venta ya creada
      if (errVenta.code === '23505' && idempotency_key) {
        const existing = await buscarPorKey()
        if (existing) return res.status(200).json({ venta: existing, mesa: null, replay: true })
      }
      throw errVenta
    }

    // Reclamar los ítems cobrados (venta_id) con condición optimista: si otro cobro se
    // los llevó entre la lectura y ahora, se deshace y se responde 409 SIN haber tocado
    // stock, caja ni contabilidad (eso va después de este paso).
    const ahora     = new Date().toISOString()
    const reclamados = []
    let conflicto   = false
    for (const s of seleccion) {
      const it = s.item
      if (s.completa) {
        const { data: upd } = await supabase.from('br_orden_mesa_items')
          .update({ venta_id: venta.id, pagado_at: ahora })
          .eq('id', it.id).is('venta_id', null).eq('cantidad', it.cantidad)
          .select('id')
        if (!upd?.length) { conflicto = true; break }
        reclamados.push({ tipo: 'completa', id: it.id })
      } else {
        const resto = Number(it.cantidad) - s.cantidad
        const { data: upd } = await supabase.from('br_orden_mesa_items')
          .update({ cantidad: resto, subtotal: Math.round(Number(it.precio_unitario) * resto * 100) / 100 })
          .eq('id', it.id).is('venta_id', null).eq('cantidad', it.cantidad)
          .select('id')
        if (!upd?.length) { conflicto = true; break }
        const { data: nuevo, error: errNuevo } = await supabase.from('br_orden_mesa_items')
          .insert({
            orden_id: orden.id, producto_id: it.producto_id, cantidad: s.cantidad,
            precio_unitario: it.precio_unitario, subtotal: s.subtotal, notas: it.notas ?? null,
            enviado_at: it.enviado_at, visto_at: it.visto_at ?? null, servido_at: it.servido_at,
            venta_id: venta.id, pagado_at: ahora,
          })
          .select('id').single()
        if (errNuevo || !nuevo) {
          await supabase.from('br_orden_mesa_items')
            .update({ cantidad: it.cantidad, subtotal: it.subtotal }).eq('id', it.id)
          conflicto = true; break
        }
        reclamados.push({ tipo: 'parcial', id: it.id, nuevoId: nuevo.id, cantidad: it.cantidad, subtotal: it.subtotal })
      }
    }
    if (conflicto) {
      for (const r of reclamados) {
        if (r.tipo === 'completa') {
          await supabase.from('br_orden_mesa_items').update({ venta_id: null, pagado_at: null }).eq('id', r.id)
        } else {
          await supabase.from('br_orden_mesa_items').delete().eq('id', r.nuevoId)
          await supabase.from('br_orden_mesa_items').update({ cantidad: r.cantidad, subtotal: r.subtotal }).eq('id', r.id)
        }
      }
      await supabase.from('br_ventas').delete().eq('id', venta.id)
      return res.status(409).json({
        error: 'Alguno de los productos ya fue cobrado desde otro dispositivo. Actualiza la mesa e inténtalo de nuevo.',
      })
    }

    // Insertar items de venta (solo lo cobrado, con la cantidad cobrada)
    const ventaItems = seleccion.map(s => ({
      venta_id:        venta.id,
      producto_id:     s.item.producto_id,
      cantidad:        s.cantidad,
      precio_unitario: s.item.precio_unitario,
      descuento:       0,
      subtotal:        s.subtotal,
      notas:           s.item.notas ?? null,   // modificación del producto, para el ticket/factura
    }))
    await supabase.from('br_venta_items').insert(ventaItems)

    // Descontar stock: productos normales → stock_actual;
    // categoría sin_stock_control (Preparaciones de Cafetería) → insumos de receta.
    const { deducirInsumosReceta } = require('./helpers/deducirInsumosReceta');
    for (const { item, cantidad } of seleccion) {
      const { data: prod } = await supabase
        .from('br_productos')
        .select('categoria:categoria_id(sin_stock_control)')
        .eq('id', item.producto_id)
        .single();

      if (prod?.categoria?.sin_stock_control) {
        await deducirInsumosReceta(item.producto_id, cantidad);
      } else {
        await supabase.rpc('br_descontar_stock_producto', {
          p_producto_id: item.producto_id,
          p_cantidad:    cantidad,
        });
      }
    }

    // Actualizar totales del turno activo (br_turnos_caja) si se proveyó caja_id
    if (caja_id && metodo_pago !== 'credito') {
      if (metodo_pago === 'mixto') {
        // Reparte entre los 2 bolsillos — nunca contarlo todo como efectivo
        if (montoEfectivoVal > 0) {
          await supabase.rpc('br_actualizar_totales_turno', {
            p_turno_id: caja_id, p_monto: montoEfectivoVal, p_tipo: 'venta_efectivo', p_num_ventas: 1,
          })
        }
        if (montoTransferenciaVal > 0) {
          await supabase.rpc('br_actualizar_totales_turno', {
            p_turno_id: caja_id, p_monto: montoTransferenciaVal, p_tipo: 'venta_transferencia',
            p_num_ventas: montoEfectivoVal > 0 ? 0 : 1,
          })
        }
      } else {
        const tipo_turno = metodo_pago === 'transferencia' ? 'venta_transferencia'
          : metodo_pago.includes('qr') ? 'venta_qr' : 'venta_efectivo'
        await supabase.rpc('br_actualizar_totales_turno', {
          p_turno_id:   caja_id,
          p_monto:      total,
          p_tipo:       tipo_turno,
          p_num_ventas: 1,
        }) // error silencioso — no bloquear la venta
      }
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

    // ¿Queda algo pendiente? (algún ítem no seleccionado, o seleccionado solo en parte)
    const quedaPendiente = pendientes.some(p => {
      const s = seleccion.find(x => x.item.id === p.id)
      return !s || !s.completa
    })

    if (quedaPendiente) {
      // Mesa sigue abierta: total = lo que falta por cobrar
      const { total: totalPendiente } = await recalcularTotalOrden(orden.id)
      return res.json({ venta, orden_id: orden.id, mesa_liberada: false, total_pendiente: totalPendiente })
    }

    // Nada pendiente: cerrar orden + liberar mesa + marcar leídas sus notificaciones
    await cerrarOrdenCobrada(orden.id, mesaId)

    res.json({ venta, orden_id: orden.id, mesa_liberada: true, total_pendiente: 0 })
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/trasladar ────────────────────────────────
// Cambia el pedido abierto de la mesa :id a otra mesa LIBRE (el cliente se cambia de
// mesa). Solo cambia br_ordenes_mesa.mesa_id y los estados de las 2 mesas: ítems (enviado/
// visto/servido/cobrado), mesero, total y fechas no se tocan, así que no se reimprime ni
// se repite nada en comandas. Cualquier usuario con acceso a Mesas puede hacerlo.
// No hay transacciones en supabase-js ni índice único de 1 orden abierta por mesa, así
// que el destino se reserva con una actualización condicional (estado='libre') y, si el
// paso siguiente falla, se revierte.
const trasladar = async (req, res, next) => {
  try {
    const origenId = req.params.id
    const { destino_id } = req.body
    if (!destino_id) return res.status(400).json({ error: 'Falta la mesa destino' })
    if (destino_id === origenId) return res.status(400).json({ error: 'Elige una mesa distinta a la actual' })

    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select('id').eq('mesa_id', origenId).eq('estado', 'abierta').maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Esta mesa no tiene un pedido abierto' })

    const { data: destino } = await supabase.from('br_mesas')
      .select('id, numero, nombre, estado, activa').eq('id', destino_id).maybeSingle()
    if (!destino || !destino.activa) return res.status(404).json({ error: 'Mesa destino no encontrada' })
    const nombreDestino = destino.nombre ? `${destino.numero} — ${destino.nombre}` : `${destino.numero}`
    if (destino.estado !== 'libre') {
      return res.status(409).json({ error: `La mesa ${nombreDestino} ya no está libre. Elige otra.` })
    }
    const { count: abiertasDestino } = await supabase.from('br_ordenes_mesa')
      .select('id', { count: 'exact', head: true })
      .eq('mesa_id', destino_id).eq('estado', 'abierta')
    if (abiertasDestino > 0) {
      return res.status(409).json({ error: `La mesa ${nombreDestino} ya tiene un pedido abierto. Elige otra.` })
    }

    // 1) Reservar el destino (solo si sigue libre)
    const { data: reservada } = await supabase.from('br_mesas')
      .update({ estado: 'ocupada' }).eq('id', destino_id).eq('estado', 'libre').select('id')
    if (!reservada?.length) {
      return res.status(409).json({ error: `La mesa ${nombreDestino} acaba de ocuparse. Elige otra.` })
    }

    // 2) Mover la orden (solo si sigue abierta y en la mesa de origen)
    const { data: movida, error: errMover } = await supabase.from('br_ordenes_mesa')
      .update({ mesa_id: destino_id, updated_at: new Date().toISOString() })
      .eq('id', orden.id).eq('mesa_id', origenId).eq('estado', 'abierta')
      .select('id')
    if (errMover || !movida?.length) {
      await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', destino_id)
      if (errMover) throw errMover
      return res.status(409).json({ error: 'El pedido cambió mientras se trasladaba. Actualiza e inténtalo de nuevo.' })
    }

    // 3) Liberar la mesa de origen
    await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', origenId)

    res.json({ ok: true, orden_id: orden.id, origen_id: origenId, destino_id })
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/cancelar-orden ───────────────────────────
// Solo puede cancelar quien tomó la mesa (br_meseros.usuario_id) o un admin —
// antes cualquier cajero autenticado podía cancelar la orden de cualquier mesa.
const ROLES_ADMIN_MESA = ['super_admin', 'admin', 'admin_berlin']
const cancelarOrden = async (req, res, next) => {
  try {
    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select('id, mesero:mesero_id(usuario_id, nombre)')
      .eq('mesa_id', req.params.id).eq('estado', 'abierta').maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa' })

    if (!ROLES_ADMIN_MESA.includes(req.user.rol) && orden.mesero?.usuario_id && orden.mesero.usuario_id !== req.user.id) {
      return res.status(403).json({
        error: `Solo ${orden.mesero?.nombre ?? 'quien tomó la mesa'} o un administrador pueden cancelar esta orden.`,
      })
    }

    // Con cobros parciales ya hechos no se puede cancelar: esas ventas quedarían
    // huérfanas de su orden. Hay que cobrar o quitar lo pendiente para cerrarla.
    const { count: yaCobrados } = await supabase.from('br_orden_mesa_items')
      .select('id', { count: 'exact', head: true })
      .eq('orden_id', orden.id).not('venta_id', 'is', null)
    if (yaCobrados > 0) {
      return res.status(400).json({
        error: 'Esta mesa ya tiene cobros parciales — no se puede cancelar. Cobra o quita los productos pendientes para cerrarla.',
      })
    }

    await supabase.from('br_ordenes_mesa').update({ estado: 'cancelada' }).eq('id', orden.id)
    await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', req.params.id)
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── POST /mesas/:id/enviar-pedido ────────────────────────────
// El mesero/cajero envía a las estaciones (Comandas) solo los ítems
// nuevos desde el último envío de esta mesa (enviado_at IS NULL).
// Ya no bloquea reenviar — cada tanda de productos se manda aparte.
const enviarPedido = async (req, res, next) => {
  try {
    const mesaId = req.params.id

    const { data: orden } = await supabase.from('br_ordenes_mesa')
      .select(`
        id, total,
        items:br_orden_mesa_items(id, cantidad, notas, enviado_at, producto:producto_id(nombre)),
        mesero:mesero_id(nombre),
        mesa:mesa_id(numero, nombre)
      `)
      .eq('mesa_id', mesaId)
      .eq('estado', 'abierta')
      .maybeSingle()
    if (!orden) return res.status(404).json({ error: 'Sin orden activa' })

    const nuevos = (orden.items || []).filter(i => !i.enviado_at)
    if (!nuevos.length) {
      return res.status(400).json({ error: 'No hay productos nuevos para enviar — ya se mandaron todos a las estaciones.' })
    }

    const ahora = new Date().toISOString()
    await supabase.from('br_orden_mesa_items')
      .update({ enviado_at: ahora })
      .in('id', nuevos.map(i => i.id))

    const mesa      = orden.mesa
    const mesero    = orden.mesero
    const mesaNom   = mesa?.nombre ? `${mesa.numero} — ${mesa.nombre}` : `Mesa ${mesa?.numero ?? ''}`

    const { error } = await supabase.from('br_notificaciones').insert({
      tipo:       'nueva_orden_mesa',
      titulo:     `🍽️ Pedido — ${mesaNom}`,
      mensaje:    `${mesero?.nombre ?? 'Mesero'} envió ${nuevos.length} producto${nuevos.length !== 1 ? 's' : ''} nuevo${nuevos.length !== 1 ? 's' : ''}`,
      datos:      { mesa_id: mesaId, orden_id: orden.id, mesa_numero: mesa?.numero },
      creada_por: req.user.id,
    })
    if (error) throw error

    res.json({ ok: true, enviados: nuevos.length })
  } catch (err) { next(err) }
}

// ── GET /comandas/pendientes ─────────────────────────────────
// Ítems ya enviados (enviado_at) y aún no servidos (servido_at IS NULL)
// de mesas con orden abierta, agrupados por mesa. Un ítem sigue visible
// aquí después de "Preparado" (visto_at) — recién desaparece cuando se
// marca "Servido" en la mesa, para que el cajero vea el flujo completo
// Pendiente → Preparado → Servido, no que el ítem se esfume. admin_berlin/
// super_admin ven todas las estaciones; un cajero solo ve la suya
// (br_empleados.estacion_id vinculado a su usuario_id).
const comandasPendientes = async (req, res, next) => {
  try {
    const ROLES_ADMIN = ['super_admin', 'admin', 'admin_berlin']
    let estacionId = null

    if (!ROLES_ADMIN.includes(req.user.rol)) {
      const { data: emp } = await supabase.from('br_empleados')
        .select('estacion_id').eq('usuario_id', req.user.id).maybeSingle()
      if (!emp?.estacion_id) return res.json([]) // cajero sin estación asignada: nada que mostrar
      estacionId = emp.estacion_id
    }

    const { data: ordenes, error } = await supabase.from('br_ordenes_mesa')
      .select(`
        id,
        mesa:mesa_id(id, numero, nombre),
        items:br_orden_mesa_items(
          id, cantidad, notas, enviado_at, visto_at, servido_at,
          producto:producto_id(nombre, categoria:categoria_id(id, estacion_id, estacion:estacion_id(id, nombre, color)))
        )
      `)
      .eq('estado', 'abierta')
    if (error) throw error

    const resultado = (ordenes || [])
      .map(o => ({
        orden_id: o.id,
        mesa:     o.mesa,
        items: (o.items || [])
          .filter(i => i.enviado_at && !i.servido_at)
          .filter(i => !estacionId || i.producto?.categoria?.estacion_id === estacionId)
          .map(i => ({
            id: i.id, cantidad: i.cantidad, notas: i.notas, enviado_at: i.enviado_at,
            visto_at: i.visto_at, servido_at: i.servido_at,
            nombre: i.producto?.nombre ?? 'Producto',
            estacion: i.producto?.categoria?.estacion ?? null,
          })),
      }))
      .filter(o => o.items.length > 0)

    res.set('Cache-Control', 'no-store')
    res.json(resultado)
  } catch (err) { next(err) }
}

// ── PATCH /comandas/items/:itemId/visto ──────────────────────
const marcarVistoItem = async (req, res, next) => {
  try {
    const { error } = await supabase.from('br_orden_mesa_items')
      .update({ visto_at: new Date().toISOString() })
      .eq('id', req.params.itemId)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── PATCH /comandas/mesas/:ordenId/visto ─────────────────────
// Marca de una vez todos los ítems pendientes de esa orden (por
// estación del usuario que marca, o todos si es admin).
const marcarVistoMesa = async (req, res, next) => {
  try {
    const ROLES_ADMIN = ['super_admin', 'admin', 'admin_berlin']
    let estacionId = null
    if (!ROLES_ADMIN.includes(req.user.rol)) {
      const { data: emp } = await supabase.from('br_empleados')
        .select('estacion_id').eq('usuario_id', req.user.id).maybeSingle()
      estacionId = emp?.estacion_id ?? null
    }

    const { data: items } = await supabase.from('br_orden_mesa_items')
      .select('id, producto:producto_id(categoria:categoria_id(estacion_id))')
      .eq('orden_id', req.params.ordenId)
      .not('enviado_at', 'is', null)
      .is('visto_at', null)

    const idsAMarcar = (items || [])
      .filter(i => !estacionId || i.producto?.categoria?.estacion_id === estacionId)
      .map(i => i.id)
    if (!idsAMarcar.length) return res.json({ ok: true, marcados: 0 })

    await supabase.from('br_orden_mesa_items')
      .update({ visto_at: new Date().toISOString() })
      .in('id', idsAMarcar)

    res.json({ ok: true, marcados: idsAMarcar.length })
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

module.exports = {
  listar, crear, actualizar, eliminar, abrirMesa, tomarMesa, obtenerOrden,
  agregarItem, actualizarItem, eliminarItem, cobrar, trasladar, cancelarOrden, enviarPedido,
  comandasPendientes, marcarVistoItem, marcarVistoMesa, marcarServidoItem,
}
