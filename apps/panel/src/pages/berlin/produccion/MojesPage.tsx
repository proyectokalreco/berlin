import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../lib/api'
import { cn } from '../../../lib/utils'
import type { Moje } from '../../../types'
import Button from '../../../components/ui/Button'
import toast from 'react-hot-toast'
import {
  FlaskConical, Plus, CheckCircle, AlertTriangle,
  Clock, ChevronDown, ChevronUp, X,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const estadoBadge: Record<string, string> = {
  pendiente:      'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  validado:       'bg-green-500/15  text-green-400  border-green-500/30',
  con_incidencia: 'bg-red-500/15    text-red-400    border-red-500/30',
}
const estadoLabel: Record<string, string> = {
  pendiente:      'Pendiente',
  validado:       'Validado',
  con_incidencia: 'Con incidencia',
}

// ── Modal Validar Moje ─────────────────────────────────────────

function ModalValidar({ moje, onClose }: { moje: Moje; onClose: () => void }) {
  const [cantidadReal, setCantidadReal] = useState(moje.cantidad_esperada.toString())
  const [incidencia, setIncidencia]     = useState(false)
  const [descripcion, setDescripcion]   = useState('')
  const [merma, setMerma]               = useState('0')

  const queryClient = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.patch(`/berlin/mojes/${moje.id}/validar`, {
      cantidad_real:           parseInt(cantidadReal) || 0,
      tiene_incidencia:        incidencia,
      descripcion_incidencia:  descripcion || null,
      cantidad_merma:          parseInt(merma) || 0,
    }),
    onSuccess: (res) => {
      const d = res.data
      toast.success(
        `Moje validado. ${d.cantidad_real} unidades producidas.` +
        (d.costo_produccion > 0 ? ` Costo: ${fmt(d.costo_produccion)}` : '')
      )
      queryClient.invalidateQueries({ queryKey: ['mojes-hoy'] })
      queryClient.invalidateQueries({ queryKey: ['mojes-resumen'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al validar el moje')
    },
  })

  const factor      = moje.receta?.rendimiento
    ? parseInt(cantidadReal) / moje.receta.rendimiento
    : 1
  const productoNom = moje.receta?.producto?.nombre ?? moje.receta?.nombre ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-navy rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Validar moje · {moje.numero_moje}</p>
            <h3 className="text-lg font-bold text-white">{productoNom}</h3>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Info receta */}
          <div className="bg-brand-dark rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between text-gray-400">
              <span>Plan (esperado)</span>
              <span className="text-white font-medium">{moje.cantidad_esperada} unidades</span>
            </div>
            {moje.receta?.temperatura_horno && (
              <div className="flex justify-between text-gray-400">
                <span>Temperatura</span>
                <span className="text-white">{moje.receta.temperatura_horno}°C</span>
              </div>
            )}
            {moje.receta?.tiempo_horno_min && (
              <div className="flex justify-between text-gray-400">
                <span>Tiempo de horno</span>
                <span className="text-white">{moje.receta.tiempo_horno_min} min</span>
              </div>
            )}
          </div>

          {/* Cantidad real */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              ¿Cuántas unidades salieron del horno?
            </label>
            <input
              type="number"
              min="0"
              value={cantidadReal}
              onChange={e => setCantidadReal(e.target.value)}
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-white
                         text-xl font-bold text-center focus:outline-none focus:border-brand-teal transition-colors"
            />
          </div>

          {/* Toggle incidencia */}
          <div>
            <button
              type="button"
              onClick={() => setIncidencia(v => !v)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors',
                incidencia
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-brand-dark border-white/10 text-gray-400 hover:border-white/20'
              )}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} />
                {incidencia ? 'Con incidencia' : 'Sin incidencias'}
              </span>
              {incidencia ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {incidencia && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    ¿Qué pasó? (ej: se quemaron 3, no salieron completas…)
                  </label>
                  <input
                    type="text"
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    placeholder="Describe la incidencia"
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white
                               text-sm focus:outline-none focus:border-red-400 transition-colors placeholder-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Cantidad de merma</label>
                  <input
                    type="number"
                    min="0"
                    value={merma}
                    onChange={e => setMerma(e.target.value)}
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white
                               text-sm focus:outline-none focus:border-red-400 transition-colors"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preview del impacto */}
          {moje.receta?.ingredientes && moje.receta.ingredientes.length > 0 && (
            <div className="bg-brand-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Al confirmar, el sistema descontará:
              </p>
              <div className="space-y-1.5">
                {moje.receta.ingredientes.slice(0, 5).map(ing => (
                  <div key={ing.id} className="flex justify-between text-sm">
                    <span className="text-gray-400">{ing.insumo.nombre}</span>
                    <span className="text-red-400 font-mono">
                      -{(ing.cantidad * factor).toFixed(1)} {ing.unidad}
                    </span>
                  </div>
                ))}
                <div className="pt-1 border-t border-white/5 flex justify-between text-sm mt-2">
                  <span className="text-gray-400">Producto terminado</span>
                  <span className="text-green-400 font-mono">+{cantidadReal} uds</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/5">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            className="flex-1"
            loading={isPending}
            onClick={() => mutate()}
            style={{ background: incidencia ? '#DC2626' : '#00C49A', color: '#1C1A18' }}
          >
            {incidencia ? 'Validar con incidencia' : 'Confirmar validación'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal: Lista de Mojes ──────────────────────────

export default function MojesPage() {
  const navigate       = useNavigate()
  const [fecha, setFecha]   = useState(new Date().toISOString().split('T')[0])
  const [mojeSeleccionado, setMojeSeleccionado] = useState<Moje | null>(null)

  const { data: mojes = [], isLoading } = useQuery<Moje[]>({
    queryKey: ['mojes-hoy', fecha],
    queryFn:  () => api.get('/berlin/mojes', { params: { fecha, limit: 100 } }).then(r => r.data),
  })

  const pendientes  = mojes.filter(m => m.estado === 'pendiente')
  const procesados  = mojes.filter(m => m.estado !== 'pendiente')

  return (
    <div className="space-y-5">

      {/* ── Barra de acciones ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical size={20} className="text-orange-400" />
          <h2 className="text-lg font-bold text-white">Registro de Mojes</h2>
          {mojes.length > 0 && (
            <span className="text-xs bg-brand-navy border border-white/10 px-2 py-0.5 rounded-full text-gray-400">
              {mojes.length} hoy
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                       focus:outline-none focus:border-brand-teal"
          />
          <Button
            onClick={() => navigate('/mojes/nuevo')}
            style={{ background: '#EA580C', color: '#fff' }}
            size="sm"
          >
            <Plus size={16} />
            Registrar Moje
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-gray-500 text-sm">Cargando mojes…</div>
      ) : mojes.length === 0 ? (
        <div className="bg-brand-navy rounded-xl border border-white/5 flex flex-col items-center py-16 gap-3">
          <Clock size={40} className="text-gray-700" />
          <p className="text-gray-400 font-medium">No hay mojes para esta fecha</p>
          <p className="text-gray-600 text-sm">Registra el primer moje del día</p>
          <Button
            onClick={() => navigate('/mojes/nuevo')}
            style={{ background: '#EA580C', color: '#fff' }}
            size="sm"
            className="mt-1"
          >
            <Plus size={15} />
            Registrar Moje
          </Button>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Mojes pendientes */}
          {pendientes.length > 0 && (
            <div className="bg-brand-navy rounded-xl border border-yellow-500/20">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                <Clock size={15} className="text-yellow-400" />
                <h3 className="text-sm font-semibold text-yellow-400">
                  Pendientes de validar ({pendientes.length})
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {pendientes.map(m => (
                  <MojeRow
                    key={m.id}
                    moje={m}
                    onValidar={() => setMojeSeleccionado(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mojes procesados */}
          {procesados.length > 0 && (
            <div className="bg-brand-navy rounded-xl border border-white/5">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                <CheckCircle size={15} className="text-green-400" />
                <h3 className="text-sm font-semibold text-gray-300">
                  Procesados ({procesados.length})
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {procesados.map(m => (
                  <MojeRow key={m.id} moje={m} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de validación */}
      {mojeSeleccionado && (
        <ModalValidar
          moje={mojeSeleccionado}
          onClose={() => setMojeSeleccionado(null)}
        />
      )}
    </div>
  )
}

function MojeRow({ moje, onValidar }: { moje: Moje; onValidar?: () => void }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

  const hora = new Date(moje.fecha_registro).toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
  })
  const productoNom = moje.receta?.producto?.nombre ?? moje.receta?.nombre ?? '—'

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-white/2 transition-colors">
      <div className="w-16 text-xs text-gray-600 font-mono">{hora}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{productoNom}</p>
        <p className="text-xs text-gray-500">{moje.numero_moje}</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-gray-300">
          {moje.estado !== 'pendiente' ? (
            <span className="text-green-400">{moje.cantidad_real}</span>
          ) : (
            moje.cantidad_esperada
          )}{' '}
          <span className="text-gray-600">uds</span>
        </p>
        {moje.costo_produccion > 0 && (
          <p className="text-xs text-gray-500">{fmt(moje.costo_produccion)}</p>
        )}
      </div>
      <div>
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full border',
          estadoBadge[moje.estado] ?? ''
        )}>
          {estadoLabel[moje.estado]}
        </span>
      </div>
      {moje.estado === 'pendiente' && onValidar && (
        <Button
          size="sm"
          onClick={onValidar}
          style={{ background: '#EA580C', color: '#fff' }}
        >
          Validar
        </Button>
      )}
    </div>
  )
}
