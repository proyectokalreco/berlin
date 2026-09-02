import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../../lib/api'

export type NetworkStatus = 'online' | 'offline' | 'syncing'

export interface QueuedSale {
  idempotency_key: string
  payload: {
    items: { producto_id: string; cantidad: number; precio_unitario: number }[]
    metodo_pago: string
    cliente_id?: string
    redondeo?: number
    idempotency_key: string
    monto_efectivo?: number
    monto_transferencia?: number
  }
  queued_at: number
}

const STORAGE_KEY = 'pos_berlin_offline_queue'

function loadQueue(): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveQueue(q: QueuedSale[]) {
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

export function useOfflineQueue(onSaleSuccess: (data: unknown) => void) {
  const [status, setStatus]       = useState<NetworkStatus>(navigator.onLine ? 'online' : 'offline')
  const [queue, setQueue]         = useState<QueuedSale[]>(loadQueue)
  const syncingRef                = useRef(false)

  // Sincronizar estado con localStorage
  const updateQueue = useCallback((fn: (prev: QueuedSale[]) => QueuedSale[]) => {
    setQueue(prev => {
      const next = fn(prev)
      saveQueue(next)
      return next
    })
  }, [])

  // Procesar la cola cuando hay conexión
  const processQueue = useCallback(async () => {
    if (syncingRef.current) return
    const pending = loadQueue()
    if (!pending.length) return

    syncingRef.current = true
    setStatus('syncing')

    const remaining: QueuedSale[] = []
    for (const item of pending) {
      try {
        const res = await api.post('/berlin/ventas', item.payload)
        onSaleSuccess(res.data)
      } catch (err) {
        if (isNetworkError(err)) {
          remaining.push(item)
        }
        // Si no es error de red (ej: 409 duplicado) descartamos — ya fue procesado
      }
    }

    saveQueue(remaining)
    setQueue(remaining)
    syncingRef.current = false
    setStatus(navigator.onLine ? 'online' : 'offline')
  }, [onSaleSuccess])

  // Escuchar eventos de red
  useEffect(() => {
    const goOnline = () => {
      setStatus('online')
      const q = loadQueue()
      if (q.length) processQueue()
    }
    const goOffline = () => setStatus('offline')

    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [processQueue])

  // Encolar una venta fallida por red
  const enqueue = useCallback((sale: QueuedSale) => {
    updateQueue(prev => {
      const exists = prev.some(i => i.idempotency_key === sale.idempotency_key)
      return exists ? prev : [...prev, sale]
    })
  }, [updateQueue])

  // Sincronización manual
  const syncNow = useCallback(() => {
    if (navigator.onLine) processQueue()
  }, [processQueue])

  return { status, pendingCount: queue.length, enqueue, syncNow }
}
