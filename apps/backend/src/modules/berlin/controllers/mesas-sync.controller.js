// ============================================================
// mesas-sync.controller.js
// Sincroniza en lote las operaciones de Mesas hechas SIN conexión
// (POST /berlin/mesas/sync): tomar mesa, agregar / quitar / cambiar
// cantidad de productos, enviar el pedido a las estaciones, marcar
// servido, cancelar la cuenta y trasladarla a otra mesa.
//
// Reglas (acordadas con el cliente, 2026-09-20):
//  · Cada operación trae un op_id generado en el equipo. Se reserva en
//    br_ops_log ANTES de aplicarla: reenviarla no la aplica dos veces.
//  · Si la mesa ya estaba abierta por otro equipo, la cuenta se FUSIONA
//    en la existente (no se pierde ningún pedido) y se avisa.
//  · El precio es el que vio el cliente (viene en la operación); si difiere
//    del actual se avisa, pero se respeta.
//  · La hora es la real del pedido (la del equipo), acotada a que nunca sea
//    posterior a la del servidor.
//  · No se exige caja abierta: el pedido ya ocurrió.
// ============================================================
const supabase = require('../../../config/supabase')
const {
  recalcularTotalOrden, cerrarOrdenCobrada, obtenerOCrearMesero, resolverOrdenId,
} = require('./mesas.controller')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS = ['tomar', 'agregar', 'cantidad', 'quitar', 'enviar', 'servido', 'cancelar', 'trasladar']
const ROLES_ADMIN_MESA = ['super_admin', 'admin', 'admin_berlin']
const MAX_OPS = 200
const MAX_ANTIGUEDAD_MS = 7 * 24 * 60 * 60 * 1000

// Hora del equipo, sin pasarse de la del servidor ni de una semana atrás
const horaReal = (ts) => {
  const ahora = Date.now()
  const t = Number(ts)
  const v = Number.isFinite(t) ? Math.min(t, ahora) : ahora
  return new Date(Math.max(v, ahora - MAX_ANTIGUEDAD_MS)).toISOString()
}

const ok       = (op, extra = {}) => ({ op_id: op.op_id, estado: 'ok', ...extra })
const conflicto = (op, mensaje)   => ({ op_id: op.op_id, estado: 'conflicto', mensaje })

// Orden abierta a la que apunta la operación (resolviendo fusiones)
const ordenDeOp = async (op) => {
  const ordenId = await resolverOrdenId(op.orden_id)
  const { data: orden } = await supabase.from('br_ordenes_mesa')
    .select('id, estado, mesa_id').eq('id', ordenId).maybeSingle()
  return orden || null
}

const aplicarTomar = async (op, user) => {
  // Reintento tras una aplicación parcial: la orden con ese id ya existe
  const { data: propia } = await supabase.from('br_ordenes_mesa')
    .select('id').eq('id', op.orden_id).maybeSingle()
  if (propia) return ok(op, { orden_real_id: propia.id })

  const { data: mesa } = await supabase.from('br_mesas')
    .select('id, estado').eq('id', op.mesa_id).maybeSingle()
  if (!mesa) return conflicto(op, 'La mesa ya no existe')

  const { data: abierta } = await supabase.from('br_ordenes_mesa')
    .select('id, mesero:mesero_id(nombre)')
    .eq('mesa_id', op.mesa_id).eq('estado', 'abierta')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()

  if (abierta) {
    // FUSIÓN: la mesa ya la tenía otro equipo — los productos de este se suman a esa cuenta
    await supabase.from('br_ops_log')
      .update({ orden_real_id: abierta.id }).eq('op_id', op.op_id)
    return ok(op, {
      orden_real_id: abierta.id,
      fusionada: true,
      aviso: `La mesa ya estaba abierta por ${abierta.mesero?.nombre ?? 'otro mesero'}: `
           + 'tus productos se sumaron a esa cuenta.',
    })
  }

  const mesero = await obtenerOCrearMesero(user)
  const { error } = await supabase.from('br_ordenes_mesa').insert({
    id: op.orden_id, mesa_id: op.mesa_id, mesero_id: mesero.id,
    estado: 'abierta', created_at: horaReal(op.ts),
  })
  if (error) throw error
  await supabase.from('br_mesas').update({ estado: 'ocupada' }).eq('id', op.mesa_id)
  await supabase.from('br_ops_log').update({ orden_real_id: op.orden_id }).eq('op_id', op.op_id)
  return ok(op, { orden_real_id: op.orden_id })
}

