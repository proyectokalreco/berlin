import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChefHat, X, Check, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'

// Panel de Comandas — Fase 2. Ventana independiente (no bloquea el resto del
// panel) que muestra, por estación del usuario logueado (Cocina / Bebidas y
// Barra — br_empleados.estacion_id), los productos de mesa ya enviados y aún
// no marcados como preparados. admin_berlin/super_admin ven las 2 estaciones
// juntas. Polling cada 4s — misma infraestructura que NotifBell.
//
// Imprime sola la comanda (sin precios) apenas detecta ítems nuevos — pensado
// para un dispositivo dedicado por estación con la sesión del cajero abierta
// todo el turno (confirmado con el cliente). Guarda los ids ya impresos en un
// ref para no reimprimir en cada poll.

const ROLES_COMANDAS = ['cajero', 'admin_berlin', 'super_admin']

interface ComandaItem {
  id: string; cantidad: number; notas?: string | null; enviado_at: string
  nombre: string; estacion?: { id: string; nombre: string; color?: string } | null
}
interface ComandaOrden {
  orden_id: string
  mesa: { id: string; numero: number; nombre?: string | null }
  items: ComandaItem[]
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

  const habilitado = !!user && ROLES_COMANDAS.includes(user.rol)

  const { data: ordenes = [] } = useQuery<ComandaOrden[]>({
    queryKey: ['comandas-pendientes'],
    queryFn:  () => api.get('/berlin/comandas/pendientes').then(r => r.data),
    refetchInterval: 4_000,
    enabled: habilitado,
  })

  // Auto-imprimir solo lo nuevo (no reimprime lo ya visto en un poll anterior).
  // La primera carga del componente (al iniciar sesión) no dispara impresión —
  // solo lo que llegue después, mientras la pantalla está activa.
  useEffect(() => {
    if (primerCargaRef.current) {
      ordenes.forEach(o => o.items.forEach(i => impresosRef.current.add(i.id)))
      primerCargaRef.current = false
      return
    }
    for (const o of ordenes) {
      const nuevos = o.items.filter(i => !impresosRef.current.has(i.id))
      if (nuevos.length) {
        imprimirComanda(o.mesa, nuevos)
        nuevos.forEach(i => impresosRef.current.add(i.id))
      }
    }
  }, [ordenes])

  const { mutate: marcarMesa, isPending: marcando } = useMutation({
    mutationFn: (ordenId: string) => api.patch(`/berlin/comandas/mesas/${ordenId}/visto`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comandas-pendientes'] })
      toast.success('Marcado como preparado')
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
                        <button
                          disabled={marcando}
                          onClick={() => marcarMesa(o.orden_id)}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg
                                     bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40"
                        >
                          <Check size={11} /> Preparado
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {o.items.map(i => (
                        <div key={i.id} className="flex items-start gap-2 text-xs text-gray-300 bg-brand-dark rounded-lg px-2.5 py-1.5">
                          <span className="font-bold text-white flex-shrink-0">{i.cantidad}x</span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate">{i.nombre}</p>
                            {i.notas && <p className="text-[10px] text-gray-500 truncate">{i.notas}</p>}
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
