import type { Orden, Mesa } from './MesasPage'
import type { OpMesa } from './useOutboxMesas'

// Superpone las operaciones pendientes de sincronizar (outbox) al dato que trajo el servidor, para
// que la pantalla muestre SIEMPRE el estado real de la cuenta aunque aún no se haya enviado.
//
// Es una función pura y IDEMPOTENTE: aplicar una operación cuyo efecto ya llegó del servidor no
// cambia nada (los agregados se identifican por id, la cantidad es absoluta, quitar y enviar se
// repiten sin efecto). Por eso da igual si el dato del servidor ya la incluye o todavía no.
export function ordenConOps(base: Orden | null | undefined, ops: OpMesa[]): Orden | null {
  if (!ops.length) return base ?? null

  let o: Orden | null = base ? { ...base, items: base.items.map(i => ({ ...i })) } : null

  for (const op of ops) {
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
          const ids = new Set(op.item_ids ?? [])
          const hora = new Date(op.ts).toISOString()
          for (const i of o.items) if (ids.has(i.id) && !i.enviado_at && !i.venta_id) i.enviado_at = hora
        }
        break
    }
  }

  // El total de una cuenta abierta es lo PENDIENTE de cobro (ítems sin venta_id)
  if (o) o.total = o.items.filter(i => !i.venta_id).reduce((s, i) => s + Number(i.subtotal), 0)
  return o
}

// La mesa tal como se ve con sus operaciones pendientes: tomar una mesa libre la deja ocupada
// (aunque el servidor todavía no lo sepa) y los productos agregados ya cuentan.
export function mesaConOps(mesa: Mesa, ops: OpMesa[]): Mesa {
  const propias = ops.filter(o => o.mesa_id === mesa.id)
  if (!propias.length) return mesa
  const orden = ordenConOps(mesa.orden_activa, propias)
  if (!orden) return mesa
  return { ...mesa, estado: 'ocupada', orden_activa: orden }
}
