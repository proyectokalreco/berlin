import { Link } from 'react-router-dom'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'
import {
  ShoppingCart, Package, FlaskConical, BookOpen, Banknote,
  Truck, FileText, Users, UserCheck, Receipt, BarChart3,
  PieChart, TrendingUp, CheckCircle, AlertCircle, Clock, AlertTriangle, Tag, LayoutGrid,
  Pencil, X, Upload, Link2, ImageIcon, Settings2, CreditCard, GripVertical,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Colores corporativos Berlín (tomados del logo) ──────────────
const FUCHSIA = '#D9A652'  // dorado principal (mantiene el nombre de variable por brevedad)
const GOLDEN  = '#A15F2F'  // cobre/madera

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const BASE = ''  // app de un solo negocio — rutas en la raíz

// slug para clave de configuración → "Punto de Venta" → "punto_de_venta"
const toSlug = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const CFG_PREFIX = 'modulo_imagen_'
const PREF_CLAVE = 'berlin_modulos_order'

// ── Módulos del negocio ───────────────────────────────────────
const ALL_MODULES = [
  { to: `${BASE}/pos`,          icon: ShoppingCart, label: 'POS',          sub: 'Punto de venta',             color: FUCHSIA, glow: true  },
  { to: `${BASE}/caja`,         icon: Banknote,     label: 'Caja',         sub: 'Apertura · Cierre',          color: GOLDEN               },
  { to: `${BASE}/mesas`,        icon: LayoutGrid,   label: 'Mesas',        sub: 'Gestión de mesas · Meseros', color: '#00C49A'             },
  { to: `${BASE}/inventario`,   icon: Package,      label: 'Inventario',   sub: 'Productos · Insumos',        color: '#00C49A'             },
  { to: `${BASE}/mojes`,        icon: FlaskConical, label: 'Mojes',        sub: 'Plan de producción',         color: '#F59E0B'             },
  { to: `${BASE}/recetas`,      icon: BookOpen,     label: 'Recetas',      sub: 'Costeo · Formulación',       color: '#C084FC'             },
  { to: `${BASE}/proveedores`,  icon: Truck,        label: 'Proveedores',  sub: 'Facturas · Compras',         color: '#60A5FA'             },
  { to: `${BASE}/facturacion`,  icon: FileText,     label: 'Facturación Diaria',  sub: 'Facturas · Anular · Exportar', color: '#34D399'             },
  { to: `${BASE}/clientes`,     icon: Users,        label: 'Clientes',     sub: 'Saldos · Cuentas',           color: '#FB7185'             },
  { to: `${BASE}/empleados`,    icon: UserCheck,    label: 'Empleados',    sub: 'Personal · Nómina',          color: '#38BDF8'             },
  { to: `${BASE}/gastos`,       icon: Receipt,      label: 'Gastos',       sub: 'Control de gastos',          color: '#F97316'             },
  { to: `${BASE}/movimientos`,  icon: BarChart3,      label: 'Libro Diario', sub: 'Ingresos · Gastos · Compras', color: '#A78BFA'             },
  { to: `${BASE}/reportes`,     icon: PieChart,       label: 'Reportes',     sub: 'Excel · PDF · Cierre',       color: '#4ADE80'             },
  { to: `${BASE}/mermas`,         icon: AlertTriangle,  label: 'Pérdidas',          sub: 'Productos dañados',          color: '#FBBF24'             },
  { to: `${BASE}/etiquetas`,      icon: Tag,            label: 'Etiquetas',         sub: 'Imprimir código de barras',  color: '#64748B'             },
  { to: `${BASE}/cuentas-pagar`,  icon: AlertCircle,    label: 'Cuentas por Pagar', sub: 'Facturas · Vencimientos',    color: '#F97316'             },
  { to: `${BASE}/cuentas-cobrar`, icon: CreditCard,     label: 'Cuentas por Cobrar',sub: 'Créditos · Saldos',          color: '#00C49A'             },
]

const MODULOS_POR_ROL: Record<string, string[]> = {
  super_admin:     ALL_MODULES.map(m => m.label),
  admin:           ALL_MODULES.map(m => m.label),
  admin_berlin: ALL_MODULES.map(m => m.label),
  panadero:        ['Mojes', 'Inventario', 'Recetas', 'Pérdidas', 'Etiquetas'],
  cajero:          ['Caja', 'POS', 'Mesas', 'Facturación Diaria', 'Clientes', 'Cuentas por Cobrar'],
  vendedor:        ['Caja', 'POS', 'Mesas', 'Clientes'],
  mesero:          ['Mesas', 'Inventario'],
  domiciliario:    ['POS'],
}

const ROLES_CON_CAJA = ['super_admin', 'admin', 'admin_berlin', 'cajero', 'vendedor']

// ── Modal editar imagen de módulo ─────────────────────────────
function ModalEditarModulo({
  label, color, imagenActual, onClose, onSave,
}: {
  label: string; color: string; imagenActual: string
  onClose: () => void; onSave: (url: string) => void
}) {
  const [tab,       setTab]       = useState<'url' | 'file'>('url')
  const [urlInput,  setUrlInput]  = useState(imagenActual)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('imagen', file)
      const res = await api.post('/berlin/imagen', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUrlInput(res.data.url)
      setTab('url')
      toast.success('Imagen subida ✅')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#112240] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <ImageIcon size={16} style={{ color }} />
            <span className="text-sm font-bold text-white">Imagen — {label}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        {urlInput && (
          <div className="mx-5 mt-4 rounded-xl overflow-hidden border border-white/10 h-32 flex items-center justify-center bg-white/5">
            <img
              src={urlInput}
              alt="preview"
              className="h-full w-full object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mx-5 mt-4 bg-white/5 rounded-lg p-1">
          {(['url', 'file'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'url' ? <><Link2 size={12} /> Pegar URL</> : <><Upload size={12} /> Subir archivo</>}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-3">
          {tab === 'url' ? (
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">URL de la imagen</label>
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://images.pexels.com/..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-gray-600 focus:outline-none focus:border-white/25"
              />
              <p className="text-[10px] text-gray-600 mt-1">
                Puedes usar links de Pexels, Unsplash u otro sitio de imágenes.
              </p>
            </div>
          ) : (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f)
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-white/15
                           rounded-xl py-6 hover:border-white/30 transition-colors disabled:opacity-50"
              >
                <Upload size={22} className="text-gray-500" />
                <span className="text-xs text-gray-400">
                  {uploading ? 'Subiendo...' : 'Haz clic para seleccionar una imagen'}
                </span>
              </button>
            </div>
          )}

          {/* Botón quitar imagen */}
          {(urlInput || imagenActual) && (
            <button
              onClick={() => { setUrlInput(''); onSave('') }}
              className="w-full text-xs text-red-400 hover:text-red-300 transition-colors py-1"
            >
              × Quitar imagen (volver al ícono predeterminado)
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-gray-400
                       hover:text-white hover:border-white/20 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(urlInput)}
            disabled={uploading}
            className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: color }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de módulo ─────────────────────────────────────────
function ModuleCard({
  to, icon: Icon, label, sub, color, glow = false,
  imagenUrl, editMode, onEdit,
}: {
  to: string; icon: React.ElementType; label: string; sub: string
  color: string; glow?: boolean
  imagenUrl?: string; editMode?: boolean; onEdit?: () => void
}) {
  const shadowBase  = glow
    ? `0 2px 14px ${color}28, 0 1px 4px rgba(0,0,0,0.3)`
    : '0 1px 4px rgba(0,0,0,0.25)'
  const shadowHover = `0 6px 22px ${color}35, 0 2px 8px rgba(0,0,0,0.35)`

  return (
    <div className="relative group">
      <Link
        to={to}
        className="flex flex-col items-center justify-center gap-3 rounded-2xl p-5
                   transition-all duration-150 select-none active:scale-[0.93]
                   hover:-translate-y-0.5 bg-brand-navy border border-white/5"
        style={{ boxShadow: shadowBase }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = `${color}45`
          el.style.boxShadow   = shadowHover
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'rgba(255,255,255,0.05)'
          el.style.boxShadow   = shadowBase
        }}
      >
        {/* Ícono o imagen personalizada */}
        {imagenUrl ? (
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
            <img src={imagenUrl} alt={label} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl" style={{ background: `${color}18` }}>
            <Icon size={30} style={{ color }} strokeWidth={1.8} />
          </div>
        )}
        <div className="text-center">
          <p className="text-sm font-bold text-white leading-tight">{label}</p>
          <p className="text-[11px] mt-0.5 leading-tight text-gray-500">{sub}</p>
        </div>
      </Link>

      {/* Botón editar — solo en modo edición */}
      {editMode && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit?.() }}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 border border-white/10
                     opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 z-10"
          title="Cambiar imagen"
        >
          <Pencil size={12} className="text-white" />
        </button>
      )}
    </div>
  )
}

function SortableModuleCard({ id, esAdmin, dragMode, ...cardProps }: {
  id: string; esAdmin: boolean; dragMode: boolean
} & React.ComponentProps<typeof ModuleCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity:   isDragging ? 0.45 : 1,
        zIndex:    isDragging ? 50 : undefined,
        position:  'relative',
      }}
      {...attributes}
    >
      <ModuleCard {...cardProps} />
      {esAdmin && dragMode && (
        <button
          {...listeners}
          onClick={e => e.preventDefault()}
          className="absolute top-1.5 left-1.5 p-1.5 rounded-lg bg-black/50 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
          title="Arrastrar para reordenar"
        >
          <GripVertical size={10} className="text-white" />
        </button>
      )}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({
  icon: Icon, iconColor, label, value, valueStyle,
}: {
  icon: React.ElementType; iconColor: string; label: string
  value: React.ReactNode; valueStyle?: React.CSSProperties
}) {
  return (
    <div
      className="rounded-xl border border-white/5 bg-brand-navy p-4 flex items-center gap-3"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
    >
      <div
        className="p-2.5 rounded-xl flex-shrink-0"
        style={{ background: `${iconColor}18`, color: iconColor }}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-gray-500">{label}</p>
        <p className="text-lg font-bold truncate text-white" style={valueStyle}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────
export default function BerlinDashboard() {
  const user = useAuthStore(s => s.user)
  const rol  = user?.rol ?? ''
  const qc   = useQueryClient()

  const esAdmin = ['super_admin', 'admin', 'admin_berlin'].includes(rol)

  const [editMode,    setEditMode]    = useState(false)
  const [dragMode,    setDragMode]    = useState(false)
  const [editandoMod, setEditandoMod] = useState<string | null>(null)

  const modulosVisibles  = MODULOS_POR_ROL[rol] ?? ALL_MODULES.map(m => m.label)
  const modulosFiltrados = ALL_MODULES.filter(m => modulosVisibles.includes(m.label))
  const mostrarAlertaCaja = ROLES_CON_CAJA.includes(rol)
  const mostrarKpiCaja    = ROLES_CON_CAJA.includes(rol)
  const mostrarKpiVentas  = rol !== 'panadero'

  const [ordenModulos, setOrdenModulos] = useState<string[]>(() => modulosFiltrados.map(m => m.label))

  // Sensores drag — requiere 8px de movimiento para iniciar (evita conflicto con click)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // ── Cargar preferencias del usuario (endpoint genérico, no específico de negocio)
  const { data: preferencias } = useQuery<Record<string, any>>({
    queryKey: ['me-preferencias'],
    queryFn:  () => api.get('/panel/me/preferencias').then(r => r.data),
    staleTime: 300_000,
  })

  useEffect(() => {
    if (!preferencias) return
    const ordenGuardado: string[] | undefined = preferencias[PREF_CLAVE]
    if (!ordenGuardado?.length) return
    const visiblesSet = new Set(modulosFiltrados.map(m => m.label))
    const guardadosValidos = ordenGuardado.filter(l => visiblesSet.has(l))
    const guardadosSet = new Set(guardadosValidos)
    const nuevos = modulosFiltrados.map(m => m.label).filter(l => !guardadosSet.has(l))
    setOrdenModulos([...guardadosValidos, ...nuevos])
  }, [preferencias]) // eslint-disable-line react-hooks/exhaustive-deps

  const { mutate: guardarOrden } = useMutation({
    mutationFn: (orden: string[]) =>
      api.patch('/panel/me/preferencias', { clave: PREF_CLAVE, valor: orden }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me-preferencias'] }) },
    onError: () => toast.error('No se pudo guardar el orden'),
  })

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrdenModulos(prev => {
      const oldIdx = prev.indexOf(active.id as string)
      const newIdx = prev.indexOf(over.id as string)
      const siguiente = arrayMove(prev, oldIdx, newIdx)
      guardarOrden(siguiente)
      return siguiente
    })
  }, [guardarOrden])

  const modulosOrdenados = ordenModulos
    .map(label => modulosFiltrados.find(m => m.label === label))
    .filter(Boolean) as typeof modulosFiltrados

  // ── Configuración de imágenes ──────────────────────────────
  const { data: configData = [] } = useQuery<{ clave: string; valor: string }[]>({
    queryKey: ['pan-configuracion'],
    queryFn:  () => api.get('/berlin/configuracion').then(r => r.data),
    staleTime: 60_000,
  })

  // mapa: slug → url
  const imagenesModulos: Record<string, string> = {}
  for (const cfg of configData) {
    if (cfg.clave.startsWith(CFG_PREFIX) && cfg.valor) {
      imagenesModulos[cfg.clave.slice(CFG_PREFIX.length)] = cfg.valor
    }
  }

  const { mutate: guardarImagen } = useMutation({
    mutationFn: ({ slug, url }: { slug: string; url: string }) =>
      api.put(`/berlin/configuracion/${CFG_PREFIX}${slug}`, {
        valor:       url,
        descripcion: `Imagen personalizada del módulo ${slug}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pan-configuracion'] })
      setEditandoMod(null)
      toast.success('Imagen actualizada ✅')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ? `Error: ${msg}` : 'Error al guardar imagen — revisa consola')
      console.error('[guardarImagen]', err)
    },
  })

  // ── Ventas y caja ──────────────────────────────────────────
  const { data: ventasRes } = useQuery<{
    total_ventas: number; num_ventas: number; ticket_promedio: number
  }>({
    queryKey: ['ventas-resumen-hoy'],
    queryFn:  () => {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      return api.get('/berlin/ventas/resumen', { params: { fecha: hoy } }).then(r => r.data)
    },
    refetchInterval: 30_000,
  })

  const { data: cajaActiva } = useQuery<{
    id: string; estado: string; monto_inicial: number; total_ventas: number;
    usuario_apertura?: { nombre: string }; apertura_at: string
  } | null>({
    queryKey: ['caja-activa'],
    queryFn:  () => api.get('/berlin/caja/turno-activo')
      .then(r => r.data)
      .catch(() => null),
    refetchInterval: 60_000,
    enabled: mostrarKpiCaja,
  })

  const aperturaHora = cajaActiva?.apertura_at
    ? new Date(cajaActiva.apertura_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : null

  const cajaColor = cajaActiva ? '#4ADE80' : '#F87171'
  const cajaLabel = cajaActiva
    ? `Abierta${aperturaHora ? ' · ' + aperturaHora : ''}`
    : 'Sin apertura'

  // módulo actualmente en edición
  const modEnEdicion = editandoMod
    ? ALL_MODULES.find(m => toSlug(m.label) === editandoMod)
    : null

  return (
    <div className="space-y-5">

      {/* ── Alerta: sin caja abierta ── */}
      {mostrarAlertaCaja && cajaActiva === null && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/20">
          <AlertCircle size={18} className="flex-shrink-0 text-red-400" />
          <div>
            <p className="font-semibold text-red-400">Caja sin apertura — No se pueden registrar ventas</p>
            <p className="text-xs mt-0.5 text-red-500">
              Ve al módulo{' '}
              <Link to={`${BASE}/caja`} className="underline text-red-300">Caja</Link>{' '}
              para abrir el turno del día.
            </p>
          </div>
        </div>
      )}

      {/* ── KPIs del día ── */}
      {(mostrarKpiVentas || mostrarKpiCaja) && (
        <div className={`grid gap-3 ${
          mostrarKpiCaja && mostrarKpiVentas ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'
        }`}>
          {mostrarKpiVentas && (
            <KpiCard icon={TrendingUp}  iconColor={FUCHSIA}    label="Ventas del día"  value={fmt(ventasRes?.total_ventas ?? 0)} />
          )}
          {mostrarKpiVentas && (
            <KpiCard icon={CheckCircle} iconColor="#4ADE80"    label="Transacciones"   value={ventasRes?.num_ventas ?? 0} />
          )}
          {mostrarKpiCaja && (
            <KpiCard icon={Banknote}    iconColor={cajaColor}  label="Caja"            value={cajaLabel} valueStyle={{ color: cajaColor, fontSize: '0.85rem' }} />
          )}
          {mostrarKpiCaja && (
            <KpiCard icon={Clock}       iconColor={GOLDEN}     label="Ticket promedio" value={fmt(ventasRes?.ticket_promedio ?? 0)} />
          )}
        </div>
      )}

      {/* ── Grid de módulos ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(233,30,140,0.55)' }}>
            Módulos del negocio
          </p>
          {/* Botones reordenar / editar imágenes — solo admin */}
          {esAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setDragMode(v => !v); if (editMode) setEditMode(false) }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold
                            border transition-colors ${
                  dragMode
                    ? 'bg-brand-teal/15 border-brand-teal/30 text-brand-teal'
                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                <GripVertical size={12} />
                {dragMode ? 'Listo' : 'Reordenar'}
              </button>
              <button
                onClick={() => { setEditMode(v => !v); if (dragMode) setDragMode(false) }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold
                            border transition-colors ${
                  editMode
                    ? 'bg-brand-teal/15 border-brand-teal/30 text-brand-teal'
                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                <Settings2 size={12} />
                {editMode ? 'Salir de edición' : 'Editar imágenes'}
              </button>
            </div>
          )}
        </div>

        {dragMode && (
          <p className="text-[11px] text-brand-teal/70 mb-3 flex items-center gap-1">
            <GripVertical size={11} /> Arrastra los módulos para cambiar su orden. El orden se guarda automáticamente en tu perfil.
          </p>
        )}
        {editMode && (
          <p className="text-[11px] text-brand-teal/70 mb-3 flex items-center gap-1">
            <Pencil size={11} /> Pasa el cursor sobre un módulo y haz clic en el lápiz para cambiar su imagen.
          </p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordenModulos} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 group">
              {modulosOrdenados.map(m => {
                const slug = toSlug(m.label)
                return (
                  <SortableModuleCard
                    key={m.label}
                    id={m.label}
                    esAdmin={esAdmin}
                    dragMode={dragMode}
                    {...m}
                    imagenUrl={imagenesModulos[slug]}
                    editMode={editMode}
                    onEdit={() => setEditandoMod(slug)}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Modal editar imagen ── */}
      {modEnEdicion && editandoMod && (
        <ModalEditarModulo
          label={modEnEdicion.label}
          color={modEnEdicion.color}
          imagenActual={imagenesModulos[editandoMod] ?? ''}
          onClose={() => setEditandoMod(null)}
          onSave={url => guardarImagen({ slug: editandoMod, url })}
        />
      )}

    </div>
  )
}
