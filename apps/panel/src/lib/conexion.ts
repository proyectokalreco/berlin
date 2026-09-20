// Estado REAL de la conexión con el servidor.
//
// `navigator.onLine` solo dice si el equipo está conectado a una red (Wi-Fi/cable), NO si hay
// internet: con el Wi-Fi conectado pero sin salida sigue en true. Por eso se sondea el servidor
// con una petición ligera. Cualquier respuesta HTTP (aunque sea 404) prueba que el servidor
// responde; un fallo de red, un timeout o un 502/503/504 (servidor reiniciando) cuentan como caído.
import { useSyncExternalStore } from 'react'

const API_URL         = import.meta.env.VITE_API_URL || '/api'
export const EVT_CONEXION = 'br-conexion'
const TIMEOUT_MS      = 4_000
const CADA_ONLINE_MS  = 20_000   // conectado: comprobar de vez en cuando
const CADA_OFFLINE_MS = 5_000    // caído: reintentar rápido para detectar el regreso

let hayInternetAhora = typeof navigator === 'undefined' ? true : navigator.onLine
let iniciado  = false
let sondeando = false
let timer: number | undefined

export function hayInternet(): boolean {
  return hayInternetAhora
}

function fijar(valor: boolean) {
  if (valor === hayInternetAhora) return
  hayInternetAhora = valor
  window.dispatchEvent(new Event(EVT_CONEXION))
}

async function sondear(): Promise<void> {
  if (sondeando) return
  sondeando = true
  const ctl = new AbortController()
  const t = window.setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    // _ = marca de tiempo: evita que el navegador o el Service Worker respondan desde caché
    const res = await fetch(`${API_URL}/health?_=${Date.now()}`, { cache: 'no-store', signal: ctl.signal })
    fijar(![502, 503, 504].includes(res.status))
  } catch {
    fijar(false)
  } finally {
    window.clearTimeout(t)
    sondeando = false
    programar()
  }
}

function programar() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { void sondear() }, hayInternetAhora ? CADA_ONLINE_MS : CADA_OFFLINE_MS)
}

// Idempotente: se llama una vez desde el shell.
export function iniciarSondeoConexion(): void {
  if (iniciado) return
  iniciado = true
  window.addEventListener('offline', () => fijar(false))
  window.addEventListener('online',  () => { void sondear() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sondear()
  })
  void sondear()
}

function suscribir(cb: () => void) {
  window.addEventListener(EVT_CONEXION, cb)
  return () => window.removeEventListener(EVT_CONEXION, cb)
}

// Hook: true si el servidor responde
export function useHayInternet(): boolean {
  return useSyncExternalStore(suscribir, hayInternet, hayInternet)
}
