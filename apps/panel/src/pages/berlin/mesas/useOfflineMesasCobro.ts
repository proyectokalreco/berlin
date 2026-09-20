import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../../lib/api'
import {
  SYNC_TIMEOUT_MS, isTransientError, isAuthError, mensajeError, leerLocal, guardarLocal,
} from '../../../lib/offline'
import { sincronizarOpsMesas, hayOpsPendientes } from './useOutboxMesas'

export type SyncStatus = 'idle' | 'syncing'

export interface QueuedCobro {
  idempotency_key: string
  mesa_id:         string
  mesa_numero:     number
  // Pedido al que pertenece el cobro. El servidor ubica la orden por este id, no por la mesa:
  // así el cobro sobrevive a un traslado de mesa hecho antes de sincronizar. Los cobros
  // guardados antes de esta versión no lo traen (se etiquetan al trasladar, ver tagOrden).
  orden_id?:       string
  payload: {
    orden_id?:       string
    metodo_pago:     string
    cliente_id?:     string
    caja_id?:        string
    redondeo?:       number
    idempotency_key: string
    monto_efectivo?:      number
    monto_transferencia?: number
    // Cobro parcial (dividir cuenta): solo esas unidades. Sin items = todo lo pendiente.
    items?:               { item_id: string; cantidad: number }[]
  }
  queued_at: number
  total?:       number   // monto del cobro (para mostrarlo en el aviso)
  provisional?: string   // número del comprobante provisional impreso sin conexión (solo si de verdad se imprimió)
  // Si el servidor lo rechazó por algo que NO es la red (mesa ya cobrada, ítem ya cobrado,
  // etc.) queda en la cola marcado con el motivo — nunca se descarta en silencio: es plata
  // que el cajero ya recibió y hay que resolver a mano.
  error?: string
}

const STORAGE_KEY = 'mesas_berlin_offline_cobros'
const EVT_COLA    = 'br-mesas-cola'

type ManejadorSync = (mesaId: string, data: unknown, cobro: QueuedCobro) => void | Promise<unknown>

// ── Estado compartido por toda la app ───────────────────────────────────────
// La cola vive a nivel de módulo para poder sincronizarse desde el shell aunque el cajero no
// esté en Mesas, y para que MesasPage y el shell compartan un único candado.
let sincronizando = false
// Cobros cuyo envío está en curso en primer plano: la sincronización en segundo plano los salta.
// No se persiste: tras un cierre brusco el envío murió y se reenvía normalmente.
const enVuelo = new Set<string>()
// Manejador de la pantalla de Mesas (refresca la orden antes de sacar el cobro de la cola).
// Solo existe mientras MesasPage está abierta.
let manejador: ManejadorSync | null = null

export function cargarColaCobros(): QueuedCobro[] {
  return leerLocal<QueuedCobro[]>(STORAGE_KEY, [])
}

function guardarColaCobros(q: QueuedCobro[]): void {
  guardarLocal(STORAGE_KEY, q)
  window.dispatchEvent(new Event(EVT_COLA))
}

// Escritura previa al envío (write-ahead): sobrevive a un cierre brusco durante el POST.
export function encolarCobro(cobro: QueuedCobro): boolean {
  const q = cargarColaCobros()
  if (q.some(c => c.idempotency_key === cobro.idempotency_key)) return true
  const ok = guardarLocal(STORAGE_KEY, [...q, cobro])
  window.dispatchEvent(new Event(EVT_COLA))
  return ok
}

export function quitarCobro(key: string): void {
  guardarColaCobros(cargarColaCobros().filter(c => c.idempotency_key !== key))
}

export function marcarCobroEnVuelo(key: string, activa: boolean): void {
  if (activa) enVuelo.add(key); else enVuelo.delete(key)
  window.dispatchEvent(new Event(EVT_COLA))
}

export function parchearCobro(key: string, patch: Partial<QueuedCobro>): void {
  guardarColaCobros(cargarColaCobros().map(c => c.idempotency_key === key ? { ...c, ...patch } : c))
}