const aplicarAgregar = async (op) => {
  const orden = await ordenDeOp(op)
  if (!orden) return conflicto(op, 'La cuenta de la mesa ya no existe — el producto no se agregó')
  if (orden.estado !== 'abierta') return conflicto(op, 'La cuenta ya fue cobrada o cancelada — el producto no se agregó')

  if (!UUID_RE.test(String(op.item_id || '')) || !UUID_RE.test(String(op.producto_id || ''))) {
    return conflicto(op, 'Operación inválida')
  }
  const cantidad = Number(op.cantidad)
  const precio   = Number(op.precio_unitario)
  if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(precio) || precio < 0) {
    return conflicto(op, 'Cantidad o precio inválido')
  }

  const { data: prod } = await supabase.from('br_productos')
    .select('id, nombre, precio_venta').eq('id', op.producto_id).maybeSingle()
  if (!prod) return conflicto(op, 'El producto ya no existe')

  const { data: yaEsta } = await supabase.from('br_orden_mesa_items')
    .select('id').eq('id', op.item_id).maybeSingle()
  if (yaEsta) return ok(op)   // reintento: ya estaba

  const { error } = await supabase.from('br_orden_mesa_items').insert({
    id: op.item_id, orden_id: orden.id, producto_id: op.producto_id,
    cantidad, precio_unitario: precio, subtotal: precio * cantidad,
    notas: op.notas ? String(op.notas).trim().slice(0, 300) || null : null,
    created_at: horaReal(op.ts),
  })
  if (error) throw error
  await recalcularTotalOrden(orden.id)

  // El precio se respeta (es el que vio el cliente); si cambió, se avisa
  const actual = Number(prod.precio_venta)
  const esVentaLibre = actual === 1 && String(prod.nombre).toLowerCase().includes('venta libre')
  if (!esVentaLibre && Math.abs(actual - precio) > 0.009) {
    return ok(op, { aviso: `${prod.nombre}: se cobró a $${precio} (el precio actual es $${actual}).` })
  }
  return ok(op)
}

const aplicarCantidad = async (op) => {
  const orden = await ordenDeOp(op)
  if (!orden) return conflicto(op, 'La cuenta de la mesa ya no existe — el cambio de cantidad no se aplicó')
  if (orden.estado !== 'abierta') return conflicto(op, 'La cuenta ya fue cobrada o cancelada — el cambio de cantidad no se aplicó')

  const delta = Number(op.delta)
  if (!Number.isFinite(delta) || delta === 0) return conflicto(op, 'Cantidad inválida')

  const { data: item } = await supabase.from('br_orden_mesa_items')
    .select('id, cantidad, precio_unitario, venta_id').eq('id', op.item_id).eq('orden_id', orden.id).maybeSingle()
  if (!item) return conflicto(op, 'Ese producto ya no está en la cuenta (otro equipo lo quitó o ya se cobró)')
  if (item.venta_id) return conflicto(op, 'Ese producto ya fue cobrado — no se puede modificar')

  // Cambio relativo: se suma a lo que haya (otro equipo pudo haber cambiado la línea también)
  const nueva = Number(item.cantidad) + delta
  if (nueva <= 0) {
    await supabase.from('br_orden_mesa_items').delete().eq('id', item.id)
    const { pendientes, pagados } = await recalcularTotalOrden(orden.id)
    if (pendientes === 0 && pagados > 0) { await cerrarOrdenCobrada(orden.id, orden.mesa_id); return ok(op, { orden_cerrada: true }) }
    return ok(op)
  }
  await supabase.from('br_orden_mesa_items')
    .update({ cantidad: nueva, subtotal: Number(item.precio_unitario) * nueva }).eq('id', item.id)
  await recalcularTotalOrden(orden.id)
  return ok(op)
}

const aplicarQuitar = async (op) => {
  const orden = await ordenDeOp(op)
  if (!orden || orden.estado !== 'abierta') return ok(op)   // la cuenta ya no está abierta: nada que quitar

  const { data: item } = await supabase.from('br_orden_mesa_items')
    .select('id, venta_id').eq('id', op.item_id).eq('orden_id', orden.id).maybeSingle()
  if (!item) return ok(op)   // ya no estaba
  if (item.venta_id) return conflicto(op, 'Ese producto ya fue cobrado — no se puede quitar')

  await supabase.from('br_orden_mesa_items').delete().eq('id', item.id)
  const { pendientes, pagados } = await recalcularTotalOrden(orden.id)
  if (pendientes === 0 && pagados > 0) { await cerrarOrdenCobrada(orden.id, orden.mesa_id); return ok(op, { orden_cerrada: true }) }
  return ok(op)
}

