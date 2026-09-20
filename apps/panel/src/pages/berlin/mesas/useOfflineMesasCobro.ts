import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../../lib/api'

export type SyncStatus = 'idle' | 'syncing'

export interface QueuedCobro {
  idempotency_key: string
  mesa_id:         string
  mesa_numero:     number
  payload: {
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
  provisional?: string   // número del comprobante provisional impreso sin conexión
  // Si el servidor lo rechazó por algo que NO es la red (mesa ya cobrada, ítem ya cobrado,
  // etc.) queda en la cola marcado con el motivo — nunca se descarta en silencio: es plata
  // que el cajero ya recibió y hay que resolver a mano.
  error?: string
}

const STORAGE_KEY = 'mesas_berlin_offline_cobros'

function loadQueue(): QueuedCobro[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function saveQueue(q: QueuedCobro[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q))
}

function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; response?: unknown }
  return !e.response && (
    e.code === 'ERR_NETWORK' ||
    e.code === 'ECONNABORTED' ||
    e.message === 'Network Error' ||
    !!e.message?.includes('timeout')
  )
}

export function useOfflineMesasCobro(
  onCobroSync: (mesaId: string, data: unknown, cobro: QueuedCobro) => void | Promise<unknown>
) {
  const [queue,      setQueue]      = useState<QueuedCobro[]>(loadQueue)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const syncingRef                  = useRef(false)

  const updateQueue = useCallback((fn: (prev: QueuedCobro[]) => QueuedCobro[]) => {
    setQueue(prev => { const next = fn(prev); saveQueue(next); return next })
  }, [])

  const processQueue = useCallback(async () => {
    if (syncingRef.current) return
    // Solo los que aún no fallaron por una razón del servidor
    const pending = loadQueue().filter(c => !c.error)
    if (!pending.length) return

    syncingRef.current = true
    setSyncStatus('syncing')

    for (const item of pending) {
      try {
        const res = await api.post(`/berlin/mesas/${item.mesa_id}/cobrar`, item.payload)
        // Esperar a que la pantalla refresque la orden ANTES de sacarlo de la cola: mientras
        // esté en la cola sus unidades se restan de "pendiente" en pantalla; si se saca antes
        // de que llegue la orden actualizada, esas unidades reaparecerían como cobrables.
        await onCobroSync(item.mesa_id, res.data, item)
        updateQueue(prev => prev.filter(c => c.idempotency_key !== item.idempotency_key))
      } catch (err) {
        if (isNetworkError(err)) break   // sigue sin red: dejar el resto en cola, en orden
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          || 'El servidor rechazó el cobro'
        updateQueue(prev => prev.map(c =>
          c.idempotency_key === item.idempotency_key ? { ...c, error: msg } : c))
      }
    }

    syncingRef.current = false
    setSyncStatus('idle')
  }, [onCobroSync, updateQueue])

  useEffect(() => {
    const goOnline = () => { if (loadQueue().some(c => !c.error)) processQueue() }
    window.addEventListener('online', goOnline)
    return () => window.removeEventListener('online', goOnline)
  }, [processQueue])

  const enqueue = useCallback((cobro: QueuedCobro) => {
    updateQueue(prev => {
      const exists = prev.some(i => i.idempotency_key === cobro.idempotency_key)
      return exists ? prev : [...prev, cobro]
    })
  }, [updateQueue])

  const syncNow = useCallback(() => {
    if (navigator.onLine) processQueue()
  }, [processQueue])

  // Reintentar uno rechazado (quita la marca de error y vuelve a procesar)
  const retry = useCallback((key: string) => {
    updateQueue(prev => prev.map(c => {
      if (c.idempotency_key !== key) return c
      const { error: _e, ...rest } = c
      void _e
      return rest
    }))
    setTimeout(() => { if (navigator.onLine) processQueue() }, 0)
  }, [updateQueue, processQueue])

  // Descartar uno rechazado, tras revisarlo (el cajero lo confirma en pantalla)
  const discard = useCallback((key: string) => {
    updateQueue(prev => prev.filter(c => c.idempotency_key !== key))
  }, [updateQueue])

  const failed = queue.filter(c => !!c.error)
  return {
    pendingCount:  queue.length - failed.length,
    failedCobros:  failed,
    syncStatus,
    pendingCobros: queue,   // TODOS (incluye rechazados): sus unidades siguen reservadas en pantalla
    enqueue, syncNow, retry, discard,
  }
}
