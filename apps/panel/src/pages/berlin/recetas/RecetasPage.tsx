import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { Receta, Producto, Insumo } from '../../../types'
import toast from 'react-hot-toast'
import {
  BookOpen, ChevronDown, ChevronUp, Timer,
  DollarSign, Plus, Trash2, X, Info, Flame, Snowflake, Pencil,
  Zap, Settings, Check, Coffee, Thermometer, Search,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import FormCrearProductoRapido from '../../../components/FormCrearProductoRapido'
import FormCrearInsumoRapido   from '../../../components/FormCrearInsumoRapido'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

// ── Ingrediente en el formulario ──────────────────────────────
interface IngredienteForm {
  insumo_id: string
  cantidad:  string
  unidad:    string
}

const UNIDADES = ['g', 'kg', 'ml', 'l', 'unidad', 'bolsa', 'bulto']

// ── Modal Receta (crear y editar) ─────────────────────────────
function ModalReceta({
  receta,
  onClose,
  onSuccess,
}: {
  receta?:   Receta
  onClose:   () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const esEditar    = !!receta

  // ── Formulario ──
  const [nombre,          setNombre]          = useState(receta?.nombre          ?? '')
  type TipoProceso = 'horneada'|'congelada'|'frito'|'bebida_caliente'|'bebida_fria'
  const BEBIDAS: TipoProceso[] = ['bebida_caliente', 'bebida_fria']
  const HORNOS:  TipoProceso[] = ['horneada', 'congelada', 'frito']

  const [procesos, setProcesos] = useState<Set<TipoProceso>>(
    new Set(
      receta?.tipo_receta
        ? receta.tipo_receta.split('+').map(s => s.trim()) as TipoProceso[]
        : ['horneada']
    )
  )
  // tipo_receta derivado para compatibilidad con backend (primer proceso = tipo principal)
  const tipoReceta = procesos.has('horneada') ? 'horneada'
    : procesos.has('frito')           ? 'frito'
    : procesos.has('bebida_caliente') ? 'bebida_caliente'
    : procesos.has('bebida_fria')     ? 'bebida_fria'
    : 'congelada'
  const toggleProceso = (p: TipoProceso) =>
    setProcesos(prev => {
      const next = new Set(prev)
      if (next.has(p) && next.size === 1) return prev // al menos 1 siempre
      // bebidas y hornos son mutuamente excluyentes
      if (BEBIDAS.includes(p)) HORNOS.forEach(h => next.delete(h))
      if (HORNOS.includes(p)) BEBIDAS.forEach(b => next.delete(b))
      // dentro de bebidas solo una a la vez
      if (p === 'bebida_caliente') next.delete('bebida_fria')
      if (p === 'bebida_fria')     next.delete('bebida_caliente')
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  const [productoId,      setProductoId]      = useState(receta?.producto_id     ?? '')
  const [rendimiento,     setRendimiento]     = useState(String(receta?.rendimiento ?? 24))
  const [tempHorno,       setTempHorno]       = useState(receta?.temperatura_horno   ? String(receta.temperatura_horno)   : '')
  const [tiempoHorno,     setTiempoHorno]     = useState(receta?.tiempo_horno_min    ? String(receta.tiempo_horno_min)    : '')
  const [tiempoCongelado, setTiempoCongelado] = useState(receta?.tiempo_congelado_min ? String(receta.tiempo_congelado_min) : '')
  const [tiempoPrep,      setTiempoPrep]      = useState(receta?.tiempo_prep_min     ? String(receta.tiempo_prep_min)     : '')
  const [instrucciones,   setInstrucciones]   = useState(receta?.instrucciones   ?? '')
  const [ingredientes,   setIngredientes]     = useState<IngredienteForm[]>(
    receta?.ingredientes?.length
      ? receta.ingredientes.map(i => ({
          insumo_id: i.insumo_id,
          cantidad:  String(i.cantidad),
          unidad:    i.unidad,
        }))
      : [{ insumo_id: '', cantidad: '', unidad: 'g' }]
  )

  // ── Datos disponibles ──
  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos-receta'],
    queryFn:  () => api.get('/berlin/productos').then(r =>
      (r.data as Producto[]).filter(p => p.activo)
    ),
  })

  const { data: insumos = [] } = useQuery<Insumo[]>({
    queryKey: ['insumos-receta'],
    queryFn:  () => api.get('/berlin/insumos').then(r =>
      (r.data as Insumo[]).filter(i => i.activo)
    ),
  })

  const { data: panConfig = [] } = useQuery<{ clave: string; valor: string }[]>({
    queryKey: ['pan-config'],
    queryFn:  () => api.get('/berlin/configuracion').then(r => r.data),
  })
  const pct40 = parseFloat(panConfig.find(c => c.clave === 'pct_costos_operativos')?.valor ?? '40')

  // ── Costo estimado ──
  const costoEstimado = ingredientes.reduce((sum, ing) => {
    const insumo = insumos.find(i => i.id === ing.insumo_id)
    if (!insumo || !ing.cantidad) return sum
    return sum + parseFloat(ing.cantidad) * insumo.costo_unitario
  }, 0)

  const rend        = parseInt(rendimiento) || 1
  const costoPorUd  = costoEstimado / rend
  const productoSel = productos.find(p => p.id === productoId)
  const margen      = productoSel?.precio_venta
    ? ((productoSel.precio_venta - costoPorUd) / productoSel.precio_venta) * 100
    : null

  // ── Estado creación rápida de producto / insumo ──
  const [showCrearProd,   setShowCrearProd]   = useState(false)
  const [showCrearInsumo, setShowCrearInsumo] = useState(false)
  const [insumoTargetIdx, setInsumoTargetIdx] = useState<number | null>(null)

  // ── Helpers de ingredientes ──
  const addIngrediente = () =>
    setIngredientes(prev => [...prev, { insumo_id: '', cantidad: '', unidad: 'g' }])

  const removeIngrediente = (idx: number) =>
    setIngredientes(prev => prev.filter((_, i) => i !== idx))

  const updateIngrediente = (idx: number, field: keyof IngredienteForm, value: string) =>
    setIngredientes(prev =>
      prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing))
    )

  const selectInsumo = (idx: number, insumoId: string) => {
    const ins = insumos.find(i => i.id === insumoId)
    setIngredientes(prev =>
      prev.map((ing, i) =>
        i === idx ? { ...ing, insumo_id: insumoId, unidad: ins?.unidad_medida ?? 'g' } : ing
      )
    )
  }

  // ── Mutation (crear o actualizar) ──
  const { mutate: guardar, isPending } = useMutation({
    mutationFn: () => {
      const ings = ingredientes
        .filter(i => i.insumo_id && i.cantidad)
        .map(i => ({
          insumo_id: i.insumo_id,
          cantidad:  parseFloat(i.cantidad),
          unidad:    i.unidad,
        }))

      const procesosArr = Array.from(procesos)
      const body = {
        nombre,
        tipo_receta:          procesosArr.join('+'),  // ej: "horneada+congelada"
        producto_id:          productoId || null,
        rendimiento:          rend,
        temperatura_horno:    procesos.has('horneada') && tempHorno    ? parseFloat(tempHorno)       : null,
        tiempo_horno_min:     procesos.has('horneada') && tiempoHorno  ? parseInt(tiempoHorno)       : 0,
        tiempo_congelado_min: procesos.has('congelada') && tiempoCongelado ? parseInt(tiempoCongelado) : 0,
        tiempo_prep_min:      tiempoPrep    ? parseInt(tiempoPrep) : 0,
        instrucciones:        instrucciones || null,
        ingredientes:         ings,
        activo:               true,
      }

      return esEditar
        ? api.put(`/berlin/recetas/${receta!.id}`, body)
        : api.post('/berlin/recetas', body)
    },
    onSuccess: () => {
      toast.success(esEditar ? 'Receta actualizada ✅' : 'Receta creada y costo calculado ✅')
      queryClient.invalidateQueries({ queryKey: ['recetas'] })
      onSuccess()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || (esEditar ? 'Error al actualizar la receta' : 'Error al crear la receta'))
    },
  })

  const valid = nombre.trim() && rendimiento && ingredientes.some(i => i.insumo_id && i.cantidad)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-brand-navy border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-brand-navy border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-base">
              {esEditar ? <Pencil size={16} className="text-orange-400" /> : '🥐'}
            </div>
            <div>
              <h3 className="text-white font-bold text-base">
                {esEditar ? `Editar: ${receta!.nombre}` : 'Nueva Receta'}
              </h3>
              <p className="text-gray-500 text-xs">
                {esEditar
                  ? 'Modifica los ingredientes, rendimiento o datos del proceso'
                  : 'Define los ingredientes y el rendimiento del lote'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Datos generales ── */}
          <div className="space-y-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Datos generales</p>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Nombre de la receta <span className="text-red-400">*</span></label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Croissant de mantequilla"
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-[#EA580C]/60 placeholder:text-gray-600"
              />
            </div>

            {/* Tipo de proceso — multi-select */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Tipo de proceso</label>
              <p className="text-[10px] text-gray-600 mb-2">Hornos/fritos: combinables · Bebidas: exclusivas entre sí</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {([
                  { key: 'horneada',        label: 'Horneada',   icon: <Flame      size={14}/>, active: 'bg-orange-500/15 border-orange-500/50 text-orange-300', iconC: 'text-orange-400' },
                  { key: 'congelada',       label: 'Congelada',  icon: <Snowflake  size={14}/>, active: 'bg-blue-500/15 border-blue-500/50 text-blue-300',     iconC: 'text-blue-400'   },
                  { key: 'frito',           label: 'Frito',      icon: <Zap        size={14}/>, active: 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300',iconC: 'text-yellow-400' },
                ] as const).map(({ key, label, icon, active, iconC }) => (
                  <button key={key} type="button" onClick={() => toggleProceso(key)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all relative',
                      procesos.has(key) ? active : 'bg-brand-dark border-white/10 text-gray-400 hover:border-white/20'
                    )}>
                    <span className={cn(procesos.has(key) ? iconC : '')}>{icon}</span>
                    {label}
                    {procesos.has(key) && <span className="absolute top-1 right-1.5 text-[9px] font-bold opacity-60">✓</span>}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'bebida_caliente', label: 'Bebida Caliente', icon: <Coffee      size={14}/>, active: 'bg-red-500/15 border-red-500/50 text-red-300',       iconC: 'text-red-400'    },
                  { key: 'bebida_fria',     label: 'Bebida Fría',     icon: <Thermometer size={14}/>, active: 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300',     iconC: 'text-cyan-400'   },
                ] as const).map(({ key, label, icon, active, iconC }) => (
                  <button key={key} type="button" onClick={() => toggleProceso(key)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all relative',
                      procesos.has(key) ? active : 'bg-brand-dark border-white/10 text-gray-400 hover:border-white/20'
                    )}>
                    <span className={cn(procesos.has(key) ? iconC : '')}>{icon}</span>
                    {label}
                    {procesos.has(key) && <span className="absolute top-1 right-1.5 text-[9px] font-bold opacity-60">✓</span>}
                  </button>
                ))}
              </div>
              {procesos.size > 1 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-500">Secuencia:</span>
                  {Array.from(procesos).map((p, i) => (
                    <span key={p} className="flex items-center gap-1">
                      {i > 0 && <span className="text-gray-600 text-[10px]">→</span>}
                      <span className={cn('text-[10px] font-semibold',
                        p === 'horneada' ? 'text-orange-400' : p === 'congelada' ? 'text-blue-400'
                        : p === 'bebida_caliente' ? 'text-red-400' : p === 'bebida_fria' ? 'text-cyan-400' : 'text-yellow-400')}>
                        {p === 'horneada' ? '🔥 Hornear' : p === 'congelada' ? '❄️ Congelar'
                          : p === 'bebida_caliente' ? '☕ Caliente' : p === 'bebida_fria' ? '🧊 Frío' : '⚡ Freír'}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {procesos.size === 1 && (
                <p className="text-[10px] text-gray-600 mt-1.5">
                  {procesos.has('horneada')        ? '🔥 Pasa por el horno.'
                    : procesos.has('congelada')     ? '❄️ Se congela — no requiere horneado.'
                    : procesos.has('bebida_caliente')? '☕ Preparación servida caliente (café, chocolate, aromática…)'
                    : procesos.has('bebida_fria')   ? '🧊 Preparación servida fría (jugo, milo frío, agua…)'
                    : '⚡ Producto frito (buñuelos, empanadas, patacones…)'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">
                  Producto que produce <span className="text-red-400">*</span>
                </label>

                {!showCrearProd ? (
                  <>
                    <select
                      value={productoId}
                      onChange={e => setProductoId(e.target.value)}
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                                 focus:outline-none focus:border-[#EA580C]/60"
                    >
                      <option value="">— Seleccionar producto —</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCrearProd(true)}
                      className="mt-1.5 flex items-center gap-1 text-xs text-[#EA580C]
                                 hover:text-white transition-colors"
                    >
                      <Plus size={11} />
                      {productoId ? 'Cambiar · Crear nuevo' : 'Crear producto terminado nuevo'}
                    </button>
                  </>
                ) : (
                  <FormCrearProductoRapido
                    onCreado={(prod) => {
                      queryClient.invalidateQueries({ queryKey: ['productos-receta'] })
                      setProductoId(prod.id)
                      setShowCrearProd(false)
                    }}
                    onCancelar={() => setShowCrearProd(false)}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Rendimiento (unidades) <span className="text-red-400">*</span></label>
                <input
                  type="number" min="1"
                  value={rendimiento}
                  onChange={e => setRendimiento(e.target.value)}
                  placeholder="Ej: 24"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                             focus:outline-none focus:border-[#EA580C]/60"
                />
              </div>
            </div>

            {/* Campos dinámicos según procesos seleccionados */}
            <div className="space-y-3">
              {procesos.has('horneada') && (
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-orange-400 font-semibold mb-2 flex items-center gap-1">
                    <Flame size={11}/> Parámetros de horno
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Temp. horno (°C)</label>
                      <input type="number" min="0" value={tempHorno}
                        onChange={e => setTempHorno(e.target.value)} placeholder="Ej: 180"
                        className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm
                                   focus:outline-none focus:border-orange-500/60" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Tiempo horno (min)</label>
                      <input type="number" min="0" value={tiempoHorno}
                        onChange={e => setTiempoHorno(e.target.value)} placeholder="Ej: 20"
                        className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm
                                   focus:outline-none focus:border-orange-500/60" />
                    </div>
                  </div>
                </div>
              )}
              {procesos.has('congelada') && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-blue-400 font-semibold mb-2 flex items-center gap-1">
                    <Snowflake size={11}/> Parámetros de congelado
                  </p>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tiempo congelado (min)</label>
                    <input type="number" min="0" value={tiempoCongelado}
                      onChange={e => setTiempoCongelado(e.target.value)} placeholder="Ej: 120"
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm
                                 focus:outline-none focus:border-blue-500/60" />
                  </div>
                </div>
              )}
              {(procesos.has('bebida_caliente') || procesos.has('bebida_fria')) && (
                <div className={cn('border rounded-xl p-3',
                  procesos.has('bebida_caliente')
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-cyan-500/5 border-cyan-500/20'
                )}>
                  <p className={cn('text-[10px] font-semibold mb-2 flex items-center gap-1',
                    procesos.has('bebida_caliente') ? 'text-red-400' : 'text-cyan-400'
                  )}>
                    {procesos.has('bebida_caliente') ? <Coffee size={11}/> : <Thermometer size={11}/>}
                    {procesos.has('bebida_caliente') ? 'Preparación caliente' : 'Preparación fría'}
                  </p>
                  <p className="text-[10px] text-gray-500 mb-2">
                    {procesos.has('bebida_caliente')
                      ? 'Se sirve al momento. No requiere stock — se prepara con los insumos de la receta.'
                      : 'Se sirve fría o a temperatura ambiente. No requiere stock — se prepara con los insumos de la receta.'}
                  </p>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tiempo de preparación (min)</label>
                    <input type="number" min="0" value={tiempoPrep}
                      onChange={e => setTiempoPrep(e.target.value)} placeholder="Ej: 5"
                      className={cn('w-full bg-brand-dark border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none',
                        procesos.has('bebida_caliente') ? 'border-white/10 focus:border-red-500/60' : 'border-white/10 focus:border-cyan-500/60'
                      )} />
                  </div>
                </div>
              )}
              {procesos.has('frito') && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-yellow-400 font-semibold mb-2 flex items-center gap-1">
                    <Zap size={11}/> Parámetros de fritura
                  </p>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tiempo de fritura (min)</label>
                    <input type="number" min="0" value={tiempoHorno}
                      onChange={e => setTiempoHorno(e.target.value)} placeholder="Ej: 5"
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm
                                 focus:outline-none focus:border-yellow-500/60" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Prep. (min)</label>
                <input type="number" min="0" value={tiempoPrep}
                  onChange={e => setTiempoPrep(e.target.value)} placeholder="Ej: 30"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                             focus:outline-none focus:border-[#EA580C]/60" />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Instrucciones</label>
              <textarea
                rows={3}
                value={instrucciones}
                onChange={e => setInstrucciones(e.target.value)}
                placeholder="Pasos del proceso: mezclar, fermentar, hornear…"
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-[#EA580C]/60 placeholder:text-gray-600 resize-none"
              />
            </div>
          </div>

          {/* ── Ingredientes ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
                Ingredientes <span className="text-red-400 normal-case tracking-normal font-normal">*</span>
              </p>
              <button
                onClick={addIngrediente}
                className="flex items-center gap-1.5 text-xs text-[#EA580C] hover:text-white
                           bg-[#EA580C]/10 hover:bg-[#EA580C]/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={12} /> Agregar ingrediente
              </button>
            </div>

            {insumos.length === 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-400 flex items-center gap-2">
                <Info size={14} />
                No hay insumos registrados.{' '}
                <button type="button" onClick={() => { setInsumoTargetIdx(0); setShowCrearInsumo(true) }}
                  className="underline hover:text-white transition-colors">
                  Crear el primero aquí
                </button>
              </div>
            )}

            <div className="space-y-2">
              {ingredientes.map((ing, idx) => {
                const insumoSel = insumos.find(i => i.id === ing.insumo_id)
                const costoLin  = insumoSel && ing.cantidad
                  ? parseFloat(ing.cantidad) * insumoSel.costo_unitario
                  : 0

                return (
                  <div key={idx} className="grid grid-cols-[1fr_120px_100px_32px] gap-2 items-start">
                    <div>
                      <select
                        value={ing.insumo_id}
                        onChange={e => selectInsumo(idx, e.target.value)}
                        className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white
                                   focus:outline-none focus:border-[#EA580C]/60"
                      >
                        <option value="">— Insumo —</option>
                        {insumos.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} ({fmt(i.costo_unitario)}/{i.unidad_medida})
                          </option>
                        ))}
                      </select>
                      {costoLin > 0 && (
                        <p className="text-[11px] text-green-400 mt-0.5 pl-1">= {fmt(costoLin)}</p>
                      )}
                      {!ing.insumo_id && (
                        <button type="button"
                          onClick={() => { setInsumoTargetIdx(idx); setShowCrearInsumo(true) }}
                          className="mt-0.5 flex items-center gap-1 text-[11px] text-[#EA580C] hover:text-white transition-colors">
                          <Plus size={10} /> Crear nuevo insumo
                        </button>
                      )}
                    </div>

                    <input
                      type="number" min="0" step="0.1"
                      value={ing.cantidad}
                      onChange={e => updateIngrediente(idx, 'cantidad', e.target.value)}
                      placeholder="Cant."
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white
                                 focus:outline-none focus:border-[#EA580C]/60"
                    />

                    <select
                      value={ing.unidad}
                      onChange={e => updateIngrediente(idx, 'unidad', e.target.value)}
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white
                                 focus:outline-none focus:border-[#EA580C]/60"
                    >
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>

                    <button
                      onClick={() => removeIngrediente(idx)}
                      disabled={ingredientes.length === 1}
                      className="w-8 h-10 flex items-center justify-center text-gray-600 hover:text-red-400
                                 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-20"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>

            {showCrearInsumo && (
              <FormCrearInsumoRapido
                onCreado={(ins) => {
                  queryClient.invalidateQueries({ queryKey: ['insumos-receta'] })
                  if (insumoTargetIdx !== null) selectInsumo(insumoTargetIdx, ins.id)
                  setShowCrearInsumo(false)
                  setInsumoTargetIdx(null)
                }}
                onCancelar={() => { setShowCrearInsumo(false); setInsumoTargetIdx(null) }}
              />
            )}

          </div>

          {/* ── Desglose completo de costos con 40% ── */}
          {costoEstimado > 0 && (() => {
            const costoMatUd   = costoEstimado / rend
            const costoOpUd    = costoMatUd * (pct40 / 100)
            const costoRealUd  = costoMatUd + costoOpUd
            const pv           = productoSel?.precio_venta ?? 0
            const utilidadReal = pv > 0 ? ((pv - costoRealUd) / pv) * 100 : null
            return (
              <div className="bg-brand-dark rounded-xl border border-orange-500/15 p-4 space-y-2.5">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <DollarSign size={12} className="text-orange-400" />
                  Desglose de costo — lote de {rend} unidad{rend !== 1 ? 'es' : ''}
                </p>

                {/* Materiales */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-300">
                    <span>Costo materiales (lote)</span>
                    <span className="font-mono font-semibold">{fmt(costoEstimado)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs pl-3">
                    <span>÷ {rend} unidades</span>
                    <span className="font-mono">{fmt(costoMatUd)}/u</span>
                  </div>
                </div>

                {/* 40% operativo */}
                <div className="flex justify-between text-sm text-orange-300/80 border-t border-white/5 pt-2">
                  <span>+ {pct40}% gastos operativos</span>
                  <span className="font-mono">+ {fmt(costoOpUd)}/u</span>
                </div>

                {/* Costo real */}
                <div className="flex justify-between items-center border-t-2 border-orange-500/30 pt-2">
                  <span className="text-sm font-bold text-white">Costo real por unidad</span>
                  <span className="text-xl font-bold text-orange-400 font-mono">{fmt(costoRealUd)}</span>
                </div>

                {/* Precio venta y utilidad */}
                {pv > 0 ? (
                  <div className="bg-brand-navy rounded-lg p-3 space-y-1.5 border border-white/5 mt-1">
                    <div className="flex justify-between text-sm text-gray-300">
                      <span>Precio de venta <span className="text-gray-500 text-xs">({productoSel!.nombre})</span></span>
                      <span className="font-mono font-semibold">{fmt(pv)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/5 pt-1.5">
                      <span className="text-sm font-bold text-gray-200">Utilidad real</span>
                      <span className={cn(
                        'text-xl font-bold font-mono',
                        (utilidadReal ?? 0) >= 40 ? 'text-green-400'
                          : (utilidadReal ?? 0) >= 25 ? 'text-yellow-400'
                          : 'text-red-400'
                      )}>
                        {utilidadReal?.toFixed(0)}%
                      </span>
                    </div>
                    {(utilidadReal ?? 0) < 25 && (
                      <p className="text-[11px] text-red-400/80">
                        ⚠️ Utilidad baja — considera ajustar el precio de venta a mínimo{' '}
                        <strong>{fmt(costoRealUd * 1.33)}</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 pt-1">
                    Vincula un producto terminado para ver la utilidad real.
                  </p>
                )}

                <p className="text-[10px] text-gray-600 border-t border-white/5 pt-2">
                  El {pct40}% cubre arriendo, servicios y mano de obra.
                  Configurable en la sección ⚙️ de esta página.
                </p>
              </div>
            )
          })()}

          {/* ── Botones ── */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400
                         hover:text-white hover:border-white/20 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => guardar()}
              disabled={!valid || isPending}
              className={cn(
                'flex-1 py-3 rounded-xl text-sm font-bold transition-all',
                valid && !isPending
                  ? 'bg-[#EA580C] hover:bg-[#C2410C] text-white'
                  : 'bg-white/5 text-gray-600 cursor-not-allowed'
              )}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando…
                </span>
              ) : esEditar ? (
                '✓ Guardar cambios'
              ) : (
                '✓ Crear receta'
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de receta (acordeón) ─────────────────────────────
function RecetaCard({
  receta,
  onEdit,
}: {
  receta: Receta
  onEdit: (r: Receta) => void
}) {
  const queryClient         = useQueryClient()
  const [open, setOpen]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const { data: panConfig = [] } = useQuery<{ clave: string; valor: string }[]>({
    queryKey: ['pan-config'],
    queryFn:  () => api.get('/berlin/configuracion').then(r => r.data),
  })
  const pct40 = parseFloat(panConfig.find(c => c.clave === 'pct_costos_operativos')?.valor ?? '40')

  const { mutate: eliminar, isPending: eliminando } = useMutation({
    mutationFn: () => api.delete(`/berlin/recetas/${receta.id}`),
    onSuccess: () => {
      toast.success(`Receta "${receta.nombre}" eliminada`)
      queryClient.invalidateQueries({ queryKey: ['recetas'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al eliminar la receta')
      setConfirmDel(false)
    },
  })

  return (
    <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">

      {/* ── Cabecera ── */}
      <div className="flex items-center hover:bg-white/[0.02] transition-colors">

        {/* Zona clicable para acordeón */}
        <button
          className="flex-1 flex items-start gap-3 px-5 py-4 text-left"
          onClick={() => setOpen(v => !v)}
        >
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-lg flex-shrink-0">
            🥐
          </div>
          <div>
            <p className="font-semibold text-white">{receta.nombre}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {receta.producto?.nombre ?? 'Sin producto vinculado'} · Rinde {receta.rendimiento} uds
            </p>
          </div>
        </button>

        {/* Zona derecha: badges + acciones + chevron */}
        <div className="flex items-center gap-1.5 pr-4 flex-shrink-0">
          {/* Badge tipo receta */}
          {receta.tipo_receta === 'congelada' ? (
            <span className="hidden sm:flex items-center gap-1 text-xs bg-blue-500/15 border border-blue-500/30
                             text-blue-300 px-2 py-0.5 rounded-full mr-1">
              <Snowflake size={11} /> Congelada
            </span>
          ) : receta.tipo_receta === 'frito' ? (
            <span className="hidden sm:flex items-center gap-1 text-xs bg-yellow-500/15 border border-yellow-500/30
                             text-yellow-300 px-2 py-0.5 rounded-full mr-1">
              <Zap size={11} /> Frito
            </span>
          ) : (
            <span className="hidden sm:flex items-center gap-1 text-xs bg-orange-500/15 border border-orange-500/30
                             text-orange-300 px-2 py-0.5 rounded-full mr-1">
              <Flame size={11} /> Horneada
            </span>
          )}

          {/* Costo */}
          <span className="hidden md:flex items-center gap-1 text-xs text-green-400 mr-2">
            <DollarSign size={11} />{fmt(receta.costo_calculado)}
          </span>

          {/* Editar */}
          <button
            onClick={() => onEdit(receta)}
            title="Editar receta"
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-[#EA580C]
                       hover:bg-[#EA580C]/10 rounded-lg transition-colors"
          >
            <Pencil size={14} />
          </button>

          {/* Eliminar */}
          <button
            onClick={() => setConfirmDel(v => !v)}
            title="Eliminar receta"
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
              confirmDel
                ? 'text-red-400 bg-red-500/15'
                : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'
            )}
          >
            <Trash2 size={14} />
          </button>

          {/* Chevron */}
          <button
            onClick={() => setOpen(v => !v)}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white
                       hover:bg-white/5 rounded-lg transition-colors"
          >
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* ── Confirmación de eliminación ── */}
      {confirmDel && (
        <div className="px-5 py-3 bg-red-500/10 border-t border-red-500/20 flex items-center justify-between gap-3">
          <p className="text-sm text-red-300 flex-1">
            ¿Eliminar la receta <span className="font-semibold">"{receta.nombre}"</span>? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setConfirmDel(false)}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10
                         rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => eliminar()}
              disabled={eliminando}
              className="px-3 py-1.5 text-xs text-white bg-red-600 hover:bg-red-700
                         rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {eliminando
                ? <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> Eliminando…</>
                : <><Trash2 size={12} /> Sí, eliminar</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Contenido acordeón ── */}
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-white/5">
          <div className="flex flex-wrap gap-4 text-sm">
            {receta.tipo_receta === 'horneada' ? (
              <>
                {receta.temperatura_horno && (
                  <div className="flex items-center gap-1.5 text-orange-400">
                    <Flame size={14} />{receta.temperatura_horno}°C
                  </div>
                )}
                {receta.tiempo_horno_min > 0 && (
                  <div className="flex items-center gap-1.5 text-orange-300">
                    <Timer size={14} />{receta.tiempo_horno_min} min en horno
                  </div>
                )}
              </>
            ) : (
              (receta.tiempo_congelado_min ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-blue-400">
                  <Snowflake size={14} />{receta.tiempo_congelado_min} min de congelado
                </div>
              )
            )}
            {receta.tiempo_prep_min > 0 && (
              <div className="flex items-center gap-1.5 text-gray-400">
                <Timer size={14} />{receta.tiempo_prep_min} min preparación
              </div>
            )}
          </div>

          {receta.instrucciones && (
            <div className="bg-brand-dark rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Instrucciones</p>
              <p className="text-sm text-gray-300 leading-relaxed">{receta.instrucciones}</p>
            </div>
          )}

          {receta.ingredientes && receta.ingredientes.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Ingredientes para {receta.rendimiento} unidades
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {receta.ingredientes.map(ing => {
                  const costoIng = ing.cantidad * (ing.insumo?.costo_unitario ?? 0)
                  const pct = receta.costo_calculado > 0
                    ? (costoIng / receta.costo_calculado) * 100 : 0
                  return (
                    <div key={ing.id} className="bg-brand-dark rounded-lg p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{ing.insumo?.nombre ?? '—'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {fmt(ing.insumo?.costo_unitario ?? 0)}/{ing.insumo?.unidad_medida ?? ing.unidad}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono text-white">{ing.cantidad} {ing.unidad}</p>
                        <p className="text-xs text-green-400">{fmt(costoIng)}</p>
                        <p className="text-xs text-gray-600">{pct.toFixed(0)}%</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── Desglose con 40% ── */}
              {(() => {
                const rend       = receta.rendimiento || 1
                const costoLote  = receta.costo_calculado
                const costoMatUd = costoLote / rend
                const costoOpUd  = costoMatUd * (pct40 / 100)
                const costoReal  = costoMatUd + costoOpUd
                const pv         = receta.producto?.precio_venta ?? 0
                const utilidad   = pv > 0 ? ((pv - costoReal) / pv) * 100 : null
                return (
                  <div className="mt-3 bg-brand-dark rounded-lg border border-orange-500/10 overflow-hidden">
                    <div className="px-3 py-2 space-y-1.5 text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>Costo materiales (lote)</span>
                        <span className="font-mono font-semibold text-white">{fmt(costoLote)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 pl-3">
                        <span>÷ {rend} uds</span>
                        <span className="font-mono">{fmt(costoMatUd)}/u</span>
                      </div>
                      <div className="flex justify-between text-orange-300/80 border-t border-white/5 pt-1.5">
                        <span>+ {pct40}% operativos</span>
                        <span className="font-mono">+ {fmt(costoOpUd)}/u</span>
                      </div>
                      <div className="flex justify-between font-bold border-t-2 border-orange-500/20 pt-1.5">
                        <span className="text-white">Costo real</span>
                        <span className="text-orange-400 font-mono text-sm">{fmt(costoReal)}/u</span>
                      </div>
                    </div>
                    {pv > 0 && utilidad !== null && (
                      <div className={cn(
                        'px-3 py-2 flex items-center justify-between text-xs border-t border-white/5',
                        utilidad >= 40 ? 'bg-green-500/5' : utilidad >= 25 ? 'bg-yellow-500/5' : 'bg-red-500/5'
                      )}>
                        <span className="text-gray-400">Utilidad real ({fmt(pv)} venta)</span>
                        <span className={cn(
                          'font-bold text-sm font-mono',
                          utilidad >= 40 ? 'text-green-400' : utilidad >= 25 ? 'text-yellow-400' : 'text-red-400'
                        )}>{utilidad.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Botón editar en el contenido expandido */}
          <div className="pt-1 border-t border-white/5 flex justify-end">
            <button
              onClick={() => onEdit(receta)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#EA580C]
                         hover:bg-[#EA580C]/10 px-3 py-2 rounded-lg transition-colors"
            >
              <Pencil size={12} /> Editar esta receta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function RecetasPage() {
  const qc = useQueryClient()
  const [showModal,    setShowModal]    = useState(false)
  const [recetaEditar, setRecetaEditar] = useState<Receta | null>(null)
  const [editandoPct,  setEditandoPct]  = useState(false)
  const [pctInput,     setPctInput]     = useState('')
  const [busqueda,     setBusqueda]     = useState('')

  const { data: recetas = [], isLoading } = useQuery<Receta[]>({
    queryKey: ['recetas'],
    queryFn:  () => api.get('/berlin/recetas').then(r => r.data),
  })

  const { data: panConfig = [] } = useQuery<{ clave: string; valor: string }[]>({
    queryKey: ['pan-config'],
    queryFn:  () => api.get('/berlin/configuracion').then(r => r.data),
  })
  const pct40 = parseFloat(panConfig.find(c => c.clave === 'pct_costos_operativos')?.valor ?? '40')

  const TIPO_LABELS: Record<string, string> = {
    horneada: 'horneada', congelada: 'congelada', frito: 'frito',
    bebida_caliente: 'bebida caliente', bebida_fria: 'bebida fría',
  }
  const q = busqueda.trim().toLowerCase()
  const recetasFiltradas = q ? recetas.filter(r => {
    const enNombre   = r.nombre.toLowerCase().includes(q)
    const enProducto = r.producto?.nombre?.toLowerCase().includes(q)
    const enInsumo    = r.ingredientes?.some(i => i.insumo?.nombre?.toLowerCase().includes(q))
    const enTipo      = r.tipo_receta.split('+').some(t => (TIPO_LABELS[t.trim()] ?? t).toLowerCase().includes(q))
    return enNombre || enProducto || enInsumo || enTipo
  }) : recetas

  const { mutate: guardarPct, isPending: guardandoPct } = useMutation({
    mutationFn: () => api.put('/berlin/configuracion/pct_costos_operativos', {
      valor: String(parseFloat(pctInput) || 40),
    }),
    onSuccess: () => {
      toast.success('Porcentaje actualizado ✅')
      qc.invalidateQueries({ queryKey: ['pan-config'] })
      setEditandoPct(false)
    },
    onError: () => toast.error('Error al guardar'),
  })

  const abrirCrear = () => {
    setRecetaEditar(null)
    setShowModal(true)
  }

  const abrirEditar = (r: Receta) => {
    setRecetaEditar(r)
    setShowModal(true)
  }

  const cerrarModal = () => {
    setShowModal(false)
    setRecetaEditar(null)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-brand-teal" />
          <h2 className="text-lg font-bold text-white">Recetario</h2>
          <span className="text-xs bg-brand-navy border border-white/10 px-2 py-0.5 rounded-full text-gray-400">
            {recetas.length} {recetas.length === 1 ? 'fórmula' : 'fórmulas'}
          </span>
        </div>
        <button
          onClick={abrirCrear}
          className="flex items-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white
                     text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} />
          Nueva receta
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por receta, producto, insumo o tipo (horneada, congelada, frito…)"
          className="w-full bg-brand-navy border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white
                     placeholder:text-gray-600 focus:outline-none focus:border-[#EA580C]/60"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12 text-gray-500 text-sm">Cargando recetas…</div>
      ) : recetas.length === 0 ? (
        <div className="bg-brand-navy rounded-xl border border-white/5 flex flex-col items-center py-16 gap-4">
          <BookOpen size={40} className="text-gray-700" />
          <p className="text-gray-400 font-medium">No hay recetas todavía</p>
          <p className="text-gray-600 text-sm text-center max-w-xs">
            Una receta define los ingredientes y cantidades para producir un lote (Moje).
            Primero asegúrate de tener Materias Primas y Productos creados.
          </p>
          <button
            onClick={abrirCrear}
            className="flex items-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white
                       text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors mt-2"
          >
            <Plus size={15} /> Crear primera receta
          </button>
        </div>
      ) : recetasFiltradas.length === 0 ? (
        <div className="bg-brand-navy rounded-xl border border-white/5 flex flex-col items-center py-12 gap-2 text-gray-500">
          <Search size={32} className="opacity-30" />
          <p className="text-sm">Sin resultados para "{busqueda}"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recetasFiltradas.map(r => (
            <RecetaCard key={r.id} receta={r} onEdit={abrirEditar} />
          ))}
        </div>
      )}

      {/* ── Configuración de costos operativos ── */}
      <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-gray-400" />
            <div>
              <p className="text-sm font-semibold text-white">
                Gastos operativos: <span className="text-orange-400">{pct40}%</span>
              </p>
              <p className="text-[11px] text-gray-500">
                Se suma al costo de materiales de cada producto fabricado (arriendo + servicios + mano de obra)
              </p>
            </div>
          </div>
          {!editandoPct ? (
            <button
              onClick={() => { setEditandoPct(true); setPctInput(String(pct40)) }}
              className="text-xs text-gray-400 hover:text-white border border-white/10
                         hover:border-white/25 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cambiar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-brand-dark border border-white/10 rounded-lg px-3 py-1.5">
                <input
                  type="number" min="0" max="99" step="1"
                  value={pctInput}
                  onChange={e => setPctInput(e.target.value)}
                  className="w-12 bg-transparent text-white text-sm text-center focus:outline-none"
                />
                <span className="text-gray-400 text-sm">%</span>
              </div>
              <button
                onClick={() => guardarPct()}
                disabled={guardandoPct}
                className="w-8 h-8 flex items-center justify-center rounded-lg
                           bg-brand-teal/15 text-brand-teal hover:bg-brand-teal/25 transition-colors"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setEditandoPct(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg
                           text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <ModalReceta
          receta={recetaEditar ?? undefined}
          onClose={cerrarModal}
          onSuccess={cerrarModal}
        />
      )}
    </div>
  )
}
