import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { Receta } from '../../../types'
import Button from '../../../components/ui/Button'
import toast from 'react-hot-toast'
import { ArrowLeft, FlaskConical, Thermometer, Timer, Info } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export default function RegistroMoje() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  const [recetaId,       setRecetaId]       = useState('')
  const [cantidadEsp,    setCantidadEsp]    = useState('')
  const [instrucciones,  setInstrucciones]  = useState('')

  // Cargar todas las recetas disponibles
  const { data: recetas = [], isLoading: loadingRec } = useQuery<Receta[]>({
    queryKey: ['recetas'],
    queryFn:  () => api.get('/berlin/recetas').then(r => r.data),
  })

  const recetaSeleccionada = recetas.find(r => r.id === recetaId)

  // Calcular costo estimado del moje
  const costoEstimado = (() => {
    if (!recetaSeleccionada || !cantidadEsp) return 0
    const factor = parseInt(cantidadEsp) / (recetaSeleccionada.rendimiento || 1)
    return (recetaSeleccionada.costo_calculado || 0) * factor
  })()

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/mojes', {
      receta_id:          recetaId,
      cantidad_esperada:  parseInt(cantidadEsp),
      instrucciones_extra: instrucciones || undefined,
    }),
    onSuccess: (res) => {
      const moje = res.data
      toast.success(`Moje registrado: ${moje.numero_moje}`)
      queryClient.invalidateQueries({ queryKey: ['mojes-hoy'] })
      queryClient.invalidateQueries({ queryKey: ['mojes-resumen'] })
      navigate('/mojes')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al registrar el moje')
    },
  })

  const canSubmit = recetaId && cantidadEsp && parseInt(cantidadEsp) > 0 && !isPending

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/mojes')}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FlaskConical size={18} className="text-orange-400" />
            Registrar Moje
          </h2>
          <p className="text-xs text-gray-500">Antes del horno · No impacta inventario</p>
        </div>
      </div>

      {/* ── Selector de receta ── */}
      <div className="bg-brand-navy rounded-xl border border-white/5 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">1. Seleccionar fórmula (receta)</h3>

        {loadingRec ? (
          <p className="text-gray-500 text-sm">Cargando recetas…</p>
        ) : recetas.length === 0 ? (
          <div className="bg-brand-dark rounded-lg p-4 text-sm text-gray-500 flex items-start gap-2">
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>
              No hay recetas creadas. Ve a <strong className="text-white">Recetas</strong> para
              crear la primera fórmula de producción.
            </span>
          </div>
        ) : (
          <select
            value={recetaId}
            onChange={e => setRecetaId(e.target.value)}
            className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-white
                       focus:outline-none focus:border-brand-teal transition-colors"
          >
            <option value="">— Selecciona una receta —</option>
            {recetas.map(r => (
              <option key={r.id} value={r.id}>
                {r.nombre} (rinde {r.rendimiento} uds)
              </option>
            ))}
          </select>
        )}

        {/* Detalle de la receta seleccionada */}
        {recetaSeleccionada && (
          <div className="bg-brand-dark rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              {recetaSeleccionada.temperatura_horno && (
                <div className="flex items-center gap-1.5 text-orange-400">
                  <Thermometer size={14} />
                  <span>{recetaSeleccionada.temperatura_horno}°C</span>
                </div>
              )}
              {recetaSeleccionada.tiempo_horno_min && (
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Timer size={14} />
                  <span>{recetaSeleccionada.tiempo_horno_min} min</span>
                </div>
              )}
              <div className="text-gray-400">
                Rinde <strong className="text-white">{recetaSeleccionada.rendimiento}</strong> uds
              </div>
              <div className="text-gray-400">
                Costo base:{' '}
                <strong className="text-green-400">{fmt(recetaSeleccionada.costo_calculado)}</strong>
              </div>
            </div>

            {recetaSeleccionada.instrucciones && (
              <p className="text-xs text-gray-500 italic border-t border-white/5 pt-3">
                {recetaSeleccionada.instrucciones}
              </p>
            )}

            {recetaSeleccionada.ingredientes && recetaSeleccionada.ingredientes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Ingredientes por lote:</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {recetaSeleccionada.ingredientes.map(ing => (
                    <div key={ing.id}
                         className="flex justify-between bg-brand-navy rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-gray-400 truncate">{ing.insumo.nombre}</span>
                      <span className="text-white ml-2 flex-shrink-0">
                        {ing.cantidad} {ing.unidad}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Cantidad esperada ── */}
      <div className="bg-brand-navy rounded-xl border border-white/5 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">2. ¿Cuántas unidades planeas producir?</h3>
        <div>
          <input
            type="number"
            min="1"
            value={cantidadEsp}
            onChange={e => setCantidadEsp(e.target.value)}
            placeholder={recetaSeleccionada ? `Múltiplo del rendimiento: ${recetaSeleccionada.rendimiento}` : 'Cantidad esperada'}
            className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-4 text-white
                       text-2xl font-bold text-center focus:outline-none focus:border-brand-teal transition-colors
                       placeholder-gray-700"
          />
          {recetaSeleccionada && cantidadEsp && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-brand-dark rounded-lg p-3 text-center">
                <p className="text-gray-500 text-xs">Lotes de receta</p>
                <p className="text-white font-bold text-lg">
                  {(parseInt(cantidadEsp) / recetaSeleccionada.rendimiento).toFixed(1)}×
                </p>
              </div>
              <div className="bg-brand-dark rounded-lg p-3 text-center">
                <p className="text-gray-500 text-xs">Costo estimado</p>
                <p className="text-green-400 font-bold text-lg">{fmt(costoEstimado)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Instrucciones adicionales ── */}
      <div className="bg-brand-navy rounded-xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">3. Instrucciones adicionales (opcional)</h3>
        <textarea
          value={instrucciones}
          onChange={e => setInstrucciones(e.target.value)}
          rows={3}
          placeholder="Notas para el panadero: temperatura especial, ingrediente variante, observaciones…"
          className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-3 text-white text-sm
                     placeholder-gray-700 focus:outline-none focus:border-brand-teal transition-colors resize-none"
        />
      </div>

      {/* ── Botones ── */}
      <div className="flex gap-3 pt-1">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={() => navigate('/mojes')}
        >
          Cancelar
        </Button>
        <Button
          className="flex-1"
          loading={isPending}
          disabled={!canSubmit}
          onClick={() => mutate()}
          style={{ background: canSubmit ? '#EA580C' : undefined, color: canSubmit ? '#fff' : undefined }}
        >
          Registrar Moje
        </Button>
      </div>

      {/* Nota informativa */}
      <div className="flex items-start gap-2 text-xs text-gray-600 px-1">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        <span>
          El registro del moje NO descuenta materias primas. El inventario se actualiza
          solo al validar el moje (cuando el producto sale del horno).
        </span>
      </div>
    </div>
  )
}
