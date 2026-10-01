import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { fmtDinero, soloDigitos } from '../../../lib/dinero'
import toast from 'react-hot-toast'
import { Receipt, Plus, Trash2, X, TrendingDown, Calendar, Tag, Printer } from 'lucide-react'
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const CATS = [
  { value: 'arriendo',      label: 'Arriendo',     color: '#EF4444' },
  { value: 'servicios',     label: 'Servicios',    color: '#F97316' },
  { value: 'nomina',        label: 'Nómina',       color: '#EAB308' },
  { value: 'insumos',       label: 'Insumos',      color: '#22C55E' },
  { value: 'mantenimiento', label: 'Mantenimiento',color: '#3B82F6' },
  { value: 'publicidad',    label: 'Publicidad',   color: '#A855F7' },
  { value: 'transporte',    label: 'Transporte',   color: '#06B6D4' },
  { value: 'general',       label: 'General',      color: '#6B7280' },
  { value: 'otro',          label: 'Otro',         color: '#9CA3AF' },
]

interface Gasto {
  id: string; fecha: string; concepto: string; categoria: string
  monto: number; metodo_pago: string; notas?: string
  created_at?: string
  registrado_por_user?: { id: string; nombre: string } | null
}

// El concepto y las notas los escribe el cajero y se meten en el HTML de la ventana de impresión
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Pago Electrónico',
}

