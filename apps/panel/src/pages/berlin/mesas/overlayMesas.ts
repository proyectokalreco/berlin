import type { Orden, Mesa } from './MesasPage'
import type { OpMesa } from './useOutboxMesas'

// Superpone las operaciones pendientes de sincronizar (outbox) al dato que trajo el servidor, para
// que la pantalla muestre SIEMPRE el estado real de la cuenta aunque aún no se haya enviado.
//
// Son funciones puras e IDEMPOTENTES: aplicar una operación cuyo efecto ya llegó del servidor no
// cambia nada (los agregados se identifican por id, la cantidad y "servido" son valores absolutos,
// quitar / enviar / cancelar se repiten sin efecto). Por eso da igual si el dato del servidor ya la
// incluye o todavía no.

// Aplica UNA operación de contenido (tomar, agregar, cantidad, quitar, enviar, servido) a una
// cuenta. Cancelar y trasladar mueven la cuenta entre mesas: se resuelven en tableroConOps.
function aplicarAOrden(o: Orden | null, op: OpMesa): Orden | null {
  switch (op.tipo) {
    case 'tomar':
      if (!o) {
        o = {
          id: op.orden_id, total: 0, estado: 'abierta',
          created_at: new Date(op.ts).toISOString(),
          mesero: op.mesero, items: [],
        }
      }
      break

    case 'agregar': {
      if (!o || o.items.some(i => i.id === op.item_id)) break
      const cant = Number(op.cantidad)
      const pu   = Number(op.precio_unitario)
      o.items.push({
        id: op.item_id!, cantidad: cant, precio_unitario: pu, subtotal: pu * cant,
        notas: op.notas ?? undefined,
        enviado_at: null, servido_at: null, venta_id: null, pagado_at: null,
        producto: op.producto,
      })
      break
    }

    case 'cantidad': {
      const it = o?.items.find(i => i.id === op.item_id)
      if (!it || it.venta_id) break
      it.cantidad = Number(op.cantidad_final)
      it.subtotal = Number(it.precio_unitario) * it.cantidad
      break
    }

    case 'quitar':
      if (o) o.items = o.items.filter(i => i.id !== op.item_id || !!i.venta_id)
      break

    case 'enviar':
      if (o) {
        const ids  = new Set(op.item_ids ?? [])
        const hora = new Date(op.ts).toISOString()
        for (const i of o.items) if (ids.has(i.id) && !i.enviado_at && !i.venta_id) i.enviado_at = hora
      }
      break

    case 'servido': {
      const it = o?.items.find(i => i.id === op.item_id)
      if (it && !it.venta_id) it.servido_at = op.servido ? new Date(op.ts).toISOString() : null
      break
    }
  }
  return o
}

export function ordenConOps(base: Orden | null | undefined, ops: OpMesa[]): Orden | null {
  if (!ops.length) return base ?? null

  let o: Orden | null = base ? { ...base, items: base.items.map(i => ({ ...i })) } : null
  for (const op of ops) o = aplicarAOrden(o, op)

  // El total de una cuenta abierta es lo PENDIENTE de cobro (ítems sin venta_id)
  if (o) o.total = o.items.filter(i => !i.venta_id).reduce((s, i) => s + Number(i.subtotal), 0)
  return o
}

// La cuenta de UNA mesa tal como se ve: `base` (lo que dice el servidor, o el tablero) más las
// operaciones de esa cuenta. Si se canceló localmente, ya no hay cuenta. Si la mesa se acaba de
// tomar sin conexión (no hay base), la cuenta nace de la operación "tomar".
export function ordenParaMesa(base: Orden | null | undefined, ops: OpMesa[], mesaId: string): Orden | null {
  const tomar = base ? undefined : ops.find(o => o.tipo === 'tomar' && o.mesa_id === mesaId)
  const id = base?.id ?? tomar?.orden_id
  if (!id) return null
  const propias = ops.filter(o => o.orden_id === id)
  if (propias.some(o => o.tipo === 'cancelar')) return null
  return ordenConOps(base ?? null, propias)
}

// El tablero de mesas con las operaciones pendientes: tomar una mesa libre la deja ocupada aunque el
// servidor aún no lo sepa, los productos agregados ya cuentan, una cuenta cancelada libera su mesa y
// una trasladada cambia de mesa. Las operaciones se aplican EN ORDEN.
export function tableroConOps(mesas: Mesa[], ops: OpMesa[]): Mesa[] {
  if (!ops.length) return mesas
  const porId = new Map<string, Mesa>(mesas.map(m => [m.id, { ...m }]))

  // Mesa que tiene la cuenta de la operación. Si su id no aparece (la cuenta ya existía en el
  // servidor con otro id porque otro equipo tomó la mesa primero → se fusionan), la de esa mesa.
  const mesaDeCuenta = (op: OpMesa): Mesa | undefined => {
    const propia = [...porId.values()].find(m => m.orden_activa?.id === op.orden_id)
    if (propia) return propia
    const porMesa = porId.get(op.mesa_id)
    return porMesa?.orden_activa ? porMesa : undefined
  }

  for (const op of ops) {
    if (op.tipo === 'tomar') {
      const m = porId.get(op.mesa_id)
      if (!m || m.orden_activa) continue
      const o = ordenConOps(null, [op])
      if (o) { m.estado = 'ocupada'; m.orden_activa = o }
      continue
    }
    const origen = mesaDeCuenta(op)
    if (!origen?.orden_activa) continue

    if (op.tipo === 'cancelar') {
      origen.estado = 'libre'; origen.orden_activa = null
    } else if (op.tipo === 'trasladar') {
      const destino = porId.get(op.destino_id ?? '')
      if (!destino || destino.orden_activa || destino.id === origen.id) continue
      destino.estado = 'ocupada'; destino.orden_activa = origen.orden_activa
      origen.estado = 'libre';    origen.orden_activa = null
    } else {
      origen.orden_activa = ordenConOps(origen.orden_activa, [op])
    }
  }
  return mesas.map(m => porId.get(m.id)!)
}
