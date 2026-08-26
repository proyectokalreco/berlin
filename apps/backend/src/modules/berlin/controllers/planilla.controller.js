// ============================================================
// planilla.controller.js
// Planilla de producción diaria.
// Al agregar/editar/eliminar ítems actualiza el stock de
// br_productos de forma inmediata mediante la función SQL
// ajustar_stock_producto() para garantizar atomicidad.
// ============================================================
const supabase = require('../../../config/supabase')

const SELECT_PLANILLA = `
  *,
  usuario:usuario_id(id, nombre, apellido),
  items:br_planilla_items(
    id, cantidad_producida, notas, numero_factura, precio_venta_unitario, created_at,
    producto:producto_id(id, nombre, imagen_url, stock_actual, unidad_venta, precio_venta),
    receta:receta_id(id, nombre, rendimiento)
  )
`

// ── GET /planilla/hoy ─────────────────────────────────────────
// Retorna la planilla abierta de hoy, o crea una nueva.
const obtenerOCrearHoy = async (req, res, next) => {
  try {
    const hoy = new Date().toISOString().split('T')[0]

    let { data: planilla, error } = await supabase
      .from('br_planillas')
      .select(SELECT_PLANILLA)
      .eq('fecha', hoy)
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (!planilla) {
      const { data: nueva, error: errCrear } = await supabase
        .from('br_planillas')
        .insert({ fecha: hoy, usuario_id: req.user.id })
        .select(SELECT_PLANILLA)
        .single()
      if (errCrear) throw errCrear
      planilla = nueva
    }

    res.json(planilla)
  } catch (err) { next(err) }
}

// ── GET /planilla/historial ───────────────────────────────────
const historial = async (req, res, next) => {
  try {
    const { limit = 30, offset = 0 } = req.query
    const { data, error } = await supabase
      .from('br_planillas')
      .select(`
        id, fecha, turno, estado, notas, created_at,
        usuario:usuario_id(id, nombre),
        items:br_planilla_items(
          id, cantidad_producida,
          producto:producto_id(id, nombre, imagen_url)
        )
      `)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (error) throw error
    res.json(data || [])
  } catch (err) { next(err) }
}

// ── POST /planilla/:id/items ──────────────────────────────────
// Agrega un ítem y actualiza el stock del producto inmediatamente.
const agregarItem = async (req, res, next) => {
  try {
    const { id: planillaId } = req.params
    const { producto_id, receta_id, cantidad_producida, notas, numero_factura, precio_venta_unitario } = req.body

    if (!producto_id) return res.status(400).json({ error: 'producto_id es requerido' })
    const qty = Number(cantidad_producida)
    if (!qty || qty <= 0) return res.status(400).json({ error: 'cantidad_producida debe ser mayor que 0' })

    // Verificar planilla abierta
    const { data: planilla } = await supabase
      .from('br_planillas').select('id, estado').eq('id', planillaId).maybeSingle()
    if (!planilla)              return res.status(404).json({ error: 'Planilla no encontrada' })
    if (planilla.estado === 'cerrada') return res.status(400).json({ error: 'La planilla está cerrada' })

    // Auto-generar número de factura si no viene del frontend
    let numFac = numero_factura?.trim() || null
    if (!numFac) {
      const hoy = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const { count } = await supabase
        .from('br_planilla_items')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0] + 'T00:00:00')
      const seq = String((count || 0) + 1).padStart(3, '0')
      numFac = `PROD-${hoy}-${seq}`
    }

    const pvu = parseFloat(precio_venta_unitario) || 0

    // Insertar ítem
    const { data: item, error: errItem } = await supabase
      .from('br_planilla_items')
      .insert({
        planilla_id: planillaId,
        producto_id,
        receta_id: receta_id || null,
        cantidad_producida: qty,
        notas: notas?.trim() || null,
        numero_factura: numFac,
        precio_venta_unitario: pvu,
      })
      .select(`
        id, cantidad_producida, notas, numero_factura, precio_venta_unitario, created_at,
        producto:producto_id(id, nombre, imagen_url, stock_actual, unidad_venta, precio_venta),
        receta:receta_id(id, nombre, rendimiento)
      `)
      .single()
    if (errItem) throw errItem

    // ✅ Actualizar stock inmediatamente (atómico vía función SQL)
    await supabase.rpc('br_ajustar_stock_producto', { p_id: producto_id, p_delta: qty })

    // Movimiento contable: ingreso de inventario por producción
    if (pvu > 0) {
      await supabase.from('br_movimientos_contables').insert({
        tipo:            'ingreso',
        categoria:       'produccion',
        concepto:        `Producción: ${numFac}`,
        monto:           qty * pvu,
        metodo_pago:     'efectivo',
        referencia_tipo: 'planilla_item',
        referencia_id:   item.id,
        registrado_por:  req.user.id,
      }).select().maybeSingle()
    }

    res.status(201).json(item)
  } catch (err) { next(err) }
}

