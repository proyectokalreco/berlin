import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trash2, Plus, X, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { api } from '../../../lib/api'
import toast from 'react-hot-toast'
import type { Producto } from '../../../types'
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n)
const fmtPeso = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const MOTIVOS: { value: string; label: string; color: string }[] = [
  { value: 'mala_coccion',  label: 'Mala cocción',  color: 'text-orange-400' },
  { value: 'accidente',     label: 'Accidente',      color: 'text-red-400'    },
  { value: 'vencimiento',   label: 'Vencimiento',    color: 'text-yellow-400' },
  { value: 'devolucion',    label: 'Devolución',     color: 'text-blue-400'   },
  { value: 'prueba',        label: 'Prueba/Degustación', color: 'text-purple-400' },
  { value: 'otro',          label: 'Otro',           color: 'text-gray-400'   },
]

function isEmojiIcon(s?: string | null) {
  return !!s && !s.startsWith('http') && s.length <= 8
}

interface Merma {
  id:           string
  fecha:        string
  cantidad:     number
  motivo:       string
  descripcion:  string | null
  valor_perdida: number
  producto:     { id: string; nombre: string; imagen_url?: string; unidad_venta?: string } | null
  usuario:      { id: string; nombre: string; apellido?: string } | null
}

// ── Modal crear merma ─────────────────────────────────────────
function ModalMerma({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [busqueda,  setBusqueda]  = useState('')
  const [producto,  setProducto]  = useState<Producto | null>(null)
  const [mostrarRes, setMostrarRes] = useState(false)
  const [cantidad,  setCantidad]  = useState('')
  const [motivo,    setMotivo]    = useState('mala_coccion')
  const [descripcion, setDescripcion] = useState('')

  const { data: resultados = [] } = useQuery<Producto[]>({
    queryKey: ['productos-busqueda-merma', busqueda],
    queryFn:  () => api.get('/berlin/productos', { params: { q: busqueda, limit: 8 } }).then(r => r.data),
    enabled:  busqueda.length >= 1 && !producto,
  })

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/mermas', {
      producto_id:  producto!.id,
      cantidad:     parseFloat(cantidad),
      motivo,
      descripcion:  descripcion.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Merma registrada ✅')
      qc.invalidateQueries({ queryKey: ['mermas'] })
      qc.invalidateQueries({ queryKey: ['mermas-resumen'] })
      qc.invalidateQueries({ queryKey: ['productos-busqueda-merma'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al registrar merma')
    },
  })

  const canSave = !!producto && parseFloat(cantidad) > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4
                    bg-black/60 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" />
            <h3 className="text-white font-bold">Registrar Merma</h3>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl
                       text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Producto */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">
              Producto <span className="text-red-400">*</span>
            </label>
            {producto ? (
              <div className="flex items-center gap-3 bg-brand-dark rounded-xl px-4 py-3
                              border border-yellow-500/30">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center
                                overflow-hidden flex-shrink-0">
                  {producto.imagen_url && !isEmojiIcon(producto.imagen_url)
                    ? <img src={producto.imagen_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-base">{producto.imagen_url || '🍞'}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-semibold">{producto.nombre}</p>
                  <p className="text-[10px] text-gray-500">Stock: {fmt(producto.stock_actual)}</p>
                </div>
                <button onClick={() => { setProducto(null); setBusqueda('') }}
                  className="text-gray-500 hover:text-red-400 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setMostrarRes(true) }}
                  onFocus={() => setMostrarRes(true)}
                  placeholder="Buscar producto terminado…"
                  autoFocus
                  className="w-full bg-brand-dark border border-white/10 rounded-xl
                             px-4 py-3 text-sm text-white focus:outline-none
                             focus:border-yellow-500/60 placeholder:text-gray-600"
                />
                {mostrarRes && busqueda.length >= 1 && resultados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#1C1A18]
                                  border border-white/15 rounded-xl shadow-2xl z-10 overflow-hidden">
                    {resultados.map(p => (
                      <button key={p.id} type="button"
                        onClick={() => { setProducto(p); setBusqueda(p.nombre); setMostrarRes(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5
                                   hover:bg-white/5 transition-colors text-left"
                      >
                        <span className="text-base w-6 flex-shrink-0 text-center">
                          {p.imagen_url && !isEmojiIcon(p.imagen_url)
                            ? <img src={p.imagen_url} alt="" className="w-5 h-5 rounded object-cover" />
                            : (p.imagen_url || '🍞')
                          }
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{p.nombre}</p>
                          <p className="text-[10px] text-gray-500">Stock: {fmt(p.stock_actual)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">
              Cantidad dañada <span className="text-red-400">*</span>
            </label>
            <input
              type="number" min="0.5" step="0.5"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              placeholder="Ej: 12"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3
                         text-white text-lg font-bold focus:outline-none focus:border-yellow-500/60
                         placeholder:text-gray-600"
            />
            {producto && parseFloat(cantidad) > 0 && (
              <p className="text-[11px] text-yellow-400 mt-1 ml-1">
                Valor perdido ≈ {fmtPeso(parseFloat(cantidad) * (producto.precio_venta ?? 0))}
              </p>
            )}
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Motivo</label>
            <div className="grid grid-cols-2 gap-2">
              {MOTIVOS.map(m => (
                <button key={m.value} type="button"
                  onClick={() => setMotivo(m.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl border text-xs font-medium transition-all text-left',
                    motivo === m.value
                      ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-200'
                      : 'bg-brand-dark border-white/10 text-gray-400 hover:border-white/20',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Descripción (opcional)</label>
            <input
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Moje se quemó por falla en el horno"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3
                         text-sm text-white focus:outline-none focus:border-yellow-500/60
                         placeholder:text-gray-600"
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400
                       text-sm hover:bg-white/5 transition-colors min-h-[48px]">
            Cancelar
          </button>
          <button
            disabled={!canSave || isPending}
            onClick={() => crear()}
            className="flex-1 py-3 rounded-xl bg-yellow-600 hover:bg-yellow-700 text-white
                       font-bold text-sm disabled:opacity-40 transition-colors min-h-[48px]"
          >
            {isPending ? 'Registrando…' : 'Registrar merma'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function MermasPage() {
  const qc = useQueryClient()
  const [showModal,   setShowModal]   = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const { data: resumen } = useQuery({
    queryKey: ['mermas-resumen'],
    queryFn:  () => api.get('/berlin/mermas/resumen').then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: mermas = [], isLoading } = useQuery<Merma[]>({
    queryKey: ['mermas'],
    queryFn:  () => api.get('/berlin/mermas').then(r => r.data),
    enabled:  showHistory || true,
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/mermas/${id}`),
    onSuccess: () => {
      toast.success('Merma eliminada (stock revertido)')
      qc.invalidateQueries({ queryKey: ['mermas'] })
      qc.invalidateQueries({ queryKey: ['mermas-resumen'] })
    },
    onError: () => toast.error('Error al eliminar merma'),
  })

  const hoy = new Date().toISOString().split('T')[0]
  const mermasHoy   = mermas.filter(m => m.fecha === hoy)
  const mermasAntes = mermas.filter(m => m.fecha !== hoy)

  return (
    <div className="space-y-4">

      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-yellow-400" />
          <div>
            <h2 className="text-lg font-bold text-white">Pérdidas</h2>
            <p className="text-xs text-gray-500">Productos dañados, quemados o retirados</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-sm font-bold text-white
                     bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Nueva merma
        </button>
      </div>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
            <p className="text-xs text-gray-500">Pérdida hoy</p>
            <p className="text-xl font-bold text-yellow-400 mt-0.5">
              {fmtPeso(resumen.totalHoy ?? 0)}
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">{resumen.countHoy ?? 0} registro(s)</p>
          </div>
          <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
            <p className="text-xs text-gray-500">Pérdida este mes</p>
            <p className="text-xl font-bold text-orange-400 mt-0.5">
              {fmtPeso(resumen.totalMes ?? 0)}
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">{resumen.countMes ?? 0} registro(s)</p>
          </div>
        </div>
      )}

      {/* Mermas de hoy */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Mermas de hoy
          </p>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-600 text-center py-10">Cargando…</p>
        ) : mermasHoy.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 text-gray-600">
            <AlertTriangle size={28} className="opacity-20" />
            <p className="text-sm">Sin mermas registradas hoy</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {mermasHoy.map(m => (
              <MermaRow key={m.id} merma={m} onEliminar={eliminar} />
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      {mermasAntes.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors py-1"
          >
            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Historial de mermas anteriores
          </button>
          {showHistory && (
            <div className="mt-3 bg-brand-navy rounded-xl border border-white/5 overflow-hidden divide-y divide-white/5">
              {mermasAntes.map(m => (
                <MermaRow key={m.id} merma={m} onEliminar={eliminar} />
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && <ModalMerma onClose={() => setShowModal(false)} />}
    </div>
  )
}

// ── Fila de merma ─────────────────────────────────────────────
function MermaRow({ merma, onEliminar }: { merma: Merma; onEliminar: (id: string) => void }) {
  const motivoInfo = MOTIVOS.find(m => m.value === merma.motivo) ?? MOTIVOS[MOTIVOS.length - 1]

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/2 transition-colors">
      <div className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden
                      bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
        {merma.producto?.imagen_url && !isEmojiIcon(merma.producto.imagen_url)
          ? <img src={merma.producto.imagen_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-lg">{merma.producto?.imagen_url || '🍞'}</span>
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {merma.producto?.nombre ?? '—'}
        </p>
        <p className={cn('text-[10px] mt-0.5', motivoInfo.color)}>
          {motivoInfo.label}
          {merma.descripcion && ` · ${merma.descripcion}`}
        </p>
      </div>

      <div className="text-right flex-shrink-0 min-w-[80px]">
        <p className="text-sm font-bold text-yellow-400 tabular-nums">
          -{fmt(merma.cantidad)} {merma.producto?.unidad_venta ?? 'u'}
        </p>
        <p className="text-[10px] text-gray-600">
          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(merma.valor_perdida)}
        </p>
      </div>

      <button
        onClick={() => onEliminar(merma.id)}
        className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0
                   text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
