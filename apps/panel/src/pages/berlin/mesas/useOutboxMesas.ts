import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../../lib/api'
import { SYNC_TIMEOUT_MS, leerLocal, guardarLocal } from '../../../lib/offline'
import { hayInternet } from '../../../lib/conexion'

// ── Cola de operaciones de Mesas (outbox) ──────────────────────────────────
// Tomar mesa, agregar / quitar / cambiar cantidad de productos y enviar el pedido a las
// estaciones se guardan aquí y se aplican AL INSTANTE en pantalla (ver overlayMesas.ts); se
// sincronizan solas con el servidor en lote (POST /berlin/mesas/sync). Funciona igual con o sin
// internet: sin conexión las operaciones esperan en el equipo, sobreviven a un cierre brusco del
// navegador o del equipo, y se envían al volver.
//
// Cada operación lleva un op_id generado aquí: reenviarla (corte a mitad del envío) no la aplica
// dos veces. Los ids de la cuenta y de sus líneas también se generan aquí, así se pueden encadenar
// operaciones (tomar → agregar → enviar → cobrar) sin haber hablado con el servidor.

export type OpTipo = 'tomar' | 'agregar' | 'cantidad' | 'quitar' | 'enviar'

export interface ProductoSnap {
  id: string; nombre: string; imagen_url?: string; precio_venta: number; unidad_venta: string
}

export interface OpMesa {
  op_id:       string
  tipo:        OpTipo
  mesa_id:     string
  mesa_numero: number
  orden_id:    string     // id de la cuenta (el generado en este equipo si la tomó sin conexión)
  ts:          number     // hora real en que se hizo (ms) — el servidor la respeta, sin pasar de la suya
  // agregar
  item_id?:         string
  producto_id?:     string
  cantidad?:        number
  precio_unitario?: number   // el precio que vio el cliente
  notas?:           string | null
  // cantidad: el servidor aplica `delta` (relativo: otro equipo pudo tocar la misma línea);
  // la pantalla usa `cantidad_final` (absoluta: aplicarla dos veces da lo mismo)
  delta?:          number
  cantidad_final?: number
  // enviar
  item_ids?: string[]
  // Solo para mostrar en pantalla mientras no se sincroniza (no se envían)
  producto?: ProductoSnap
  mesero?:   { id: string; nombre: string; color: string; usuario_id?: string | null }
  // Si el servidor la rechazó por algo que NO es la red (cuenta ya cobrada, producto ya cobrado…)
  // queda marcada con el motivo: nunca se descarta en silencio.
  error?: string
}

const STORAGE_KEY = 'mesas_berlin_outbox'
const EVT         = 'br-mesas-outbox'

let sincronizando = false
// Refresca la pantalla (cuentas y tablero) ANTES de sacar las operaciones de la cola: mientras
// estén en la cola siguen aplicándose en pantalla; sacarlas antes de que llegue el dato del
// servidor haría "parpadear" la cuenta. Solo existe mientras MesasPage está abierta.
let refrescar: (() => Promise<unknown>) | null = null

export function cargarOps(): OpMesa[] {
  return leerLocal<OpMesa[]>(STORAGE_KEY, [])
}

function guardarOps(ops: OpMesa[]): void {
  guardarLocal(STORAGE_KEY, ops)
  window.dispatchEvent(new Event(EVT))
}

export function opsDeMesa(mesaId: string): OpMesa[] {
  return cargarOps().filter(o => o.mesa_id === mesaId)
}

// ¿Hay operaciones de esta cuenta/mesa sin sincronizar? Las acciones que necesitan al servidor
// (cobrar, trasladar, servir, cancelar) esperan a que se sincronicen. Las rechazadas no cuentan.
export function hayOpsPendientes(ordenId?: string | null, mesaId?: string | null): boolean {
  return cargarOps().some(o => !o.error &&
    ((!!ordenId && o.orden_id === ordenId) || (!!mesaId && o.mesa_id === mesaId)))
}

export function nuevaOp(
  tipo: OpTipo,
  base: { mesa_id: string; mesa_numero: number; orden_id: string },
  extra: Partial<OpMesa> = {},
): OpMesa {
  return { op_id: crypto.randomUUID(), tipo, ts: Date.now(), ...base, ...extra }
}

// Escritura previa: se guarda en el equipo ANTES de intentar enviarla.
export function encolarOp(op: OpMesa): boolean {
  const ok = guardarLocal(STORAGE_KEY, [...cargarOps(), op])
  window.dispatchEvent(new Event(EVT))
  if (hayInternet()) void sincronizarOpsMesas()
  return ok
}