// ── PUT /planilla/:id/items/:itemId ───────────────────────────
// Actualiza la cantidad y ajusta el delta de stock.
const actualizarItem = async (req, res, next) => {
  try {
    const { id: planillaId, itemId } = req.params
    const { cantidad_producida, notas, numero_factura, precio_venta_unitario } = req.body

    const qty = Number(cantidad_producida)
    if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'cantidad_producida inválida' })

    // Obtener cantidad anterior para calcular el delta
    const { data: anterior } = await supabase
      .from('br_planilla_items')
      .select('id, cantidad_producida, producto_id')
      .eq('id', itemId)
      .eq('planilla_id', planillaId)
      .maybeSingle()
    if (!anterior) return res.status(404).json({ error: 'Ítem no encontrado' })

    const delta = qty - Number(anterior.cantidad_producida)

    const { data: actualizado, error } = await supabase
      .from('br_planilla_items')
      .update({
        cantidad_producida: qty,
        notas: notas?.trim() ?? null,
        ...(numero_factura !== undefined && { numero_factura: numero_factura?.trim() || null }),
        ...(precio_venta_unitario !== undefined && { precio_venta_unitario: parseFloat(precio_venta_unitario) || 0 }),
      })
      .eq('id', itemId)
      .select(`
        id, cantidad_producida, notas, numero_factura, precio_venta_unitario, created_at,
        producto:producto_id(id, nombre, imagen_url, stock_actual, unidad_venta, precio_venta),
        receta:receta_id(id, nombre, rendimiento)
      `)
      .single()
    if (error) throw error

    // Ajustar stock por la diferencia (puede ser negativa si se redujo cantidad)
    if (delta !== 0) {
      await supabase.rpc('br_ajustar_stock_producto', { p_id: anterior.producto_id, p_delta: delta })
    }

    res.json(actualizado)
  } catch (err) { next(err) }
}

