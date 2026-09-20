// Copia local de las consultas (mesas, turno de caja, catálogo, clientes…) en IndexedDB.
//
// Sirve para arrancar SIN internet tras un cierre brusco del navegador o del equipo: al abrir la
// app se restaura lo último que se supo, en vez de mostrar pantallas vacías o "POS Bloqueado".
// Los datos restaurados se marcan como viejos: en cuanto hay internet se vuelven a pedir.
//
// Seguridad: la copia pertenece a UN usuario (se ignora si inició sesión otro) y se borra al
// cerrar sesión. Vive solo en este equipo, igual que el resto de datos guardados en el navegador.
import { dehydrate, hydrate } from '@tanstack/react-query'
import type { DehydratedState, QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'

const DB_NOMBRE       = 'berlin-cache'
const STORE           = 'kv'
const CLAVE           = 'react-query'
const EDAD_MAX_MS     = 24 * 60 * 60 * 1000
const GUARDAR_TRAS_MS = 2_000
// Identifica la versión de la app: una copia de otra versión se ignora (la forma de los datos
// pudo cambiar). Definido en vite.config.ts.
const VERSION = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev'

interface Sobre {
  version:  string
  userId:   string
  guardado: number
  estado:   DehydratedState
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function leer(): Promise<Sobre | undefined> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(CLAVE)
    r.onsuccess = () => resolve(r.result as Sobre | undefined)
    r.onerror   = () => reject(r.error)
  })
}

async function escribir(sobre: Sobre | undefined): Promise<void> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    if (sobre) tx.objectStore(STORE).put(sobre, CLAVE)
    else       tx.objectStore(STORE).delete(CLAVE)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

// Restaura la copia guardada ANTES de pintar la app. Nunca lanza error ni demora más de ~1 s.
export async function restaurarCache(client: QueryClient): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.id
    if (!userId || typeof indexedDB === 'undefined') return
    const sobre = await Promise.race([
      leer(),
      new Promise<undefined>(res => setTimeout(() => res(undefined), 1_000)),
    ])
    if (!sobre) return
    if (sobre.version !== VERSION || sobre.userId !== userId) return
    if (Date.now() - sobre.guardado > EDAD_MAX_MS) return
    hydrate(client, sobre.estado)
  } catch (e) {
    console.error('[cacheLocal] no se pudo restaurar la copia local', e)
  }
}

// Guarda la copia cada vez que cambian las consultas (con espera, para no escribir en cada cambio).
export function iniciarPersistenciaCache(client: QueryClient): void {
  if (typeof indexedDB === 'undefined') return
  let timer: number | undefined

  const guardar = async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    try {
      // Se guarda toda consulta que tenga dato, también las que fallaron al refrescar (sin
      // internet quedan en estado "error" pero CONSERVAN el último dato bueno; si se descartaran,
      // el siguiente reinicio sin red perdería el turno de caja, las mesas, etc.).
      const estado = dehydrate(client, {
        shouldDehydrateQuery: q => q.state.data !== undefined,
      })
      // Sin el objeto de error (AxiosError no se puede copiar a IndexedDB): el dato se guarda
      // como una consulta normal y exitosa.
      estado.queries = estado.queries.map(q => ({
        ...q,
        state: {
          ...q.state,
          status: 'success' as const,
          fetchStatus: 'idle' as const,
          error: null,
          errorUpdateCount: 0,
          errorUpdatedAt: 0,
          fetchFailureCount: 0,
          fetchFailureReason: null,
          fetchMeta: null,
        },
      }))
      await escribir({ version: VERSION, userId, guardado: Date.now(), estado })
    } catch (e) {
      console.error('[cacheLocal] no se pudo guardar la copia local', e)
    }
  }
  const programar = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => { void guardar() }, GUARDAR_TRAS_MS)
  }

  client.getQueryCache().subscribe(programar)
  // Al ocultar o cerrar la app se guarda de inmediato (sin esperar la espera de arriba)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { window.clearTimeout(timer); void guardar() }
  })
  window.addEventListener('pagehide', () => { window.clearTimeout(timer); void guardar() })
}

// Al cerrar sesión: que la copia de este usuario no quede en el equipo
export async function borrarCacheLocal(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return
    await Promise.race([escribir(undefined), new Promise(res => setTimeout(res, 1_000))])
  } catch { /* nada que borrar */ }
}