function quitarOps(ids: string[]): void {
  const fuera = new Set(ids)
  guardarOps(cargarOps().filter(o => !fuera.has(o.op_id)))
}

// Campos que viajan al servidor (sin lo que es solo de pantalla)
const paraServidor = (o: OpMesa) => {
  const { producto: _p, mesero: _m, cantidad_final: _c, error: _e, ...resto } = o
  void _p; void _m; void _c; void _e
  return resto
}

interface ResultadoOp {
  op_id: string
  estado: 'ok' | 'conflicto' | 'reintentar'
  mensaje?: string
  aviso?: string
}

// Envía las operaciones pendientes, en orden, en un solo lote. Cada una vuelve con su resultado:
//  ok         → se aplicó (o ya estaba aplicada): sale de la cola
//  conflicto  → el servidor la rechazó por el estado de la cuenta: queda marcada con el motivo
//  reintentar → fallo pasajero del servidor: se queda y se vuelve a intentar
// Un fallo de red o del lote entero deja todo en la cola.
export async function sincronizarOpsMesas(): Promise<void> {
  if (sincronizando) return
  const pendientes = cargarOps().filter(o => !o.error)
  if (!pendientes.length) return

  sincronizando = true
  window.dispatchEvent(new Event(EVT))
  const enviadas = new Set(pendientes.map(o => o.op_id))
  try {
    const res = await api.post('/berlin/mesas/sync', { ops: pendientes.map(paraServidor) }, { timeout: SYNC_TIMEOUT_MS })
    const resultados: ResultadoOp[] = res.data?.resultados ?? []

    const aceptadas: string[] = []
    const rechazos = new Map<string, string>()
    for (const r of resultados) {
      if (r.aviso) toast(r.aviso, { icon: 'ℹ️', duration: 9000 })
      if (r.estado === 'ok') aceptadas.push(r.op_id)
      else if (r.estado === 'conflicto') rechazos.set(r.op_id, r.mensaje || 'El servidor rechazó el cambio')
    }
    if (rechazos.size) {
      guardarOps(cargarOps().map(o => rechazos.has(o.op_id) ? { ...o, error: rechazos.get(o.op_id) } : o))
    }
    if (aceptadas.length) {
      try { if (refrescar) await refrescar() } catch { /* se refresca solo en el siguiente ciclo */ }
      quitarOps(aceptadas)
    }
  } catch (err) {
    // Sin red, sesión vencida, servidor reiniciando o backend aún sin actualizar: todo se queda
    // en la cola y se reintenta solo (ver useSincronizacionColas).
    console.warn('[mesas/sync] no se pudo sincronizar todavía', (err as { message?: string })?.message)
  } finally {
    sincronizando = false
    window.dispatchEvent(new Event(EVT))
  }
  // Operaciones nuevas mientras se sincronizaba: otra vuelta (solo por las que no iban en este lote)
  if (cargarOps().some(o => !o.error && !enviadas.has(o.op_id)) && hayInternet()) void sincronizarOpsMesas()
}

// Operaciones actuales (para superponerlas al dato del servidor)
export function useOpsMesas(): OpMesa[] {
  const [ops, setOps] = useState<OpMesa[]>(cargarOps)
  useEffect(() => {
    const al = () => setOps(cargarOps())
    window.addEventListener(EVT, al)
    al()
    return () => window.removeEventListener(EVT, al)
  }, [])
  return ops
}

// Estado y controles de la cola (banner de pendientes / rechazadas). `refrescarPantalla` se
// registra mientras la pantalla de Mesas está abierta.
export function useOutboxMesas(refrescarPantalla: () => Promise<unknown>) {
  const ops = useOpsMesas()

  useEffect(() => {
    refrescar = refrescarPantalla
    return () => { if (refrescar === refrescarPantalla) refrescar = null }
  }, [refrescarPantalla])

  const syncNow = useCallback(() => { void sincronizarOpsMesas() }, [])

  // Reintentar una rechazada: quita la marca de error y vuelve a procesar
  const retry = useCallback((opId: string) => {
    guardarOps(cargarOps().map(o => {
      if (o.op_id !== opId) return o
      const { error: _e, ...resto } = o
      void _e
      return resto
    }))
    void sincronizarOpsMesas()
  }, [])

  // Descartar una rechazada, tras revisarla: deja de aplicarse en pantalla
  const discard = useCallback((opId: string) => quitarOps([opId]), [])

  const fallidas = ops.filter(o => !!o.error)
  return {
    ops,
    pendientes: ops.length - fallidas.length,
    fallidas,
    sincronizando,
    syncNow, retry, discard,
  }
}
