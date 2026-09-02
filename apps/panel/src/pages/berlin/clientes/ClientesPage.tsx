import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import toast from 'react-hot-toast'
import {
  Users, Plus, X, Phone, Edit2, Search, CreditCard,
  Receipt, Printer, ChevronRight, Package, ShoppingBag,
  CheckCircle, Clock, XCircle, AlertTriangle, Banknote,
  ArrowDownCircle, CalendarClock, Trash2,
} from 'lucide-react'
import type { Producto } from '../../../types'
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

// Maneja tanto '2026-06-04' como '2026-06-04T18:05:00+00:00'
const fmtFecha = (d: string) =>
  new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Tipos ─────────────────────────────────────────────────────
interface Cliente { id:string; nombre:string; telefono?:string; email?:string; direccion?:string; activo:boolean }

interface VentaCredito {
  id:string; numero_venta:string; fecha:string; total:number; saldo_pendiente:number
  items?: { cantidad:number; precio_unitario:number; subtotal:number; producto?:{nombre:string} }[]
}

interface Abono {
  id:string; monto:number; tipo:string; metodo_pago:string; notas?:string; created_at:string
  venta_id?:string; registrado_por?:{nombre:string}
}

interface Encargo {
  id:string; descripcion:string; cantidad:number; precio_acordado:number; anticipo:number
  fecha_entrega:string; estado:string; notas?:string; created_at:string
  cliente?:{nombre:string}; producto?:{nombre:string;imagen_url?:string}
}

interface Separe {
  id:string; cantidad:number; precio_acordado:number; anticipo:number
  fecha_limite?:string; estado:string; notas?:string; created_at:string
  cliente?:{nombre:string}
  producto?:{id:string;nombre:string;imagen_url?:string;stock_actual:number;unidad_venta:string;precio_venta:number}
}

// ── Colores estado ────────────────────────────────────────────
const ESTADO_COLOR: Record<string, string> = {
  pendiente:      'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  en_produccion:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  listo:          'bg-green-500/15 text-green-400 border-green-500/25',
  entregado:      'bg-gray-500/15 text-gray-400 border-gray-500/25',
  cancelado:      'bg-red-500/15 text-red-400 border-red-500/25',
  activo:         'bg-brand-teal/15 text-brand-teal border-brand-teal/25',
  vencido:        'bg-orange-500/15 text-orange-400 border-orange-500/25',
}

