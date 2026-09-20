import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../../lib/api'
import {
  SYNC_TIMEOUT_MS, isTransientError, isAuthError, mensajeError, leerLocal, guardarLocal,
} from '../../../lib/offline'
import { EVT_CONEXION, hayInternet } from '../../../lib/conexion'

export type NetworkStatus = 'online' | 'offline' | 'syncing'

export interface QueuedSale {
  idempotency_key: string
  payload: {
    items: { producto_id: string; cantidad: number; precio_unitario: number; notas?: string }[]
    metodo_pago: string
    cliente_id?: string
    redondeo?: number
    idempotency_key: string
    monto_efectivo?: number
    monto_transferencia?: number
  }
  queued_at: number
  // Si el servidor la rechazó por algo que NO es la red (stock, caja cerrada, migración
  // pendiente, etc.) queda en la cola marcada con el motivo — nunca se descarta en silencio:
  // es una venta que el cajero ya cobró y hay que resolver a mano.
  error?: string
}

const STORAGE_KEY = 'pos_berlin_offline_queue'
const EVT_COLA    = 'br-pos-cola'
const EVT_SINC    = 'br-pos-venta-sincronizada'

// ── Estado compartido por toda la app ───────────────────────────────────────
// La cola vive a nivel de módulo (no dentro de un componente) para que pueda sincronizarse desde
// el shell aunque el cajero esté en otra pantalla (Caja, Mesas…), y para que POS y shell
// compartan el mismo candado y no envíen la misma venta dos veces a la vez.
let sincronizando = false
// Ventas cuyo envío está en curso en primer plano (el cajero acaba de cobrar). La sincronización
// en segundo plano las salta: solo el envío en curso decide su resultado. No se persiste: tras un
// cierre brusco el envío murió, así que al reabrir la venta se reenvía normalmente.
const enVuelo = new Set<string>()

export function cargarColaPos(): QueuedSale[] {
  return leerLocal<QueuedSale[]>(STORAGE_KEY, [])
}

function guardarColaPos(q: QueuedSale[]): void {
  guardarLocal(STORAGE_KEY, q)
  window.dispatchEvent(new Event(EVT_COLA))
}

// Escritura previa al envío (write-ahead): sobrevive a un cierre brusco durante el POST.
export function encolarVentaPos(sale: QueuedSale): boolean {
  const q = cargarColaPos()
  if (q.some(s => s.idempotency_key === sale.idempotency_key)) return true
  const ok = guardarLocal(STORAGE_KEY, [...q, sale])
  window.dispatchEvent(new Event(EVT_COLA))
  return ok
}

export function quitarVentaPos(key: string): void {
  guardarColaPos(cargarColaPos().filter(s => s.idempotency_key !== key))
}

export function marcarVentaEnVuelo(key: string, activa: boolean): void {
  if (activa) enVuelo.add(key); else enVuelo.delete(key)
  window.dispatchEvent(new Event(EVT_COLA))   // el aviso de "pendientes" no cuenta lo que está en vuelo
}

// Reenvía las ventas pendientes en orden. Se detiene ante un fallo pasajero (red, servidor
// reiniciando) o de sesión, dejando el resto intacto. Un rechazo real del servidor marca ESA venta
// con su motivo y sigue con las demás.
export async function sincronizarColaPos(): Promise<void> {
  if (sincronizando) return
  const pendientes = cargarColaPos().filter(s => !s.error && !enVuelo.has(s.idempotency_key))
  if (!pendientes.length) return

  sincronizando = true
  window.dispatchEvent(new Event(EVT_COLA))
  try {
    for (const item of pendientes) {
      if (enVuelo.has(item.idempotency_key)) continue
      enVuelo.add(item.idempotency_key)
      try {
        const res = await api.post('/berlin/ventas', item.payload, { timeout: SYNC_TIMEOUT_MS })
        quitarVentaPos(item.idempotency_key)
        const numero = (res.data as { numero_venta?: string })?.numero_venta ?? ''
        toast.success(`☁️ Venta sincronizada${numero ? `: ${numero}` : ''}`)
        window.dispatchEvent(new CustomEvent(EVT_SINC, { detail: res.data }))
      } catch (err) {
        if (isTransientError(err) || isAuthError(err)) break
        const msg = mensajeError(err, 'El servidor rechazó la venta')
        guardarColaPos(cargarColaPos().map(s =>
          s.idempotency_key === item.idempotency_key ? { ...s, error: msg } : s))
      } finally {
        enVuelo.delete(item.idempotency_key)
      }
    }
  } finally {
    sincronizando = false
    window.dispatchEvent(new Event(EVT_COLA))
  }
}

export function useOfflineQueue(onSaleSuccess: (data: unknown) => void) {
  const leerEstado = () =>
    sincronizando ? 'syncing' : hayInternet() ? 'online' : 'offline'
  const [status, setStatus] = useState<NetworkStatus>(leerEstado)
  const [queue,  setQueue]  = useState<QueuedSale[]>(cargarColaPos)

  useEffect(() => {
    const refrescar = () => { setQueue(cargarColaPos()); setStatus(leerEstado()) }
    const enSincronizada = (e: Event) => onSaleSuccess((e as CustomEvent).detail)

    window.addEventListener(EVT_COLA, refrescar)
    window.addEventListener(EVT_SINC, enSincronizada)
    window.addEventListener(EVT_CONEXION, refrescar)
    refrescar()
    return () => {
      window.removeEventListener(EVT_COLA, refrescar)
      window.removeEventListener(EVT_SINC, enSincronizada)
      window.removeEventListener(EVT_CONEXION, refrescar)
    }
  }, [onSaleSuccess])

  const syncNow = useCallback(() => { void sincronizarColaPos() }, [])

  // Reintentar una rechazada: quita la marca de error y vuelve a procesar
  const retry = useCallback((key: string) => {
    guardarColaPos(cargarColaPos().map(s => {
      if (s.idempotency_key !== key) return s
      const { error: _e, ...resto } = s
      void _e
      return resto
    }))
    void sincronizarColaPos()
  }, [])

  // Descartar una rechazada, tras revisarla (el cajero lo confirma en pantalla)
  const discard = useCallback((key: string) => quitarVentaPos(key), [])

  const failed = queue.filter(s => !!s.error)
  return {
    status,
    pendingCount: queue.filter(s => !s.error && !enVuelo.has(s.idempotency_key)).length,
    failedSales:  failed,
    enqueue:      encolarVentaPos,
    dequeue:      quitarVentaPos,
    markInFlight: marcarVentaEnVuelo,
    syncNow, retry, discard,
  }
}
