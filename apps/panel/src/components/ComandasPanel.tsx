import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChefHat, X, Printer, Utensils } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'

// Panel de Comandas — Fase 2 (+ ajustes Fase D/E). Ventana independiente (no
// bloquea el resto del panel) que muestra, por estación del usuario logueado
// (Cocina / Bebidas y Barra — br_empleados.estacion_id), los productos de mesa
// ya enviados y aún no servidos. admin_berlin/super_admin ven las 2 estaciones
// juntas. Polling cada 4s — misma infraestructura que NotifBell.
//
// Un ítem tiene 2 estados independientes, visibles y accionables acá mismo:
// "Preparado" (visto_at — cocina/barra terminó) y "Servido" (servido_at — el
// cajero de la mesa ya lo entregó al cliente). El ítem NO desaparece al marcar
// Preparado — sigue visible con el botón Servido hasta que también se marca
// eso, para que el flujo completo quede a la vista en vez de esfumarse.
//
// Imprime sola la comanda (sin precios) + toast + auto-abre el panel apenas
// detecta ítems nuevos (pedido nuevo, incluso sobre una mesa que esta misma
// estación ya había marcado Preparado antes). Guarda los ids ya impresos en un
// ref para no reimprimir/re-alertar en cada poll.

const ROLES_COMANDAS = ['cajero', 'admin_berlin', 'super_admin']

// Beep con Web Audio API, sin archivo externo. Los navegadores exigen que el audio
// se desbloquee con una interacción real del usuario (clic, tecla) antes de sonar —
// en un dispositivo dedicado esto pasa solo con el primer toque de la pantalla, y
// después suena solo en cada alerta mientras la pestaña siga abierta.
let audioCtx: AudioContext | null = null
function reproducirBeep(frecuencias: number[]) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    let inicio = audioCtx.currentTime
    frecuencias.forEach(freq => {
      const osc  = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, inicio)
      gain.gain.setValueAtTime(0.0001, inicio)
      gain.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18)
      osc.connect(gain).connect(audioCtx!.destination)
      osc.start(inicio)
      osc.stop(inicio + 0.2)
      inicio += 0.2
    })
  } catch { /* sin audio disponible — la alerta visual sigue funcionando igual */ }
}
const sonidoPedidoNuevo   = () => reproducirBeep([880, 1046])   // pedido nuevo — 2 tonos ascendentes
const sonidoListoCobrar   = () => reproducirBeep([1046, 784, 1046]) // mesa lista para cobrar — 3 tonos

interface ComandaItem {
  id: string; cantidad: number; notas?: string | null
  enviado_at: string; visto_at?: string | null; servido_at?: string | null
  nombre: string; estacion?: { id: string; nombre: string; color?: string } | null
}
interface ComandaOrden {
  orden_id: string
  mesa: { id: string; numero: number; nombre?: string | null }
  items: ComandaItem[]
}
interface MesaEstado {
  id: string; numero: number; nombre?: string | null; estado: string
  orden_activa?: { items: { enviado_at?: string | null; servido_at?: string | null }[] } | null
}
function mesaTodoServida(m: MesaEstado) {
  const enviados = (m.orden_activa?.items ?? []).filter(i => i.enviado_at)
  return enviados.length > 0 && enviados.every(i => i.servido_at)
}