// Comprobante de egreso — tiquete térmico 80mm. Mismas reglas que el resto de tiquetes de Berlín:
// Arial en negrita, letra de 13px o más y todo en negro (la térmica no imprime grises ni colores).
function imprimirGasto(g: Gasto) {
  const win = window.open('', '_blank', 'width=440,height=640')
  if (!win) { toast.error('El navegador bloqueó la ventana de impresión'); return }
  const origin  = window.location.origin
  const cat     = CATS.find(c => c.value === g.categoria)?.label ?? g.categoria
  const fecha   = new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora    = g.created_at
    ? new Date(g.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : fecha
  const metodo  = METODO_LABEL[g.metodo_pago] ?? g.metodo_pago
  const quien   = g.registrado_por_user?.nombre

  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante de gasto</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  @page { margin:5mm; size:80mm auto }
  body { font-family:Arial,sans-serif; font-weight:600; font-size:14px; width:100%; color:#000 }
  .c { text-align:center } .b { font-weight:bold } .sm { font-size:13px }
  .sep  { border-top:1px dashed #000; margin:6px 0 }
  .sep2 { border-top:2px solid #000; margin:6px 0 }
  .row { display:flex; justify-content:space-between; gap:4px; padding:2px 0 }
  .row span:last-child { flex-shrink:0; text-align:right; font-weight:bold }
  .total { font-size:17px }
  img.logo { display:block; margin:4px auto; max-width:60mm; height:auto; max-height:20mm; object-fit:contain }
</style></head><body onload="window.print();setTimeout(function(){window.close()},800)">
<img class="logo" src="${origin}/logos/berlin.png" alt="Berlín Café Bar" />
<div class="c" style="margin-bottom:4px">
  <p class="b">*Café Bar Berlín*</p>
  <p class="sm">NIT: 1035424712-4</p>
  <p class="sm">Calle 28 #30-19 · Don Matías, Antioquia</p>
  <p class="sm">Tel: 3215994825</p>
</div>
<div class="sep2"></div>
<div class="c"><p class="b" style="font-size:16px">COMPROBANTE DE GASTO</p></div>
<div class="sep2"></div>
<div class="row sm"><span>Fecha:</span><span>${esc(hora)}</span></div>
<div class="row sm"><span>Ref:</span><span>${esc(g.id.slice(0, 8).toUpperCase())}</span></div>
<div class="sep"></div>
<p class="sm">Concepto:</p>
<p class="b" style="margin-bottom:4px">${esc(g.concepto)}</p>
<div class="row sm"><span>Categoría:</span><span>${esc(cat)}</span></div>
<div class="row sm"><span>Método de pago:</span><span>${esc(metodo)}</span></div>
${g.notas ? `<p class="sm" style="margin-top:3px">Notas: ${esc(g.notas)}</p>` : ''}
<div class="sep2"></div>
<div class="row total b"><span>TOTAL EGRESO:</span><span>${esc(fmt(Number(g.monto)))}</span></div>
<div class="sep2"></div>
${quien ? `<div class="row sm"><span>Registrado por:</span><span>${esc(quien)}</span></div>` : ''}
<div class="c sm" style="margin-top:6px"><p>Sistema Kalreco v1.0</p></div>
</body></html>`)
  win.document.close()
}

export default function GastosPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [catFiltro, setCatFiltro] = useState('')
  const [form, setForm] = useState({ concepto:'', categoria:'general', monto:'', metodo_pago:'efectivo', notas:'' })

  const { data: gastos = [], isLoading } = useQuery<Gasto[]>({
    queryKey: ['gastos', catFiltro],
    queryFn:  () => api.get('/berlin/gastos', { params: catFiltro ? { categoria: catFiltro } : {} }).then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: resumen } = useQuery<{ totalHoy: number; totalMes: number }>({
    queryKey: ['gastos-resumen'],
    queryFn:  () => api.get('/berlin/gastos/resumen').then(r => r.data),
    refetchInterval: 30_000,
  })

  // Un gasto cambia el efectivo de la caja y el Libro Diario: refrescar esas pantallas al instante
  // (si no, con el staleTime/polling muestran el valor anterior hasta por un minuto).
  const refrescarCajaYLibro = () => {
    ;['ventas-turno-actual', 'pan-gran-bolsa', 'pan-libro-diario', 'pan-movimientos-resumen', 'pan-movimientos-todos']
      .forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  }

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/gastos', { ...form, monto: parseFloat(form.monto) }),
    onSuccess: () => {
      toast.success('Gasto registrado')
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['gastos-resumen'] })
      refrescarCajaYLibro()
      setShowModal(false)
      setForm({ concepto:'', categoria:'general', monto:'', metodo_pago:'efectivo', notas:'' })
    },
    onError: () => toast.error('Error al registrar el gasto'),
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/gastos/${id}`),
    onSuccess: () => {
      toast.success('Gasto eliminado')
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['gastos-resumen'] })
      refrescarCajaYLibro()
    },
  })

  const catInfo = (v: string) => CATS.find(c => c.value === v) ?? CATS[7]

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Receipt size={20} className="text-orange-400" />
          <h2 className="text-lg font-bold text-white">Gastos</h2>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400
                     border border-orange-500/30 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium min-h-[44px]">
          <Plus size={16} /> Registrar gasto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Gastos hoy', value: resumen?.totalHoy ?? 0, icon: Calendar, color: 'text-orange-400' },
          { label: 'Gastos del mes', value: resumen?.totalMes ?? 0, icon: TrendingDown, color: 'text-red-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-brand-navy rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <p className="text-[11px] text-gray-500">{label}</p>
            </div>
            <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Filtro categorías */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setCatFiltro('')}
          className={cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 min-h-[36px] transition-colors border',
            catFiltro === '' ? 'bg-orange-500 text-white border-transparent' : 'bg-brand-navy text-gray-400 border-white/10')}>
          Todos
        </button>
        {CATS.map(c => (
          <button key={c.value} onClick={() => setCatFiltro(catFiltro === c.value ? '' : c.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 min-h-[36px] transition-colors border',
              catFiltro === c.value ? 'text-white border-transparent' : 'bg-brand-navy text-gray-400 border-white/10')}
            style={catFiltro === c.value ? { background: c.color } : {}}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-600"><p className="text-sm">Cargando…</p></div>
        ) : gastos.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
            <Receipt size={36} className="opacity-20" />
            <p className="text-sm">No hay gastos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {gastos.map(g => {
              const cat = catInfo(g.categoria)
              return (
                <div key={g.id} className="flex items-center gap-3 p-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${cat.color}18` }}>
                    <Tag size={14} style={{ color: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{g.concepto}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {cat.label} · {new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-red-400 tabular-nums flex-shrink-0">{fmt(g.monto)}</p>
                  <button onClick={() => imprimirGasto(g)} title="Imprimir comprobante"
                    className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-orange-400
                               hover:bg-orange-500/10 rounded-lg transition-colors flex-shrink-0">
                    <Printer size={14} />
                  </button>
                  <button onClick={() => { if (confirm('¿Eliminar este gasto?')) eliminar(g.id) }}
                    className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-red-400
                               hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">Registrar gasto</h3>
              <button onClick={() => setShowModal(false)}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Concepto *</label>
                <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Pago de luz, compra de harina…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50 min-h-[48px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Categoría *</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-sm text-white
                               focus:outline-none focus:border-orange-500/50 min-h-[48px]">
                    {CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Método pago</label>
                  <select value={form.metodo_pago} onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-sm text-white
                               focus:outline-none focus:border-orange-500/50 min-h-[48px]">
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Pago Electrónico</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Monto *</label>
                <input type="text" inputMode="numeric" value={fmtDinero(form.monto)} onChange={e => setForm(f => ({ ...f, monto: soloDigitos(e.target.value) }))}
                  placeholder="0"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50 min-h-[48px]" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Notas (opcional)</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Observaciones…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50 min-h-[48px]" />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 text-sm min-h-[48px]">
                Cancelar
              </button>
              <button disabled={!form.concepto || !form.monto || isPending} onClick={() => crear()}
                className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold
                           text-sm transition-colors disabled:opacity-40 min-h-[48px]">
                {isPending ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