const aplicarEnviar = async (op, user) => {
  const orden = await ordenDeOp(op)
  if (!orden) return conflicto(op, 'La cuenta de la mesa ya no existe — el pedido no se envió a cocina')
  if (orden.estado !== 'abierta') return conflicto(op, 'La cuenta ya fue cobrada o cancelada — el pedido no se envió a cocina')

  const ids = (Array.isArray(op.item_ids) ? op.item_ids : []).filter(id => UUID_RE.test(String(id)))
  if (!ids.length) return ok(op)

  // Solo lo que aún no se envió (si otro equipo ya lo mandó, no se repite en cocina)
  const { data: nuevos } = await supabase.from('br_orden_mesa_items')
    .select('id').eq('orden_id', orden.id).in('id', ids).is('enviado_at', null).is('venta_id', null)
  if (!nuevos?.length) return ok(op)

  await supabase.from('br_orden_mesa_items')
    .update({ enviado_at: horaReal(op.ts) }).in('id', nuevos.map(i => i.id))

  const { data: info } = await supabase.from('br_ordenes_mesa')
    .select('id, mesero:mesero_id(nombre), mesa:mesa_id(numero, nombre)').eq('id', orden.id).maybeSingle()
  const mesaNom = info?.mesa?.nombre ? `${info.mesa.numero} — ${info.mesa.nombre}` : `Mesa ${info?.mesa?.numero ?? ''}`
  const n = nuevos.length
  const { error } = await supabase.from('br_notificaciones').insert({
    tipo:       'nueva_orden_mesa',
    titulo:     `🍽️ Pedido — ${mesaNom}`,
    mensaje:    `${info?.mesero?.nombre ?? 'Mesero'} envió ${n} producto${n !== 1 ? 's' : ''} nuevo${n !== 1 ? 's' : ''}`,
    datos:      { mesa_id: orden.mesa_id, orden_id: orden.id, mesa_numero: info?.mesa?.numero },
    creada_por: user.id,
  })
  if (error) throw error
  return ok(op)
}

// Marca / desmarca "servido al cliente". Es un valor ABSOLUTO (no un cambio de estado): repetirlo
// deja lo mismo.
const aplicarServido = async (op) => {
  const orden = await ordenDeOp(op)
  if (!orden || orden.estado !== 'abierta') return conflicto(op, 'La cuenta ya no está abierta — no se marcó como servido')
  const { data: item } = await supabase.from('br_orden_mesa_items')
    .select('id, venta_id').eq('id', op.item_id).eq('orden_id', orden.id).maybeSingle()
  if (!item) return conflicto(op, 'Ese producto ya no está en la cuenta')
  if (item.venta_id) return conflicto(op, 'Ese producto ya fue cobrado')
  const { error } = await supabase.from('br_orden_mesa_items')
    .update({ servido_at: op.servido ? horaReal(op.ts) : null }).eq('id', item.id)
  if (error) throw error
  return ok(op)
}

// Cancela la cuenta y libera la mesa. Mismas reglas que POST /mesas/:id/cancelar-orden: solo quien
// tomó la mesa o un administrador, y nunca con cobros parciales ya hechos.
const aplicarCancelar = async (op, user) => {
  const ordenId = await resolverOrdenId(op.orden_id)
  const { data: orden } = await supabase.from('br_ordenes_mesa')
    .select('id, estado, mesa_id, mesero:mesero_id(usuario_id, nombre)').eq('id', ordenId).maybeSingle()
  if (!orden || orden.estado === 'cancelada') return ok(op)   // ya no está
  if (orden.estado !== 'abierta') return conflicto(op, 'La cuenta ya fue cobrada — no se puede cancelar')

  if (!ROLES_ADMIN_MESA.includes(user.rol) && orden.mesero?.usuario_id && orden.mesero.usuario_id !== user.id) {
    return conflicto(op, `Solo ${orden.mesero?.nombre ?? 'quien tomó la mesa'} o un administrador pueden cancelar esta cuenta`)
  }
  const { count: yaCobrados } = await supabase.from('br_orden_mesa_items')
    .select('id', { count: 'exact', head: true }).eq('orden_id', orden.id).not('venta_id', 'is', null)
  if (yaCobrados > 0) return conflicto(op, 'La cuenta ya tiene cobros parciales — no se puede cancelar')

  await supabase.from('br_ordenes_mesa').update({ estado: 'cancelada' }).eq('id', orden.id)
  await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', orden.mesa_id)
  return ok(op)
}

