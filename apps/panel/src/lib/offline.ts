// Utilidades compartidas del modo sin conexión (colas de POS y Mesas).
//
// Regla de oro: una venta/cobro NUNCA se pierde por un fallo de red, un reinicio del navegador
// o un cierre brusco del equipo. Se escribe en la cola local ANTES de enviarla y solo sale de
// la cola cuando el servidor confirma. La `idempotency_key` hace seguro reenviar.

// El cobro de una venta espera poco: si el servidor no responde en este tiempo se asume caída
// (Wi-Fi conectado pero sin internet) y la venta se queda en la cola local. Si el servidor sí la
// procesó, el reenvío con la misma idempotency_key devuelve la venta existente, sin duplicar.
export const COBRO_TIMEOUT_MS = 10_000
// Reenvíos desde la cola en segundo plano
export const SYNC_TIMEOUT_MS  = 15_000
// Cada cuánto se reintenta la cola mientras haya pendientes (cubre el caso Wi-Fi sin internet,
// donde el navegador nunca dispara el evento "online").
export const SYNC_INTERVALO_MS = 20_000

type ErrLike = {
  code?: string
  message?: string
  response?: { status?: number; data?: { error?: string } }
}

// Sin respuesta del servidor: red caída, timeout o petición cancelada
export function isNetworkError(err: unknown): boolean {
  const e = (err ?? {}) as ErrLike
  return !e.response && (
    e.code === 'ERR_NETWORK' ||
    e.code === 'ECONNABORTED' ||
    e.message === 'Network Error' ||
    !!e.message?.includes('timeout')
  )
}

// Fallo pasajero: red o servidor reiniciándose (502/503/504 durante un despliegue).
// La venta se conserva en la cola y se reintenta sola.
export function isTransientError(err: unknown): boolean {
  if (isNetworkError(err)) return true
  const s = ((err ?? {}) as ErrLike).response?.status
  return s === 408 || s === 429 || s === 502 || s === 503 || s === 504
}

// Sesión vencida (el refresh token también expiró). La venta se conserva y se envía cuando el
// usuario vuelva a iniciar sesión — nunca se descarta.
export function isAuthError(err: unknown): boolean {
  return ((err ?? {}) as ErrLike).response?.status === 401
}

export function mensajeError(err: unknown, fallback: string): string {
  return ((err ?? {}) as ErrLike).response?.data?.error || fallback
}

export function leerLocal<T>(key: string, porDefecto: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : porDefecto
  } catch { return porDefecto }
}

// Devuelve false si no pudo guardar (cuota llena, modo privado, almacenamiento bloqueado).
export function guardarLocal(key: string, valor: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(valor))
    return true
  } catch (e) {
    console.error(`[offline] no se pudo guardar "${key}" en el equipo`, e)
    return false
  }
}

// Pide al navegador que NO borre los datos del sitio (colas de ventas pendientes) cuando el
// equipo se queda sin espacio. Chrome/Edge lo conceden a PWAs instaladas y sitios muy usados;
// iOS Safari solo con la app instalada en la pantalla de inicio.
export function pedirAlmacenamientoPersistente(): void {
  try {
    if (navigator.storage?.persist) void navigator.storage.persist()
  } catch { /* sin soporte: no pasa nada */ }
}

// Para consultas que devuelven un valor "vacío" cuando el servidor responde con error de negocio
// (por ejemplo "no hay turno abierto" -> null). Un fallo de RED o de sesión NO es "no hay dato": se
// relanza para que React Query conserve lo último que se supo (y la copia guardada en el equipo)
// en vez de sobrescribirlo con un vacío falso, p. ej. "No hay caja abierta" cuando solo se cayó
// internet.
//   api.get('/berlin/caja/turno-activo').then(r => r.data).catch(fallbackSiNoRed(null))
export function fallbackSiNoRed<T>(valor: T): (err: unknown) => T {
  return (err: unknown) => {
    if (isTransientError(err) || isAuthError(err)) throw err
    return valor
  }
}
