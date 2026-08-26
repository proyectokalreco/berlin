import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import toast from 'react-hot-toast'
import { Receipt, Plus, Trash2, X, TrendingDown, Calendar, Tag } from 'lucide-react'
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

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/gastos', { ...form, monto: parseFloat(form.monto) }),
    onSuccess: () => {
      toast.success('Gasto registrado')
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['gastos-resumen'] })
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
          <div className="bg-[#112240] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
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
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Monto *</label>
                <input type="number" min="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
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