// Reenvía los cobros pendientes en orden. Se detiene ante un fallo pasajero (red, servidor
// reiniciando) o de sesión, dejando el resto intacto. Un rechazo real del servidor marca ESE cobro
// con su motivo y sigue con los demás.
export async function sincronizarCobrosMesas(): Promise<void> {
  if (sincronizando) return
  if (!cargarColaCobros().some(c => !c.error && !enVuelo.has(c.idempotency_key))) return

  // Primero las operaciones de las cuentas (tomar, agregar…): un cobro guardado sin conexión se
  // refiere a productos que quizá solo existen en este equipo hasta que se sincronicen.
  await sincronizarOpsMesas()
  // Y un cobro espera a que no le quede nada pendiente a SU cuenta
  const pendientes = cargarColaCobros().filter(c => !c.error && !enVuelo.has(c.idempotency_key)
    && !hayOpsPendientes(c.orden_id ?? null, c.orden_id ? null : c.mesa_id))
  if (!pendientes.length) return

  sincronizando = true
  window.dispatchEvent(new Event(EVT_COLA))
  try {
    for (const item of pendientes) {
      if (enVuelo.has(item.idempotency_key)) continue
      enVuelo.add(item.idempotency_key)
      try {
        const res = await api.post(`/berlin/mesas/${item.mesa_id}/cobrar`, item.payload, { timeout: SYNC_TIMEOUT_MS })
        if (manejador) {
          // Esperar a que la pantalla refresque la orden ANTES de sacarlo de la cola: mientras
          // esté en la cola sus unidades se restan de "pendiente" en pantalla; si se saca antes
          // de que llegue la orden actualizada, esas unidades reaparecerían como cobrables.
          await manejador(item.mesa_id, res.data, item)
        } else {
          const num = (res.data as { venta?: { numero_venta?: string } })?.venta?.numero_venta ?? ''
          toast.success(`☁️ Mesa ${item.mesa_numero} sincronizada${num ? `: ${num}` : ''}`, { duration: 8000 })
        }
        quitarCobro(item.idempotency_key)
      } catch (err) {
        if (isTransientError(err) || isAuthError(err)) break
        const msg = mensajeError(err, 'El servidor rechazó el cobro')
        guardarColaCobros(cargarColaCobros().map(c =>
          c.idempotency_key === item.idempotency_key ? { ...c, error: msg } : c))
      } finally {
        enVuelo.delete(item.idempotency_key)
      }
    }
  } finally {
    sincronizando = false
    window.dispatchEvent(new Event(EVT_COLA))
  }
}

export function useOfflineMesasCobro(onCobroSync: ManejadorSync) {
  const [queue,      setQueue]      = useState<QueuedCobro[]>(cargarColaCobros)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(sincronizando ? 'syncing' : 'idle')

  // Mientras MesasPage está abierta, ella refresca la orden al sincronizar
  useEffect(() => {
    manejador = onCobroSync
    return () => { if (manejador === onCobroSync) manejador = null }
  }, [onCobroSync])

  useEffect(() => {
    const refrescar = () => { setQueue(cargarColaCobros()); setSyncStatus(sincronizando ? 'syncing' : 'idle') }
    window.addEventListener(EVT_COLA, refrescar)
    refrescar()
    return () => window.removeEventListener(EVT_COLA, refrescar)
  }, [])

  const syncNow = useCallback(() => { void sincronizarCobrosMesas() }, [])

  // Reintentar uno rechazado (quita la marca de error y vuelve a procesar)
  const retry = useCallback((key: string) => {
    guardarColaCobros(cargarColaCobros().map(c => {
      if (c.idempotency_key !== key) return c
      const { error: _e, ...rest } = c
      void _e
      return rest
    }))
    void sincronizarCobrosMesas()
  }, [])

  // Al trasladar un pedido de mesa: los cobros guardados de esa mesa que aún no traen
  // orden_id (versión anterior) lo reciben, para que se sincronicen contra el pedido y no
  // contra la mesa vieja (que ya quedó libre).
  const tagOrden = useCallback((mesaId: string, ordenId: string) => {
    guardarColaCobros(cargarColaCobros().map(c =>
      c.mesa_id === mesaId && !c.orden_id
        ? { ...c, orden_id: ordenId, payload: { ...c.payload, orden_id: ordenId } }
        : c))
  }, [])

  // Descartar uno rechazado, tras revisarlo (el cajero lo confirma en pantalla)
  const discard = useCallback((key: string) => quitarCobro(key), [])

  const failed = queue.filter(c => !!c.error)
  return {
    pendingCount:  queue.filter(c => !c.error && !enVuelo.has(c.idempotency_key)).length,
    failedCobros:  failed,
    syncStatus,
    pendingCobros: queue,   // TODOS (incluye rechazados y en vuelo): sus unidades siguen reservadas en pantalla
    enqueue: encolarCobro, dequeue: quitarCobro, markInFlight: marcarCobroEnVuelo, patch: parchearCobro,
    syncNow, retry, discard, tagOrden,
  }
}