// Pasa la cuenta a otra mesa libre. Mismas reglas que POST /mesas/:id/trasladar.
const aplicarTrasladar = async (op) => {
  const orden = await ordenDeOp(op)
  if (!orden || orden.estado !== 'abierta') return conflicto(op, 'La cuenta ya no está abierta — no se trasladó')
  if (orden.mesa_id === op.destino_id) return ok(op)   // ya estaba en la mesa destino
  if (!UUID_RE.test(String(op.destino_id || ''))) return conflicto(op, 'Mesa destino inválida')

  const { data: destino } = await supabase.from('br_mesas')
    .select('id, numero, nombre, estado, activa').eq('id', op.destino_id).maybeSingle()
  if (!destino || destino.activa === false) return conflicto(op, 'La mesa destino ya no existe')
  const nombreDestino = destino.nombre ? `${destino.numero} — ${destino.nombre}` : `${destino.numero}`
  if (destino.estado !== 'libre') return conflicto(op, `La mesa ${nombreDestino} ya no está libre — la cuenta se quedó en su mesa`)
  const { count: abiertasDestino } = await supabase.from('br_ordenes_mesa')
    .select('id', { count: 'exact', head: true }).eq('mesa_id', op.destino_id).eq('estado', 'abierta')
  if (abiertasDestino > 0) return conflicto(op, `La mesa ${nombreDestino} ya tiene una cuenta abierta — la cuenta se quedó en su mesa`)

  const origenId = orden.mesa_id
  // 1) reservar el destino (solo si sigue libre)
  const { data: reservada } = await supabase.from('br_mesas')
    .update({ estado: 'ocupada' }).eq('id', op.destino_id).eq('estado', 'libre').select('id')
  if (!reservada?.length) return conflicto(op, `La mesa ${nombreDestino} acaba de ocuparse — la cuenta se quedó en su mesa`)
  // 2) mover la cuenta (solo si sigue abierta y en su mesa)
  const { data: movida, error } = await supabase.from('br_ordenes_mesa')
    .update({ mesa_id: op.destino_id, updated_at: new Date().toISOString() })
    .eq('id', orden.id).eq('mesa_id', origenId).eq('estado', 'abierta').select('id')
  if (error || !movida?.length) {
    await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', op.destino_id)
    if (error) throw error
    return conflicto(op, 'La cuenta cambió mientras se trasladaba — inténtalo de nuevo')
  }
  // 3) liberar la mesa de origen
  await supabase.from('br_mesas').update({ estado: 'libre' }).eq('id', origenId)
  return ok(op)
}

const APLICADORES = {
  tomar: aplicarTomar, agregar: aplicarAgregar, cantidad: aplicarCantidad,
  quitar: aplicarQuitar, enviar: aplicarEnviar,
  servido: aplicarServido, cancelar: aplicarCancelar, trasladar: aplicarTrasladar,
}

// Reserva el op_id (si ya estaba, es un reintento: ya se aplicó)
const reservarOp = async (op, user) => {
  const { error } = await supabase.from('br_ops_log').insert({
    op_id: op.op_id, tipo: op.tipo, orden_id: UUID_RE.test(String(op.orden_id || '')) ? op.orden_id : null,
    usuario_id: user.id, client_ts: horaReal(op.ts),
  })
  if (!error) return 'nueva'
  if (error.code === '23505') return 'repetida'
  throw error
}

// ── POST /mesas/sync ──────────────────────────────────────────
const sync = async (req, res, next) => {
  try {
    const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, MAX_OPS) : null
    if (!ops) return res.status(400).json({ error: 'Se esperaba una lista de operaciones (ops)' })

    const resultados = []
    for (const op of ops) {
      if (!op || !UUID_RE.test(String(op.op_id || '')) || !TIPOS.includes(op.tipo)) {
        resultados.push({ op_id: op?.op_id ?? null, estado: 'conflicto', mensaje: 'Operación inválida' })
        continue
      }
      try {
        const reserva = await reservarOp(op, req.user)
        if (reserva === 'repetida') { resultados.push(ok(op, { repetida: true })); continue }

        const r = await APLICADORES[op.tipo](op, req.user)
        // Solo las aplicadas quedan registradas: un conflicto se puede reintentar más tarde
        if (r.estado !== 'ok') await supabase.from('br_ops_log').delete().eq('op_id', op.op_id)
        resultados.push(r)
      } catch (err) {
        // Fallo inesperado (base de datos, red interna): se libera la reserva, el equipo la
        // conserva y la reintenta; no se procesan las siguientes para no desordenar la cuenta.
        console.error(`[mesas/sync] op ${op.op_id} (${op.tipo}):`, err?.message || err)
        await supabase.from('br_ops_log').delete().eq('op_id', op.op_id)
        resultados.push({ op_id: op.op_id, estado: 'reintentar' })
        break
      }
    }
    res.json({ resultados })
  } catch (err) { next(err) }
}

module.exports = { sync }