// ── Impresión comprobante ─────────────────────────────────────
function imprimirComprobante(titulo: string, lineas: [string,string][]) {
  const origin = window.location.origin
  const rows = lineas.map(([k,v]) => `
    <tr><td class="key">${k}</td><td class="val">${v}</td></tr>
  `).join('')
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    @page{margin:5mm;size:80mm auto}
    body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
    .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:4px 0}
    img.logo{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:18mm}
    table{width:100%;border-collapse:collapse;margin-top:4px}
    td{padding:2px 0;font-size:13px}.key{color:#000}.val{text-align:right;font-weight:bold}
  </style></head><body>
  <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
  <div class="c b" style="font-size:13px;margin:3px 0">*Café Bar Berlín*</div>
  <div class="sep"></div>
  <div class="c b">${titulo.toUpperCase()}</div>
  <div class="c" style="font-size:12px">${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
  <div class="sep"></div>
  <table><tbody>${rows}</tbody></table>
  <div class="sep"></div>
  <div class="c" style="font-size:12px;margin-top:4px">Sistema Kalreco v1.0</div>
  </body></html>`
  const w = window.open('','_blank','width=440,height=600')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),600)},400) }
}

// ══════════════════════════════════════════════════════════════
// MODAL DETALLE CLIENTE (tabs: Saldo · Encargos · Separes)
// ══════════════════════════════════════════════════════════════
function ClienteDetalle({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab]               = useState<'saldo'|'encargos'|'separes'>('saldo')
  const [ventaAbonar, setVentaAbonar] = useState<VentaCredito | null>(null)
  const [showAbonar,  setShowAbonar]  = useState(false)
  const [showEncargo, setShowEncargo] = useState(false)
  const [showSepare,  setShowSepare]  = useState(false)
  const [showDeuda,   setShowDeuda]   = useState(false)

  // ── Saldo ──
  const { data: saldo, isLoading: loadSaldo } = useQuery<{ventas:VentaCredito[];abonos:Abono[];total_pendiente:number}>({
    queryKey: ['cliente-saldo', cliente.id],
    queryFn:  () => api.get(`/berlin/clientes/${cliente.id}/saldo`).then(r => r.data),
  })

  // ── Encargos ──
  const { data: encargos = [], isLoading: loadEnc } = useQuery<Encargo[]>({
    queryKey: ['encargos', cliente.id],
    queryFn:  () => api.get('/berlin/encargos', { params: { cliente_id: cliente.id } }).then(r => r.data),
    enabled:  tab === 'encargos',
  })

  // ── Separes ──
  const { data: separes = [], isLoading: loadSep } = useQuery<Separe[]>({
    queryKey: ['separes', cliente.id],
    queryFn:  () => api.get('/berlin/separes', { params: { cliente_id: cliente.id } }).then(r => r.data),
    enabled:  tab === 'separes',
  })

  // ── Pagar todo ──
  const { mutate: pagarTodo, isPending: pagando } = useMutation({
    mutationFn: () => api.post(`/berlin/clientes/${cliente.id}/pagar-todo`, { metodo_pago: 'efectivo' }),
    onSuccess: (res) => {
      toast.success(`Saldo pagado: ${fmt(res.data.total_pagado)}`)
      qc.invalidateQueries({ queryKey: ['cliente-saldo', cliente.id] })
      imprimirComprobante('Pago Total Saldo', [
        ['Cliente', cliente.nombre],
        ['Total pagado', fmt(res.data.total_pagado)],
        ['Método', 'Efectivo'],
        ['Fecha', new Date().toLocaleDateString('es-CO')],
      ])
    },
    onError: () => toast.error('Error al pagar'),
  })

  // ── Entregar encargo ──
  const { mutate: entregarEncargo } = useMutation({
    mutationFn: (id: string) => api.patch(`/berlin/encargos/${id}/entregar`, { metodo_pago: 'efectivo' }),
    onSuccess: (res, id) => {
      toast.success('Encargo entregado ✅')
      qc.invalidateQueries({ queryKey: ['encargos', cliente.id] })
      const enc = encargos.find(e => e.id === id)
      if (enc) imprimirComprobante('Comprobante Encargo', [
        ['Cliente',       cliente.nombre],
        ['Encargo',       enc.descripcion],
        ['Cantidad',      String(enc.cantidad)],
        ['Total acordado',fmt(enc.precio_acordado)],
        ['Anticipo',      fmt(enc.anticipo)],
        ['Saldo cobrado', fmt(res.data.saldo_cobrado)],
        ['Fecha entrega', new Date().toLocaleDateString('es-CO')],
      ])
    },
    onError: () => toast.error('Error al entregar encargo'),
  })

  // ── Cambiar estado encargo ──
  const { mutate: cambiarEstado } = useMutation({
    mutationFn: ({ id, estado }: { id:string; estado:string }) =>
      api.patch(`/berlin/encargos/${id}/estado`, { estado }),
    onSuccess: () => {
      toast.success('Estado actualizado')
      qc.invalidateQueries({ queryKey: ['encargos', cliente.id] })
    },
  })

  // ── Entregar separe ──
  const { mutate: entregarSepare } = useMutation({
    mutationFn: (id: string) => api.patch(`/berlin/separes/${id}/entregar`, { metodo_pago: 'efectivo' }),
    onSuccess: (res, id) => {
      toast.success('Separe entregado ✅')
      qc.invalidateQueries({ queryKey: ['separes', cliente.id] })
      const sep = separes.find(s => s.id === id)
      if (sep) imprimirComprobante('Comprobante Separe', [
        ['Cliente',       cliente.nombre],
        ['Producto',      sep.producto?.nombre ?? '—'],
        ['Cantidad',      `${sep.cantidad} ${sep.producto?.unidad_venta ?? 'u'}`],
        ['Total acordado',fmt(sep.precio_acordado)],
        ['Anticipo',      fmt(sep.anticipo)],
        ['Saldo cobrado', fmt(res.data.saldo_cobrado)],
        ['Fecha entrega', new Date().toLocaleDateString('es-CO')],
      ])
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al entregar separe')
    },
  })

  // ── Cancelar separe ──
  const { mutate: cancelarSepare } = useMutation({
    mutationFn: (id: string) => api.patch(`/berlin/separes/${id}/cancelar`),
    onSuccess: () => {
      toast.success('Separe cancelado')
      qc.invalidateQueries({ queryKey: ['separes', cliente.id] })
    },
  })

  // ── Eliminar encargo cancelado ──
  const { mutate: eliminarEncargo } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/encargos/${id}`),
    onSuccess: () => {
      toast.success('Encargo eliminado')
      qc.invalidateQueries({ queryKey: ['encargos', cliente.id] })
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al eliminar encargo')
    },
  })

  // ── Eliminar separe cancelado ──
  const { mutate: eliminarSepare } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/separes/${id}`),
    onSuccess: () => {
      toast.success('Separe eliminado')
      qc.invalidateQueries({ queryKey: ['separes', cliente.id] })
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al eliminar separe')
    },
  })

  const TABS = [
    { id: 'saldo',    label: 'Saldo',    icon: CreditCard },
    { id: 'encargos', label: 'Encargos', icon: CalendarClock },
    { id: 'separes',  label: 'Separes',  icon: ShoppingBag },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#112240] rounded-2xl w-full max-w-xl border border-white/10 shadow-2xl my-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-500/15 flex items-center justify-center
                            text-pink-400 font-bold text-lg flex-shrink-0">
              {cliente.nombre[0].toUpperCase()}
            </div>
            <div>
              <h3 className="text-white font-bold">{cliente.nombre}</h3>
              {cliente.telefono && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Phone size={10}/>{cliente.telefono}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400
                       hover:text-white hover:bg-white/10 rounded-xl transition-colors">
            <X size={18}/>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors',
                tab === t.id
                  ? 'text-pink-400 border-b-2 border-pink-500'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              <t.icon size={13}/>{t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: SALDO ── */}
        {tab === 'saldo' && (
          <div className="max-h-[60vh] overflow-y-auto">
            {loadSaldo ? (
              <p className="text-center py-10 text-gray-600 text-sm">Cargando…</p>
            ) : (
              <>
                {/* Resumen */}
                <div className="px-5 py-4 bg-blue-500/5 border-b border-white/5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Saldo total pendiente</p>
                      <p className="text-2xl font-bold text-white tabular-nums">
                        {fmt(saldo?.total_pendiente ?? 0)}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {saldo?.ventas.length ?? 0} factura(s) pendiente(s)
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => { setVentaAbonar(null); setShowAbonar(true) }}
                        disabled={!saldo?.total_pendiente}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10
                                   border border-blue-500/30 text-blue-400 text-xs font-bold
                                   hover:bg-blue-500/20 disabled:opacity-40 transition-colors"
                      >
                        <ArrowDownCircle size={13}/> Abonar
                      </button>
                      <button
                        onClick={() => setShowDeuda(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/10
                                   border border-orange-500/30 text-orange-400 text-xs font-bold
                                   hover:bg-orange-500/20 transition-colors"
                      >
                        <Plus size={13}/> Registrar deuda
                      </button>
                      <button
                        onClick={() => pagarTodo()}
                        disabled={!saldo?.total_pendiente || pagando}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10
                                   border border-green-500/30 text-green-400 text-xs font-bold
                                   hover:bg-green-500/20 disabled:opacity-40 transition-colors"
                      >
                        <CheckCircle size={13}/> {pagando ? 'Pagando…' : 'Pagar todo'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Facturas pendientes */}
                {(saldo?.ventas ?? []).length > 0 && (
                  <div className="px-5 py-3 border-b border-white/5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                      Facturas pendientes
                    </p>
                    <div className="space-y-2">
                      {saldo!.ventas.map(v => (
                        <div key={v.id} className="bg-brand-dark rounded-xl p-3 border border-white/5">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white">{v.numero_venta}</p>
                              <p className="text-[10px] text-gray-500">{fmtFecha(v.fecha)}</p>
                              {v.items?.slice(0,2).map((it,i) => (
                                <p key={i} className="text-[10px] text-gray-600">
                                  {it.producto?.nombre} ×{it.cantidad}
                                </p>
                              ))}
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="text-xs text-gray-500">Total: {fmt(v.total)}</p>
                              <p className="text-sm font-bold text-blue-400 tabular-nums">
                                Debe: {fmt(v.saldo_pendiente)}
                              </p>
                              <div className="flex gap-1 mt-1 justify-end">
                                <button
                                  onClick={() => { setVentaAbonar(v); setShowAbonar(true) }}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-blue-500/10
                                             text-blue-400 border border-blue-500/20 hover:bg-blue-500/20"
                                >
                                  Abonar
                                </button>
                                <button
                                  onClick={() => imprimirComprobante('Detalle Factura Crédito', [
                                    ['No. Factura', v.numero_venta],
                                    ['Fecha', fmtFecha(v.fecha)],
                                    ['Total factura', fmt(v.total)],
                                    ['Saldo pendiente', fmt(v.saldo_pendiente)],
                                    ...(v.items?.map(it => [it.producto?.nombre ?? '—', `×${it.cantidad} ${fmt(it.subtotal)}`] as [string, string]) ?? []),
                                  ])}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-white/5
                                             text-gray-400 border border-white/10 hover:bg-white/10"
                                >
                                  <Printer size={10}/>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historial abonos */}
                {(saldo?.abonos ?? []).length > 0 && (
                  <div className="px-5 py-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                      Historial de abonos
                    </p>
                    <div className="space-y-1.5">
                      {saldo!.abonos.map(a => (
                        <div key={a.id} className="flex items-center justify-between text-xs px-3 py-2
                                                    bg-brand-dark rounded-lg border border-white/5">
                          <div>
                            <p className="text-white font-medium">{fmt(a.monto)}</p>
                            <p className="text-gray-500 text-[10px]">
                              {new Date(a.created_at).toLocaleDateString('es-CO')} ·{' '}
                              {a.tipo} · {a.metodo_pago}
                            </p>
                          </div>
                          <button
                            onClick={() => imprimirComprobante('Comprobante Abono', [
                              ['Cliente',  cliente.nombre],
                              ['Monto',    fmt(a.monto)],
                              ['Tipo',     a.tipo],
                              ['Método',   a.metodo_pago],
                              ['Fecha',    new Date(a.created_at).toLocaleDateString('es-CO')],
                              ['Notas',    a.notas || '—'],
                            ])}
                            className="text-gray-600 hover:text-gray-300 transition-colors p-1"
                          >
                            <Printer size={12}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!saldo?.total_pendiente && !saldo?.abonos.length && (
                  <div className="flex flex-col items-center py-12 gap-2 text-gray-600">
                    <CheckCircle size={32} className="opacity-20"/>
                    <p className="text-sm">Sin saldo pendiente</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB: ENCARGOS ── */}
        {tab === 'encargos' && (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Encargos</p>
              <button onClick={() => setShowEncargo(true)}
                className="flex items-center gap-1 text-xs text-brand-teal hover:text-white transition-colors font-semibold">
                <Plus size={12}/> Nuevo encargo
              </button>
            </div>

            {loadEnc ? (
              <p className="text-center py-8 text-gray-600 text-sm">Cargando…</p>
            ) : encargos.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-gray-600">
                <CalendarClock size={28} className="opacity-20"/>
                <p className="text-sm">Sin encargos registrados</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {encargos.map(e => (
                  <div key={e.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{e.descripcion}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Entrega: {fmtFecha(e.fecha_entrega)} · Cantidad: {e.cantidad}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Total: {fmt(e.precio_acordado)} · Anticipo: {fmt(e.anticipo)}
                          {' '}· Saldo: {fmt(Math.max(0, e.precio_acordado - e.anticipo))}
                        </p>
                      </div>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0',
                        ESTADO_COLOR[e.estado] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
                        {e.estado.replace('_', ' ')}
                      </span>
                    </div>

                    {e.estado !== 'entregado' && e.estado !== 'cancelado' && (
                      <div className="flex gap-2 flex-wrap">
                        {e.estado !== 'listo' && (
                          <>
                            {e.estado === 'pendiente' && (
                              <button onClick={() => cambiarEstado({ id: e.id, estado: 'en_produccion' })}
                                className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400
                                           border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
                                → En producción
                              </button>
                            )}
                            {e.estado === 'en_produccion' && (
                              <button onClick={() => cambiarEstado({ id: e.id, estado: 'listo' })}
                                className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400
                                           border border-green-500/20 hover:bg-green-500/20 transition-colors">
                                → Listo para entrega
                              </button>
                            )}
                          </>
                        )}
                        {(e.estado === 'listo' || e.estado === 'en_produccion' || e.estado === 'pendiente') && (
                          <button onClick={() => entregarEncargo(e.id)}
                            className="text-[10px] px-2.5 py-1 rounded-lg bg-brand-teal/10 text-brand-teal
                                       border border-brand-teal/20 hover:bg-brand-teal/20 transition-colors">
                            Entregar ✓
                          </button>
                        )}
                        <button onClick={() => cambiarEstado({ id: e.id, estado: 'cancelado' })}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400
                                     border border-red-500/20 hover:bg-red-500/20 transition-colors">
                          Cancelar
                        </button>
                        <button
                          onClick={() => imprimirComprobante('Comprobante Encargo', [
                            ['Cliente',       cliente.nombre],
                            ['Encargo',       e.descripcion],
                            ['Cantidad',      String(e.cantidad)],
                            ['Total',         fmt(e.precio_acordado)],
                            ['Anticipo',      fmt(e.anticipo)],
                            ['Saldo pendiente', fmt(Math.max(0, e.precio_acordado - e.anticipo))],
                            ['Fecha entrega', fmtFecha(e.fecha_entrega)],
                            ['Estado',        e.estado],
                          ])}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-400
                                     border border-white/10 hover:bg-white/10 transition-colors"
                        >
                          <Printer size={10}/>
                        </button>
                      </div>
                    )}
                    {e.estado === 'entregado' && (
                      <button
                        onClick={() => imprimirComprobante('Comprobante Encargo', [
                          ['Cliente',  cliente.nombre],
                          ['Encargo',  e.descripcion],
                          ['Total',    fmt(e.precio_acordado)],
                          ['Estado',   'ENTREGADO'],
                        ])}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-400
                                   border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <Printer size={10}/>
                      </button>
                    )}
                    {e.estado === 'cancelado' && (
                      <button
                        onClick={() => window.confirm('¿Eliminar este encargo cancelado?') && eliminarEncargo(e.id)}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400
                                   border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-1">
                        <Trash2 size={9}/> Eliminar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SEPARES ── */}
        {tab === 'separes' && (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Separes</p>
              <button onClick={() => setShowSepare(true)}
                className="flex items-center gap-1 text-xs text-brand-teal hover:text-white transition-colors font-semibold">
                <Plus size={12}/> Nuevo separe
              </button>
            </div>

            {loadSep ? (
              <p className="text-center py-8 text-gray-600 text-sm">Cargando…</p>
            ) : separes.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-gray-600">
                <ShoppingBag size={28} className="opacity-20"/>
                <p className="text-sm">Sin separes registrados</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {separes.map(s => (
                  <div key={s.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{s.producto?.nombre ?? '—'}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Cantidad: {s.cantidad} {s.producto?.unidad_venta ?? 'u'}
                          {s.fecha_limite && ` · Límite: ${fmtFecha(s.fecha_limite)}`}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Total: {fmt(s.precio_acordado)} · Anticipo: {fmt(s.anticipo)}
                          {' '}· Saldo: {fmt(Math.max(0, s.precio_acordado - s.anticipo))}
                        </p>
                      </div>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0',
                        ESTADO_COLOR[s.estado] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20')}>
                        {s.estado}
                      </span>
                    </div>

                    {s.estado === 'activo' && (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => entregarSepare(s.id)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-brand-teal/10 text-brand-teal
                                     border border-brand-teal/20 hover:bg-brand-teal/20 transition-colors">
                          Entregar ✓
                        </button>
                        <button onClick={() => cancelarSepare(s.id)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400
                                     border border-red-500/20 hover:bg-red-500/20 transition-colors">
                          Cancelar
                        </button>
                        <button
                          onClick={() => imprimirComprobante('Comprobante Separe', [
                            ['Cliente',    cliente.nombre],
                            ['Producto',   s.producto?.nombre ?? '—'],
                            ['Cantidad',   `${s.cantidad} ${s.producto?.unidad_venta ?? 'u'}`],
                            ['Total',      fmt(s.precio_acordado)],
                            ['Anticipo',   fmt(s.anticipo)],
                            ['Saldo',      fmt(Math.max(0, s.precio_acordado - s.anticipo))],
                            ['Fecha límite', s.fecha_limite ? fmtFecha(s.fecha_limite) : '—'],
                          ])}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-400
                                     border border-white/10 hover:bg-white/10 transition-colors"
                        >
                          <Printer size={10}/>
                        </button>
                      </div>
                    )}
                    {s.estado === 'cancelado' && (
                      <button
                        onClick={() => window.confirm('¿Eliminar este separe cancelado?') && eliminarSepare(s.id)}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400
                                   border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-1">
                        <Trash2 size={9}/> Eliminar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-white/10">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-white/10 text-gray-400
                       text-sm hover:bg-white/5 transition-colors">
            Cerrar
          </button>
        </div>
      </div>

      {/* ── Modal abonar ── */}
      {showAbonar && (
        <ModalAbonar
          cliente={cliente}
          ventaPreseleccionada={ventaAbonar}
          ventasPendientes={saldo?.ventas ?? []}
          onClose={() => { setShowAbonar(false); setVentaAbonar(null) }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['cliente-saldo', cliente.id] })
            setShowAbonar(false)
            setVentaAbonar(null)
          }}
        />
      )}

      {/* ── Modal nuevo encargo ── */}
      {showEncargo && (
        <ModalEncargo
          cliente={cliente}
          onClose={() => setShowEncargo(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['encargos', cliente.id] })
            setShowEncargo(false)
          }}
        />
      )}

      {/* ── Modal nuevo separe ── */}
      {showSepare && (
        <ModalSepare
          cliente={cliente}
          onClose={() => setShowSepare(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['separes', cliente.id] })
            setShowSepare(false)
          }}
        />
      )}

      {/* ── Modal deuda manual ── */}
      {showDeuda && (
        <ModalDeudaManual
          cliente={cliente}
          onClose={() => setShowDeuda(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['cliente-saldo', cliente.id] })
            setShowDeuda(false)
          }}
        />
      )}
    </div>
  )
}

// ── Modal Deuda Manual ────────────────────────────────────────
function ModalDeudaManual({ cliente, onClose, onSuccess }: { cliente:Cliente; onClose:()=>void; onSuccess:()=>void }) {
  const [monto,       setMonto]       = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [notas,       setNotas]       = useState('')

  const { mutate: registrar, isPending } = useMutation({
    mutationFn: () => api.post(`/berlin/clientes/${cliente.id}/deuda-manual`, {
      monto:       parseInt(monto.replace(/\D/g,'')),
      descripcion: descripcion.trim(),
      notas:       notas.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Deuda registrada en el saldo del cliente ✅')
      onSuccess()
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al registrar deuda')
    },
  })

  const montoNum = parseInt(monto.replace(/\D/g,'')) || 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-400"/>
            <h3 className="text-white font-bold">Registrar Deuda Manual</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Cliente: <span className="text-white font-semibold">{cliente.nombre}</span>
          </p>
          <p className="text-[11px] text-orange-300/70 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
            Úsalo para registrar un cobro o deuda que no fue generada desde el POS (ej: servicio, reparación, encargo ya entregado sin cobrar).
          </p>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Descripción *</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Torta cumpleaños pedido anterior"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50"/>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Monto *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input type="text" inputMode="numeric"
                value={monto ? Number(monto.replace(/\D/g,'')).toLocaleString('es-CO') : ''}
                onChange={e => setMonto(e.target.value.replace(/\D/g,''))}
                placeholder="0"
                className="w-full bg-brand-dark border border-white/10 rounded-xl pl-7 pr-4 py-3 text-white font-bold text-lg focus:outline-none focus:border-orange-500/50"/>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Notas adicionales (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones…"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500/50"/>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm">Cancelar</button>
          <button disabled={!montoNum || !descripcion.trim() || isPending} onClick={() => registrar()}
            className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm disabled:opacity-40">
            {isPending ? 'Registrando…' : 'Registrar deuda'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Abonar ──────────────────────────────────────────────
function ModalAbonar({ cliente, ventaPreseleccionada, ventasPendientes, onClose, onSuccess }: {
  cliente: Cliente
  ventaPreseleccionada: VentaCredito | null
  ventasPendientes: VentaCredito[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [monto,      setMonto]      = useState('')
  const [metodo,     setMetodo]     = useState('efectivo')
  const [notas,      setNotas]      = useState('')
  const [ventaId,    setVentaId]    = useState(ventaPreseleccionada?.id ?? '')

  const { mutate: abonar, isPending } = useMutation({
    mutationFn: () => api.post(`/berlin/clientes/${cliente.id}/abonar`, {
      monto:       parseInt(monto.replace(/\D/g, '')),
      tipo:        ventaId ? 'por_factura' : 'parcial',
      venta_id:    ventaId || undefined,
      metodo_pago: metodo,
      notas:       notas.trim() || undefined,
    }),
    onSuccess: (res) => {
      toast.success(`Abono registrado: ${fmt(res.data.monto)}`)
      imprimirComprobante('Comprobante Abono', [
        ['Cliente',  cliente.nombre],
        ['Monto',    fmt(res.data.monto)],
        ['Método',   metodo],
        ['Fecha',    new Date().toLocaleDateString('es-CO')],
        ['Notas',    notas || '—'],
      ])
      onSuccess()
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al registrar abono')
    },
  })

  const montoNum = parseInt(monto.replace(/\D/g, '')) || 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ArrowDownCircle size={16} className="text-blue-400"/>
            <h3 className="text-white font-bold">Registrar Abono</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center
            text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X size={16}/>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {ventasPendientes.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Aplicar a factura (opcional)</label>
              <select value={ventaId} onChange={e => setVentaId(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3
                           text-sm text-white focus:outline-none focus:border-blue-500/50">
                <option value="">Abono general al saldo</option>
                {ventasPendientes.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.numero_venta} — Debe: {fmt(v.saldo_pendiente)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Monto a abonar *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input type="text" inputMode="numeric"
                value={monto ? Number(monto.replace(/\D/g,'')).toLocaleString('es-CO') : ''}
                onChange={e => setMonto(e.target.value.replace(/\D/g,''))}
                placeholder="0"
                className="w-full bg-brand-dark border border-white/10 rounded-xl pl-7 pr-4 py-3
                           text-white font-bold text-lg focus:outline-none focus:border-blue-500/50"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['efectivo','transferencia','otro'].map(m => (
              <button key={m} type="button" onClick={() => setMetodo(m)}
                className={cn('py-2 rounded-xl border text-xs font-medium capitalize transition-all',
                  metodo === m
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                    : 'bg-brand-dark border-white/10 text-gray-400 hover:border-white/20')}>
                {m === 'transferencia' ? 'Pago Electrónico' : m}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones…"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5
                         text-sm text-white focus:outline-none focus:border-blue-500/50"/>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button disabled={!montoNum || isPending} onClick={() => abonar()}
            className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white
                       font-bold text-sm disabled:opacity-40 transition-colors">
            {isPending ? 'Guardando…' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Nuevo Encargo ───────────────────────────────────────
function ModalEncargo({ cliente, onClose, onSuccess }: { cliente:Cliente; onClose:()=>void; onSuccess:()=>void }) {
  const [busqueda,    setBusqueda]    = useState('')
  const [productoSel, setProductoSel] = useState<Producto | null>(null)
  const [mostrar,     setMostrar]     = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [cantidad,    setCantidad]    = useState('1')
  const [precio,      setPrecio]      = useState('')
  const [anticipo,    setAnticipo]    = useState('')
  const [fechaEnt,    setFechaEnt]    = useState('')
  const [notas,       setNotas]       = useState('')

  const { data: resultados = [] } = useQuery<Producto[]>({
    queryKey: ['enc-busqueda', busqueda],
    queryFn:  () => api.get('/berlin/productos', { params: { q: busqueda, limit: 8 } }).then(r => r.data),
    enabled:  busqueda.length >= 1 && !productoSel,
  })

  const seleccionarProducto = (p: Producto) => {
    setProductoSel(p)
    setBusqueda(p.nombre)
    setMostrar(false)
    if (!descripcion.trim()) setDescripcion(p.nombre)
    if (!precio) setPrecio(String(p.precio_venta ?? ''))
  }

  const limpiarProducto = () => {
    setProductoSel(null)
    setBusqueda('')
  }

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/encargos', {
      cliente_id:      cliente.id,
      descripcion:     descripcion.trim(),
      cantidad:        Number(cantidad),
      precio_acordado: parseInt(precio.replace(/\D/g,'')) || 0,
      anticipo:        parseInt(anticipo.replace(/\D/g,'')) || 0,
      fecha_entrega:   fechaEnt,
      notas:           notas.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Encargo registrado ✅')
      imprimirComprobante('Comprobante Encargo', [
        ['Cliente',        cliente.nombre],
        ['Descripción',    descripcion],
        ['Cantidad',       cantidad],
        ['Total acordado', fmt(parseInt(precio.replace(/\D/g,'')) || 0)],
        ['Anticipo',       fmt(parseInt(anticipo.replace(/\D/g,'')) || 0)],
        ['Saldo pendiente',fmt(Math.max(0, (parseInt(precio.replace(/\D/g,'')) || 0) - (parseInt(anticipo.replace(/\D/g,'')) || 0)))],
        ['Fecha entrega',  fechaEnt],
      ])
      onSuccess()
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al crear encargo')
    },
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
      <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-brand-teal"/>
            <h3 className="text-white font-bold">Nuevo Encargo</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500">Cliente: <span className="text-white font-semibold">{cliente.nombre}</span></p>

          {/* Búsqueda en inventario */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Buscar en inventario (opcional)</label>
            {productoSel ? (
              <div className="flex items-center gap-3 bg-brand-dark rounded-xl px-4 py-3 border border-brand-teal/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold">{productoSel.nombre}</p>
                  <p className="text-[10px] text-gray-500">Stock: {productoSel.stock_actual} · {fmt(productoSel.precio_venta)}</p>
                </div>
                <button onClick={limpiarProducto} className="text-gray-500 hover:text-red-400"><X size={14}/></button>
              </div>
            ) : (
              <div className="relative">
                <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setMostrar(true) }}
                  onFocus={() => setMostrar(true)}
                  placeholder="Buscar producto en inventario…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal/50"/>
                {mostrar && busqueda.length >= 1 && resultados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#0D1B2A] border border-white/15 rounded-xl shadow-2xl z-10 overflow-hidden">
                    {resultados.map(p => (
                      <button key={p.id} type="button" onClick={() => seleccionarProducto(p)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.nombre}</p>
                          <p className="text-[10px] text-gray-500">Stock: {p.stock_actual} · {fmt(p.precio_venta)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Descripción editable */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Descripción del encargo *</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Torta de cumpleaños Red Velvet"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Cantidad</label>
              <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Fecha entrega *</label>
              <input type="date" value={fechaEnt} onChange={e => setFechaEnt(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Precio acordado</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                <input type="text" inputMode="numeric"
                  value={precio ? Number(precio.replace(/\D/g,'')).toLocaleString('es-CO') : ''}
                  onChange={e => setPrecio(e.target.value.replace(/\D/g,''))}
                  placeholder={productoSel ? String(productoSel.precio_venta) : '0'}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Anticipo *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                <input type="text" inputMode="numeric"
                  value={anticipo ? Number(anticipo.replace(/\D/g,'')).toLocaleString('es-CO') : ''}
                  onChange={e => setAnticipo(e.target.value.replace(/\D/g,''))}
                  placeholder="Monto anticipo"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones…"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm">Cancelar</button>
          <button disabled={!descripcion.trim() || !fechaEnt || !(parseInt(anticipo.replace(/\D/g,'')) > 0) || isPending} onClick={() => crear()}
            className="flex-1 py-3 rounded-xl bg-brand-teal hover:bg-[#00A882] text-brand-dark font-bold text-sm disabled:opacity-40">
            {isPending ? 'Guardando…' : 'Crear encargo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Nuevo Separe ────────────────────────────────────────
function ModalSepare({ cliente, onClose, onSuccess }: { cliente:Cliente; onClose:()=>void; onSuccess:()=>void }) {
  const [busqueda,  setBusqueda]  = useState('')
  const [producto,  setProducto]  = useState<Producto | null>(null)
  const [mostrar,   setMostrar]   = useState(false)
  const [cantidad,  setCantidad]  = useState('1')
  const [precio,    setPrecio]    = useState('')
  const [anticipo,  setAnticipo]  = useState('')
  const [fechaLim,  setFechaLim]  = useState('')
  const [notas,     setNotas]     = useState('')

  const { data: resultados = [] } = useQuery<Producto[]>({
    queryKey: ['sep-busqueda', busqueda],
    queryFn:  () => api.get('/berlin/productos', { params: { q: busqueda, limit: 8 } }).then(r => r.data),
    enabled:  busqueda.length >= 1 && !producto,
  })

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/separes', {
      cliente_id:      cliente.id,
      producto_id:     producto!.id,
      cantidad:        Number(cantidad),
      precio_acordado: parseInt(precio.replace(/\D/g,'')) || producto?.precio_venta || 0,
      anticipo:        parseInt(anticipo.replace(/\D/g,'')) || 0,
      fecha_limite:    fechaLim || undefined,
      notas:           notas.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Separe registrado ✅')
      imprimirComprobante('Comprobante Separe', [
        ['Cliente',    cliente.nombre],
        ['Producto',   producto?.nombre ?? '—'],
        ['Cantidad',   cantidad],
        ['Total',      fmt(parseInt(precio.replace(/\D/g,'')) || producto?.precio_venta || 0)],
        ['Anticipo',   fmt(parseInt(anticipo.replace(/\D/g,'')) || 0)],
        ['Fecha límite', fechaLim || 'Sin fecha'],
      ])
      onSuccess()
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'Error al crear separe')
    },
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 overflow-y-auto">
      <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} className="text-purple-400"/>
            <h3 className="text-white font-bold">Nuevo Separe</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500">Cliente: <span className="text-white font-semibold">{cliente.nombre}</span></p>

          {/* Producto */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Producto a apartar *</label>
            {producto ? (
              <div className="flex items-center gap-3 bg-brand-dark rounded-xl px-4 py-3 border border-purple-500/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold">{producto.nombre}</p>
                  <p className="text-[10px] text-gray-500">Stock: {producto.stock_actual}</p>
                </div>
                <button onClick={() => { setProducto(null); setBusqueda(''); setPrecio('') }}
                  className="text-gray-500 hover:text-red-400"><X size={14}/></button>
              </div>
            ) : (
              <div className="relative">
                <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setMostrar(true) }}
                  onFocus={() => setMostrar(true)}
                  placeholder="Buscar producto en inventario…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"/>
                {mostrar && busqueda.length >= 1 && resultados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#0D1B2A] border border-white/15 rounded-xl shadow-2xl z-10 overflow-hidden">
                    {resultados.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { setProducto(p); setBusqueda(p.nombre); setMostrar(false); setPrecio(String(p.precio_venta)) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.nombre}</p>
                          <p className="text-[10px] text-gray-500">Stock: {p.stock_actual} · {fmt(p.precio_venta)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Cantidad</label>
              <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"/>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Fecha límite *</label>
              <input type="date" value={fechaLim} onChange={e => setFechaLim(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Precio acordado</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                <input type="text" inputMode="numeric"
                  value={precio ? Number(precio.replace(/\D/g,'')).toLocaleString('es-CO') : ''}
                  onChange={e => setPrecio(e.target.value.replace(/\D/g,''))}
                  placeholder={producto ? String(producto.precio_venta) : '0'}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"/>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Anticipo *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                <input type="text" inputMode="numeric"
                  value={anticipo ? Number(anticipo.replace(/\D/g,'')).toLocaleString('es-CO') : ''}
                  onChange={e => setAnticipo(e.target.value.replace(/\D/g,''))}
                  placeholder="Monto anticipo"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl pl-6 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"/>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones…"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"/>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm">Cancelar</button>
          <button disabled={!producto || !fechaLim || !(parseInt(anticipo.replace(/\D/g,'')) > 0) || isPending} onClick={() => crear()}
            className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm disabled:opacity-40">
            {isPending ? 'Guardando…' : 'Crear separe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL CLIENTES
// ══════════════════════════════════════════════════════════════
const EMPTY = { nombre:'', telefono:'', email:'', direccion:'' }

interface Resumen { total_cartera: number; clientes_con_deuda: number; ids_con_deuda: string[]; separes_activos: number; encargos_pendientes: number }

export default function ClientesPage() {
  const qc = useQueryClient()
  const [showModal,   setShowModal]   = useState(false)
  const [editando,    setEditando]    = useState<Cliente | null>(null)
  const [form,        setForm]        = useState(EMPTY)
  const [busqueda,    setBusqueda]    = useState('')
  const [clienteSel,  setClienteSel]  = useState<Cliente | null>(null)
  const [soloDeuda,   setSoloDeuda]   = useState(false)

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', busqueda],
    queryFn:  () => api.get('/berlin/clientes', { params: busqueda ? { q: busqueda } : {} }).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: resumen } = useQuery<Resumen>({
    queryKey: ['clientes-resumen'],
    queryFn:  () => api.get('/berlin/clientes/resumen').then(r => r.data),
    refetchInterval: 60_000,
  })

  const clientesFiltrados = soloDeuda && resumen?.ids_con_deuda
    ? clientes.filter(c => resumen.ids_con_deuda.includes(c.id))
    : clientes

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: () => editando
      ? api.put(`/berlin/clientes/${editando.id}`, form)
      : api.post('/berlin/clientes', form),
    onSuccess: () => {
      toast.success(editando ? 'Cliente actualizado' : 'Cliente creado')
      qc.invalidateQueries({ queryKey: ['clientes'] })
      cerrarModal()
    },
    onError: () => toast.error('Error al guardar'),
  })

  const { mutate: eliminarCliente } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/clientes/${id}`),
    onSuccess: () => {
      toast.success('Cliente eliminado')
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['clientes-resumen'] })
    },
    onError: (err: unknown) => {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error
      toast.error(msg || 'No se puede eliminar')
    },
  })

  const confirmarEliminar = (e: React.MouseEvent, c: Cliente) => {
    e.stopPropagation()
    if (window.confirm(`¿Eliminar a "${c.nombre}"?\n\nSolo se puede eliminar si no tiene deuda, separes ni encargos pendientes.`)) {
      eliminarCliente(c.id)
    }
  }

  const cerrarModal = () => { setShowModal(false); setEditando(null); setForm(EMPTY) }

  const abrirEditar = (c: Cliente) => {
    setEditando(c)
    setForm({ nombre: c.nombre, telefono: c.telefono??'', email: c.email??'', direccion: c.direccion??'' })
    setShowModal(true)
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-pink-400"/>
          <h2 className="text-lg font-bold text-white">Clientes</h2>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400
                     border border-pink-500/30 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium min-h-[44px]">
          <Plus size={16}/> Nuevo cliente
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-brand-navy rounded-xl border border-white/5 p-4 flex items-center gap-3">
          <Users size={18} className="text-pink-400 flex-shrink-0"/>
          <div>
            <p className="text-[10px] text-gray-500">Total clientes</p>
            <p className="text-xl font-bold text-white">{clientes.length}</p>
          </div>
        </div>
        <button onClick={() => setSoloDeuda(v => !v)}
          className={cn('rounded-xl border p-4 flex items-center gap-3 transition-colors text-left',
            soloDeuda ? 'bg-red-500/15 border-red-500/40' : 'bg-brand-navy border-white/5 hover:bg-red-500/10')}>
          <CreditCard size={18} className="text-red-400 flex-shrink-0"/>
          <div>
            <p className="text-[10px] text-gray-500">Cartera · {resumen?.clientes_con_deuda ?? 0} clientes</p>
            <p className="text-lg font-bold text-red-400">{fmt(resumen?.total_cartera ?? 0)}</p>
          </div>
        </button>
        <div className="bg-brand-navy rounded-xl border border-white/5 p-4 flex items-center gap-3">
          <ShoppingBag size={18} className="text-purple-400 flex-shrink-0"/>
          <div>
            <p className="text-[10px] text-gray-500">Separes activos</p>
            <p className="text-xl font-bold text-white">{resumen?.separes_activos ?? 0}</p>
          </div>
        </div>
        <div className="bg-brand-navy rounded-xl border border-white/5 p-4 flex items-center gap-3">
          <CalendarClock size={18} className="text-brand-teal flex-shrink-0"/>
          <div>
            <p className="text-[10px] text-gray-500">Encargos pendientes</p>
            <p className="text-xl font-bold text-white">{resumen?.encargos_pendientes ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            className="w-full bg-brand-navy border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white
                       placeholder:text-gray-600 focus:outline-none focus:border-pink-500/50 min-h-[44px]"/>
        </div>
        {soloDeuda && (
          <button onClick={() => setSoloDeuda(false)}
            className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-1">
            <X size={11}/> Con deuda
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-600">
            <p className="text-sm">Cargando…</p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
            <Users size={36} className="opacity-20"/>
            <p className="text-sm">{busqueda ? 'Sin resultados' : soloDeuda ? 'Ningún cliente con deuda' : 'No hay clientes registrados'}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {clientesFiltrados.map(c => {
              const tieneDeuda = resumen?.ids_con_deuda.includes(c.id)
              return (
                <div key={c.id}
                  className="flex items-center gap-3 p-4 hover:bg-white/2 transition-colors cursor-pointer"
                  onClick={() => setClienteSel(c)}
                >
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0',
                    tieneDeuda ? 'bg-red-500/15 text-red-400' : 'bg-pink-500/10 text-pink-400')}>
                    {c.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{c.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.telefono && (
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Phone size={9}/>{c.telefono}
                        </p>
                      )}
                      {tieneDeuda && <span className="text-[9px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded font-bold">CON DEUDA</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); imprimirComprobante(`Estado cliente: ${c.nombre}`, [
                      ['Cliente', c.nombre],
                      ['Teléfono', c.telefono ?? '—'],
                      ['Email', c.email ?? '—'],
                      ['Saldo deuda', tieneDeuda ? 'Tiene saldo pendiente' : 'Sin deudas'],
                    ])}}
                      className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-gray-300 hover:bg-white/10 rounded-lg transition-colors">
                      <Printer size={13}/>
                    </button>
                    <button onClick={e => { e.stopPropagation(); abrirEditar(c) }}
                      className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-pink-400
                                 hover:bg-pink-500/10 rounded-lg transition-colors">
                      <Edit2 size={13}/>
                    </button>
                    {!tieneDeuda && (
                      <button onClick={e => confirmarEliminar(e, c)}
                        className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-red-400
                                   hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 size={13}/>
                      </button>
                    )}
                    <ChevronRight size={14} className="text-gray-600"/>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detalle cliente (modal con tabs) */}
      {clienteSel && (
        <ClienteDetalle cliente={clienteSel} onClose={() => setClienteSel(null)} />
      )}

      {/* Modal crear / editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#112240] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">{editando ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={cerrarModal}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
                <X size={18}/>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {([['nombre','Nombre *'],['telefono','Teléfono'],['email','Email'],['direccion','Dirección']] as [string,string][]).map(([k,label]) => (
                <div key={k}>
                  <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
                  <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                               focus:outline-none focus:border-pink-500/50 min-h-[48px]"/>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={cerrarModal}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">Cancelar</button>
              <button disabled={!form.nombre || isPending} onClick={() => guardar()}
                className="flex-1 py-3 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm disabled:opacity-40 min-h-[48px]">
                {isPending ? 'Guardando…' : editando ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
