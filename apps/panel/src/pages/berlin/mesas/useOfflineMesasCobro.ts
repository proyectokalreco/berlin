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
  }
  queued_at: number
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
  onCobroSync: (mesaId: string, data: unknown) => void
) {
  const [queue,      setQueue]      = useState<QueuedCobro[]>(loadQueue)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const syncingRef                  = useRef(false)

  const updateQueue = useCallback((fn: (prev: QueuedCobro[]) => QueuedCobro[]) => {
    setQueue(prev => { const next = fn(prev); saveQueue(next); return next })
  }, [])

  const processQueue = useCallback(async () => {
    if (syncingRef.current) return
    const pending = loadQueue()
    if (!pending.length) return

    syncingRef.current = true
    setSyncStatus('syncing')

    const remaining: QueuedCobro[] = []
    for (const item of pending) {
      try {
        const res = await api.post(`/berlin/mesas/${item.mesa_id}/cobrar`, item.payload)
        onCobroSync(item.mesa_id, res.data)
      } catch (err) {
        if (isNetworkError(err)) remaining.push(item)
        // Error no-red (ej: mesa ya cobrada) → descartar
      }
    }

    saveQueue(remaining)
    setQueue(remaining)
    syncingRef.current = false
    setSyncStatus('idle')
  }, [onCobroSync])

  useEffect(() => {
    const goOnline = () => { if (loadQueue().length) processQueue() }
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

  return { pendingCount: queue.length, syncStatus, pendingCobros: queue, enqueue, syncNow }
}