function imprimirComanda(mesa: ComandaOrden['mesa'], items: ComandaItem[]) {
  const mesaNom = mesa.nombre ? `${mesa.numero} — ${mesa.nombre}` : `Mesa ${mesa.numero}`
  const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  const filas = items.map(i => `
    <tr>
      <td style="padding:3px 0;font-size:15px;font-weight:700">${i.cantidad}x</td>
      <td style="padding:3px 0 3px 6px;font-size:15px">${i.nombre}${i.notas ? `<br><span style="font-size:12px;font-weight:400">${i.notas}</span>` : ''}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comanda ${mesaNom}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{margin:4mm;size:80mm auto}
  body{font-family:Arial,sans-serif;font-weight:600;font-size:14px;color:#000}
  .c{text-align:center}.b{font-weight:800}.sep{border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  </style></head>
  <body onload="window.print()">
    <p class="c b" style="font-size:17px">COMANDA</p>
    <p class="c b" style="font-size:16px">${mesaNom}</p>
    <p class="c" style="font-size:12px">${hora}</p>
    <div class="sep"></div>
    <table>${filas}</table>
    <div class="sep"></div>
    <p class="c" style="font-size:11px">Sin precios — solo control de preparación</p>
  </body></html>`

  const w = window.open('', '_blank', 'width=380,height=600')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

export default function ComandasPanel() {
  const user = useAuthStore(s => s.user)
  const qc   = useQueryClient()
  const [open, setOpen] = useState(false)
  const impresosRef = useRef<Set<string>>(new Set())
  const primerCargaRef = useRef(true)
  const servidasAlertadasRef = useRef<Set<string>>(new Set())
  const primerCargaMesasRef = useRef(true)

  const habilitado = !!user && ROLES_COMANDAS.includes(user.rol)

  const { data: ordenes = [] } = useQuery<ComandaOrden[]>({
    queryKey: ['comandas-pendientes'],
    queryFn:  () => api.get('/berlin/comandas/pendientes').then(r => r.data),
    refetchInterval: 4_000,
    // Sin esto React Query pausa el polling cuando la pestaña/ventana pierde el
    // foco — en un dispositivo dedicado de cocina/barra que no siempre está en
    // primer plano, un pedido nuevo no aparecía hasta volver a hacer clic ahí.
    refetchIntervalInBackground: true,
    enabled: habilitado,
  })

  // Auto-imprimir + alertar + abrir el panel solo con lo nuevo (no repite lo ya
  // visto en un poll anterior). La primera carga del componente (al iniciar
  // sesión) no dispara nada de esto — solo lo que llegue después, mientras la
  // pantalla está activa. Cubre tanto un pedido recién enviado como uno
  // adicional sobre una mesa que esta misma estación ya había marcado
  // "Preparado"/"Servido" antes (reaparece con ítems nuevos) — cada pantalla
  // de cajero solo alerta de lo que le corresponde a su estación.
  useEffect(() => {
    if (primerCargaRef.current) {
      ordenes.forEach(o => o.items.forEach(i => impresosRef.current.add(i.id)))
      primerCargaRef.current = false
      return
    }
    let huboNuevos = false
    for (const o of ordenes) {
      const nuevos = o.items.filter(i => !impresosRef.current.has(i.id))
      if (nuevos.length) {
        huboNuevos = true
        const mesaNom = o.mesa.nombre ? `${o.mesa.numero} — ${o.mesa.nombre}` : `Mesa ${o.mesa.numero}`
        toast(`🔔 Pedido nuevo — ${mesaNom} (${nuevos.length} ítem${nuevos.length !== 1 ? 's' : ''})`, {
          duration: 6000,
          style: { background: '#2C2925', color: '#fff', border: '1px solid #D9A65255' },
        })
        sonidoPedidoNuevo()
        imprimirComanda(o.mesa, nuevos)
        nuevos.forEach(i => impresosRef.current.add(i.id))
      }
    }
    if (huboNuevos) setOpen(true)
  }, [ordenes])

  // Aviso informativo (ambas estaciones) cuando una mesa queda TODA servida —
  // cruza cocina + bebidas y barra, algo que ninguna de las 2 pantallas puede
  // saber mirando solo sus propios ítems pendientes. Se limpia la marca de
  // "ya avisado" apenas la mesa deja de estar toda servida (pedido nuevo o se
  // liberó), para poder volver a avisar si se completa de nuevo.
  const { data: mesasEstado = [] } = useQuery<MesaEstado[]>({
    queryKey: ['mesas'],
    queryFn:  () => api.get('/berlin/mesas').then(r => r.data),
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
    enabled: habilitado,
  })

  useEffect(() => {
    const idsAhora = new Set(mesasEstado.filter(mesaTodoServida).map(m => m.id))
    for (const id of Array.from(servidasAlertadasRef.current)) {
      if (!idsAhora.has(id)) servidasAlertadasRef.current.delete(id)
    }
    if (primerCargaMesasRef.current) {
      idsAhora.forEach(id => servidasAlertadasRef.current.add(id))
      primerCargaMesasRef.current = false
      return
    }
    for (const m of mesasEstado) {
      if (idsAhora.has(m.id) && !servidasAlertadasRef.current.has(m.id)) {
        const mesaNom = m.nombre ? `${m.numero} — ${m.nombre}` : `Mesa ${m.numero}`
        toast(`💰 ${mesaNom} — todo servido, lista para cobrar`, {
          duration: 6000,
          style: { background: '#2C2925', color: '#fff', border: '1px solid #D9A65255' },
        })
        sonidoListoCobrar()
        servidasAlertadasRef.current.add(m.id)
      }
    }
  }, [mesasEstado])

  const { mutate: marcarPreparadoItem, isPending: marcandoPreparado } = useMutation({
    mutationFn: (itemId: string) => api.patch(`/berlin/comandas/items/${itemId}/visto`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comandas-pendientes'] }),
  })

  const { mutate: marcarServidoItem, isPending: marcandoServido } = useMutation({
    mutationFn: ({ mesaId, itemId }: { mesaId: string; itemId: string }) =>
      api.patch(`/berlin/mesas/${mesaId}/orden/items/${itemId}/servido`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comandas-pendientes'] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
    },
  })

  if (!habilitado) return null

  const totalItems = ordenes.reduce((s, o) => s + o.items.length, 0)

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        title="Comandas de mesa"
        className="relative p-2 rounded-xl transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
        style={{ color: totalItems > 0 ? '#D9A652' : 'rgba(255,255,255,0.45)' }}
      >
        <ChefHat size={18} className={totalItems > 0 ? 'animate-pulse' : ''} />
        {totalItems > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white
                           text-[9px] font-bold flex items-center justify-center leading-none"
                style={{ background: '#D9A652' }}>
            {totalItems > 9 ? '9+' : totalItems}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-96 max-w-[92vw] bg-[#2C2925] rounded-2xl border border-white/10
                          shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-bold text-white flex items-center gap-1.5">
                <ChefHat size={14} className="text-[#D9A652]" /> Comandas pendientes
                {totalItems > 0 && <span className="text-[#D9A652]">({totalItems})</span>}
              </p>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5">
              {ordenes.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">Sin pedidos pendientes.</p>
              ) : (
                ordenes.map(o => (
                  <div key={o.orden_id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-white">
                        {o.mesa.nombre ? `${o.mesa.numero} — ${o.mesa.nombre}` : `Mesa ${o.mesa.numero}`}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          title="Reimprimir esta comanda"
                          onClick={() => imprimirComanda(o.mesa, o.items)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg
                                     bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <Printer size={11} /> Imprimir
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {o.items.map(i => (
                        <div key={i.id} className="text-xs text-gray-300 bg-brand-dark rounded-lg px-2.5 py-1.5 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <span className="font-bold text-white flex-shrink-0">{i.cantidad}x</span>
                            <div className="flex-1 min-w-0">
                              <p>{i.nombre}</p>
                              {i.notas && <p className="text-[10px] text-gray-500">{i.notas}</p>}
                            </div>
                          </div>
                          {/* Fila propia para las acciones — nunca se corta con nombres largos.
                              Íconos y colores bien distintos: naranja=aún sin cocinar,
                              azul="cocina/barra ya lo terminó" (NO significa entregado al
                              cliente), dorado=Servido (el cajero ya lo llevó a la mesa). */}
                          <div className="flex items-center gap-1.5">
                            {!i.visto_at ? (
                              <button
                                title="Marcar cuando cocina/barra termine de prepararlo"
                                disabled={marcandoPreparado}
                                onClick={() => marcarPreparadoItem(i.id)}
                                className="flex items-center gap-1 text-[9px] px-1.5 py-1 rounded-md
                                           bg-[#EA580C]/15 text-[#EA580C] hover:bg-[#EA580C]/25 transition-colors disabled:opacity-40"
                              >
                                <ChefHat size={10} /> Preparando
                              </button>
                            ) : (
                              <>
                                <span title="Cocina/barra ya lo terminó — falta llevarlo a la mesa"
                                  className="flex items-center gap-1 text-[9px] px-1.5 py-1 rounded-md bg-blue-500/15 text-blue-300">
                                  <ChefHat size={10} /> Listo en cocina/barra
                                </span>
                                <button
                                  title="Marcar cuando el cajero ya lo entregó en la mesa"
                                  disabled={marcandoServido}
                                  onClick={() => marcarServidoItem({ mesaId: o.mesa.id, itemId: i.id })}
                                  className="flex items-center gap-1 text-[9px] px-1.5 py-1 rounded-md
                                             bg-[#D9A652]/15 text-[#D9A652] hover:bg-[#D9A652]/25 transition-colors disabled:opacity-40"
                                >
                                  <Utensils size={10} /> Servido
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