// ── DELETE /planilla/:id/items/:itemId ────────────────────────
// Elimina el ítem y revierte el stock.
const eliminarItem = async (req, res, next) => {
  try {
    const { id: planillaId, itemId } = req.params

    const { data: item } = await supabase
      .from('br_planilla_items')
      .select('id, cantidad_producida, producto_id')
      .eq('id', itemId)
      .eq('planilla_id', planillaId)
      .maybeSingle()
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' })

    await supabase.from('br_planilla_items').delete().eq('id', itemId)

    // Revertir stock (restar lo que se había sumado)
    if (Number(item.cantidad_producida) > 0) {
      await supabase.rpc('br_ajustar_stock_producto', {
        p_id:    item.producto_id,
        p_delta: -Number(item.cantidad_producida),
      })
    }

    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── Función interna: calcular consumo de insumos para un ítem ─
async function calcularConsumoInsumos(items) {
  // items: [{ receta_id, cantidad_producida }]
  // Retorna: { [insumo_id]: { nombre, consumo, stock_actual, unidad } }
  const consumos = {}

  for (const item of items) {
    if (!item.receta_id) continue
    const qty = Number(item.cantidad_producida)
    if (!qty) continue

    // Obtener rendimiento de la receta
    const { data: receta } = await supabase
      .from('br_recetas')
      .select('id, rendimiento')
      .eq('id', item.receta_id)
      .maybeSingle()
    if (!receta || !receta.rendimiento) continue

    const lotes = qty / receta.rendimiento

    // Obtener ingredientes
    const { data: ingredientes } = await supabase
      .from('br_receta_ingredientes')
      .select('insumo_id, cantidad, br_insumos:insumo_id(id, nombre, stock_actual, unidad_medida)')
      .eq('receta_id', item.receta_id)
      .eq('es_opcional', false)
    if (!ingredientes?.length) continue

    for (const ing of ingredientes) {
      const insumo = ing.br_insumos
      if (!insumo) continue
      const consumo = lotes * Number(ing.cantidad)
      if (!consumos[insumo.id]) {
        consumos[insumo.id] = {
          nombre:       insumo.nombre,
          stock_actual: Number(insumo.stock_actual),
          unidad:       insumo.unidad_medida,
          consumo:      0,
        }
      }
      consumos[insumo.id].consumo += consumo
    }
  }

  return consumos
}

// ── GET /planilla/:id/verificar-insumos ───────────────────────
// Devuelve qué insumos se consumirían y cuáles son insuficientes.
const verificarInsumos = async (req, res, next) => {
  try {
    const { data: planilla } = await supabase
      .from('br_planillas')
      .select('id, estado, items:br_planilla_items(receta_id, cantidad_producida)')
      .eq('id', req.params.id)
      .maybeSingle()
    if (!planilla) return res.status(404).json({ error: 'Planilla no encontrada' })
    if (planilla.estado === 'cerrada') return res.json({ ok: true, descuadres: [], consumos: [] })

    const consumos = await calcularConsumoInsumos(planilla.items ?? [])

    const lista = Object.entries(consumos).map(([id, d]) => ({
      insumo_id:    id,
      nombre:       d.nombre,
      stock_actual: d.stock_actual,
      consumo:      Math.round(d.consumo * 1000) / 1000,
      unidad:       d.unidad,
      suficiente:   d.stock_actual >= d.consumo,
      faltante:     Math.max(0, d.consumo - d.stock_actual),
    }))

    const descuadres = lista.filter(i => !i.suficiente)
    res.json({ ok: descuadres.length === 0, descuadres, consumos: lista })
  } catch (err) { next(err) }
}

// ── PATCH /planilla/:id/cerrar ────────────────────────────────
// Cierra la planilla y descuenta insumos según recetas usadas.
const cerrarPlanilla = async (req, res, next) => {
  try {
    const { notas } = req.body
    const { id } = req.params

    // Obtener planilla con ítems
    const { data: planilla } = await supabase
      .from('br_planillas')
      .select('id, estado, insumos_descontados, items:br_planilla_items(receta_id, cantidad_producida)')
      .eq('id', id)
      .maybeSingle()
    if (!planilla)                   return res.status(404).json({ error: 'Planilla no encontrada' })
    if (planilla.estado === 'cerrada') return res.status(400).json({ error: 'La planilla ya está cerrada' })

    // Descontar insumos (solo si no se ha hecho antes)
    const alertas = []
    if (!planilla.insumos_descontados) {
      const consumos = await calcularConsumoInsumos(planilla.items ?? [])
      for (const [insumoId, d] of Object.entries(consumos)) {
        if (d.stock_actual < d.consumo) {
          alertas.push({
            insumo_id: insumoId,
            nombre:    d.nombre,
            consumo:   d.consumo,
            stock:     d.stock_actual,
            faltante:  d.consumo - d.stock_actual,
          })
        }
        // Descontar incluso si hay descuadre (GREATEST(0,...) protege contra negativos)
        await supabase.rpc('br_ajustar_stock_insumo', {
          p_id:    insumoId,
          p_delta: -d.consumo,
        })
      }
    }

    // Cerrar planilla
    const updates = {
      estado:               'cerrada',
      insumos_descontados:  true,
      updated_at:           new Date().toISOString(),
    }
    if (notas !== undefined) updates.notas = notas

    const { data, error } = await supabase
      .from('br_planillas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    res.json({ planilla: data, alertas })
  } catch (err) { next(err) }
}

module.exports = { obtenerOCrearHoy, historial, agregarItem, actualizarItem, eliminarItem, verificarInsumos, cerrarPlanilla }
