import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../store/authStore'
import toast from 'react-hot-toast'
import {
  Banknote, Lock, Unlock, TrendingUp, ShoppingCart, Receipt,
  Clock, User, CheckCircle, XCircle, Printer, AlertCircle, AlertTriangle,
  DollarSign, ArrowUpCircle, ArrowDownCircle, Calendar, Shuffle,
} from 'lucide-react'
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

// Formatea un string de dígitos crudos como separador de miles colombiano
// "200000" → "200.000", "" → ""
const fmtInput = (raw: string): string => {
  if (!raw) return ''
  const n = parseInt(raw.replace(/\D/g, ''), 10)
  return isNaN(n) ? '' : n.toLocaleString('es-CO')
}
// Extrae solo dígitos del input formateado
const stripDigits = (val: string): string => val.replace(/\D/g, '')

interface TurnoCaja {
  id: string
  fecha: string
  apertura_at: string
  cierre_at?: string
  monto_inicial: number
  monto_final_real?: number
  total_ventas: number
  total_ventas_efectivo: number
  total_ventas_transferencia: number
  total_ventas_qr: number
  total_credito: number        // ventas a crédito del turno
  total_gastos: number
  num_ventas: number
  estado: 'abierto' | 'cerrado'
  notas_apertura?: string
  notas_cierre?: string
  usuario_apertura?: { id: string; nombre: string }
  usuario_cierre?: { id: string; nombre: string }
}

// ── Imprimir reporte de cierre de caja ───────────────────────────
function imprimirCierre(turno: TurnoCaja, cajero: string) {
  const origin = window.location.origin
  const fecha = new Date(turno.apertura_at).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const horaApertura = new Date(turno.apertura_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  const horaCierre   = turno.cierre_at ? new Date(turno.cierre_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'

  const efectivoEsperado = turno.monto_inicial + turno.total_ventas_efectivo - turno.total_gastos
  const diferencia = (turno.monto_final_real ?? 0) - efectivoEsperado

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Cierre de Caja ${turno.fecha}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  @page { margin:5mm; size:80mm auto }
  body { font-family:'Courier New',Courier,monospace; font-size:12px; width:100%; color:#000 }
  .c { text-align:center } .b { font-weight:bold }
  .sep  { border-top:1px dashed #000; margin:5px 0 }
  .sep2 { border-top:2px solid  #000; margin:5px 0 }
  .row  { display:flex; justify-content:space-between; gap:6px; margin:2px 0 }
  .row > span:first-child { flex:1; min-width:0 }
  .amt  { flex-shrink:0; text-align:right; white-space:nowrap; font-weight:700; min-width:58px }
  .sm   { font-size:10px; color:#444 }
  .xl   { font-size:17px; font-weight:900; white-space:nowrap }
  .ok   { font-weight:900 }
  img.logo { display:block; margin:4px auto; max-width:60mm; height:auto; max-height:20mm; object-fit:contain }
</style>
</head>
<body>
<img class="logo" src="${origin}/logos/berlin.png" alt="Berlín Café Bar" />
<div class="c" style="margin-bottom:4px">
  <p class="b" style="font-size:13px">*Café Bar Berlín*</p>
  <p class="sm">NIT: 1035424712-4</p>
  <p class="sm">Direccion: Calle 28 #30-19 - Don Matias, Antioquia</p>
  <p class="sm">Tel: 3215994825</p>
</div>
<div class="sep2"></div>
<div class="c">
  <p class="b" style="font-size:14px">REPORTE CIERRE DE CAJA</p>
  <p class="sm">${fecha}</p>
  <p class="sm">Cajero: <b>${cajero}</b></p>
</div>
<div class="sep2"></div>

<div class="row sm"><span>Apertura:</span><span>${horaApertura}</span></div>
<div class="row sm"><span>Cierre:</span><span>${horaCierre}</span></div>
<div class="row sm"><span>Cajero cierre:</span><span>${turno.usuario_cierre?.nombre ?? cajero}</span></div>

<div class="sep"></div>
<p class="b sm" style="margin-bottom:3px">VENTAS DEL TURNO</p>
<div class="row"><span>Total ventas:</span><span class="amt">${fmt(turno.total_ventas)}</span></div>
<div class="row sm"><span>&nbsp;&nbsp;Efectivo:</span><span class="amt">${fmt(turno.total_ventas_efectivo)}</span></div>
<div class="row sm"><span>&nbsp;&nbsp;Transferencia:</span><span class="amt">${fmt(turno.total_ventas_transferencia)}</span></div>
<div class="row sm"><span>&nbsp;&nbsp;QR / Nequi:</span><span class="amt">${fmt(turno.total_ventas_qr)}</span></div>
<div class="row sm"><span>&nbsp;&nbsp;Credito:</span><span class="amt">${fmt(turno.total_credito ?? 0)}</span></div>
<div class="row sm"><span>No. transacciones:</span><span class="amt">${turno.num_ventas}</span></div>

<div class="sep"></div>
<p class="b sm" style="margin-bottom:3px">ARQUEO DE CAJA</p>
<div class="row"><span>Monto inicial:</span><span class="amt">${fmt(turno.monto_inicial)}</span></div>
<div class="row"><span>+ Ventas efectivo:</span><span class="amt">${fmt(turno.total_ventas_efectivo)}</span></div>
<div class="row"><span>- Gastos pagados:</span><span class="amt">${fmt(turno.total_gastos)}</span></div>
<div class="sep"></div>
<div class="row b"><span>Efectivo esperado:</span><span class="amt">${fmt(efectivoEsperado)}</span></div>
<div class="row b"><span>Efectivo contado:</span><span class="amt">${fmt(turno.monto_final_real ?? 0)}</span></div>
<div class="row" style="margin-top:4px;padding-top:4px;border-top:2px solid #000">
  <span class="ok" style="font-size:13px">DIFERENCIA:</span>
  <span class="xl" style="${diferencia < 0 ? 'color:#cc0000' : diferencia > 0 ? 'color:#006600' : ''}">${diferencia >= 0 ? '+' : ''}${fmt(diferencia)}</span>
</div>

${turno.notas_apertura ? `<div class="sep"></div><p class="b sm">Nota apertura:</p><p class="sm" style="white-space:pre-wrap">${turno.notas_apertura}</p>` : ''}
${turno.notas_cierre ? `<p class="b sm" style="margin-top:4px">Nota cierre:</p><p class="sm" style="white-space:pre-wrap">${turno.notas_cierre}</p>` : ''}

<div class="sep"></div>
<div class="c sm">
  <p>Reporte generado por Sistema Kalreco v1.0</p>
  <p>app.mymulticentro.com</p>
</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width:440,height:760')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); setTimeout(() => win.close(), 800) }, 400)
  }
}

// ── Componente principal ──────────────────────────────────────────
export default function CajaPage() {
  const user        = useAuthStore(s => s.user)
  const queryClient = useQueryClient()

  const [montoInicial,    setMontoInicial]    = useState('')
  const [notasApertura,   setNotasApertura]   = useState('')
  const [montoCierre,     setMontoCierre]     = useState('')
  const [notasCierre,     setNotasCierre]     = useState('')
  const [showCierreModal, setShowCierreModal] = useState(false)
  // Conteo aleatorio — paso 2 del cierre
  const [cierreStep,    setCierreStep]    = useState<1|2>(1)
  const [conteoItems,   setConteoItems]   = useState<{id:string;nombre:string;imagen_url?:string;stock_actual:number;contado:string}[]>([])

  // ── Turno activo ──
  const { data: turnoActivo, isLoading } = useQuery<TurnoCaja | null>({
    queryKey: ['caja-activa'],
    queryFn:  () => api.get('/berlin/caja/turno-activo').then(r => r.data).catch(() => null),
    refetchInterval: 30_000,
  })

  // ── Turno pendiente de días anteriores (sin cerrar) ──
  const { data: turnoPendienteDia } = useQuery<{ id: string; fecha: string } | null>({
    queryKey: ['caja-turno-pendiente'],
    queryFn:  () => api.get('/berlin/caja/turno-pendiente').then(r => r.data).catch(() => null),
    refetchInterval: 60_000,
    enabled: !turnoActivo,
  })

  // ── Historial ──
  const { data: historial = [] } = useQuery<TurnoCaja[]>({
    queryKey: ['caja-historial'],
    queryFn:  () => api.get('/berlin/caja/historial').then(r => r.data),
  })

  // ── Ventas del día — GLOBAL (todos los cajeros)
  const { data: ventasHoy } = useQuery<{
    total_ventas: number; num_ventas: number; efectivo: number;
    transferencias: number; qr: number; credito: number; ticket_promedio: number
  }>({
    queryKey: ['ventas-resumen-hoy'],
    queryFn:  () => api.get('/berlin/ventas/resumen').then(r => r.data),
    refetchInterval: 30_000,
    enabled: !!turnoActivo,
  })

  // ── Ventas del turno — solo el cajero actual
  const { data: ventasTurno } = useQuery<{
    total_ventas: number; num_ventas: number; efectivo: number;
    transferencias: number; qr: number; credito: number; ticket_promedio: number
  }>({
    queryKey: ['ventas-turno-actual'],
    queryFn:  () => api.get('/berlin/caja/ventas-turno').then(r => r.data),
    refetchInterval: 30_000,
    enabled: !!turnoActivo,
  })

  // ── Productos para conteo aleatorio ──
  const { data: todosProductos = [] } = useQuery<{id:string;nombre:string;imagen_url?:string;stock_actual:number}[]>({
    queryKey: ['productos-conteo'],
    queryFn:  () => api.get('/berlin/productos', { params: { limit: 200 } }).then(r => r.data).catch(() => []),
    enabled:  !!turnoActivo,
    staleTime: 5 * 60_000,
  })

  // Selecciona N productos aleatorios con stock > 0
  const sortearProductos = (n = 5) => {
    const conStock = todosProductos.filter(p => p.stock_actual > 0)
    const shuffled = [...conStock].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(n, shuffled.length)).map(p => ({
      ...p, contado: '',
    }))
  }

  // ── Mutaciones ──
  const { mutate: abrirCaja, isPending: abriendo } = useMutation({
    mutationFn: () => api.post('/berlin/caja/apertura', {
      monto_inicial:  parseInt(montoInicial) || 0,
      notas_apertura: notasApertura || undefined,
    }),
    onSuccess: () => {
      toast.success('✅ Turno abierto correctamente')
      setMontoInicial('')
      setNotasApertura('')
      queryClient.invalidateQueries({ queryKey: ['caja-activa'] })
      queryClient.invalidateQueries({ queryKey: ['caja-historial'] })
      queryClient.invalidateQueries({ queryKey: ['ventas-turno-actual'] })
      // Activar POS y Mesas inmediatamente sin esperar el intervalo de 30s
      queryClient.invalidateQueries({ queryKey: ['turno-activo-pos'] })
      queryClient.invalidateQueries({ queryKey: ['turno-activo-mesas'] })
      queryClient.invalidateQueries({ queryKey: ['turno-negocio-activo'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al abrir caja')
    },
  })

  const { mutate: cerrarTurnoHistorico, isPending: cerrandoHistorico } = useMutation({
    mutationFn: (turnoId: string) => api.post(`/berlin/caja/${turnoId}/cerrar`, { notas_cierre: 'Cierre manual de turno pendiente' }),
    onSuccess: (res) => {
      toast.success('✅ Turno cerrado correctamente')
      queryClient.invalidateQueries({ queryKey: ['caja-activa'] })
      queryClient.invalidateQueries({ queryKey: ['caja-historial'] })
      queryClient.invalidateQueries({ queryKey: ['caja-turno-pendiente'] })
      queryClient.invalidateQueries({ queryKey: ['turno-activo-mesas'] })
      queryClient.invalidateQueries({ queryKey: ['turno-negocio-activo'] })
      if (res.data) imprimirCierre(res.data, user?.nombre ?? 'Admin')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al cerrar turno')
    },
  })

  const { mutate: cerrarCaja, isPending: cerrando } = useMutation({
    mutationFn: () => api.post('/berlin/caja/cierre', {
      monto_final_real: parseInt(montoCierre) || 0,
      notas_cierre:     notasCierre || undefined,
    }),
    onSuccess: (res) => {
      toast.success('✅ Turno cerrado correctamente')
      setShowCierreModal(false)
      setMontoCierre('')
      setNotasCierre('')
      setCierreStep(1)
      setConteoItems([])
      queryClient.invalidateQueries({ queryKey: ['caja-activa'] })
      queryClient.invalidateQueries({ queryKey: ['caja-historial'] })
      queryClient.invalidateQueries({ queryKey: ['caja-turno-pendiente'] })
      queryClient.invalidateQueries({ queryKey: ['ventas-turno-actual'] })
      if (res.data) imprimirCierre(res.data, user?.nombre ?? 'Admin')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al cerrar caja')
    },
  })

  const horaApertura = turnoActivo?.apertura_at
    ? new Date(turnoActivo.apertura_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : null

  // ── Render ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-20 text-gray-500 text-sm">
        Cargando estado de caja...
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Banknote size={20} className={turnoActivo ? 'text-green-400' : 'text-red-400'} />
          <h2 className="text-lg font-bold text-white">Caja y Turnos</h2>
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full border font-semibold',
            turnoActivo
              ? 'bg-green-500/15 text-green-400 border-green-500/30'
              : 'bg-red-500/15 text-red-400 border-red-500/30'
          )}>
            {turnoActivo ? '● Turno abierto' : '○ Sin turno'}
          </span>
        </div>
      </div>

      {/* ═══ TURNO ACTIVO ════════════════════════════════════════ */}
      {turnoActivo ? (
        <div className="space-y-4">

          {/* Datos del turno */}
          <div className="bg-brand-navy rounded-2xl border border-green-500/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Unlock size={16} className="text-green-400" />
                  <p className="text-sm font-bold text-green-400">Turno activo</p>
                </div>
                <p className="text-white font-semibold">
                  {new Date(turnoActivo.apertura_at).toLocaleDateString('es-CO', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                  <Clock size={11} />
                  <span>Abierto a las {horaApertura}</span>
                  {turnoActivo.usuario_apertura && (
                    <>
                      <span>·</span>
                      <User size={11} />
                      <span>{turnoActivo.usuario_apertura.nombre}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCierreModal(true)}
                  className="flex items-center gap-1.5 text-sm font-semibold
                             bg-red-500/10 hover:bg-red-500/20 text-red-400
                             border border-red-500/30 px-4 py-2 rounded-xl transition-colors"
                >
                  <Lock size={14} /> Cerrar turno
                </button>
              </div>
            </div>
          </div>

          {/* KPIs — fila resumen general */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Monto inicial',    value: fmt(turnoActivo.monto_inicial),         icon: DollarSign,   color: 'text-gray-300'   },
              { label: 'Ventas del día',   value: fmt(ventasHoy?.total_ventas ?? 0),       icon: TrendingUp,   color: 'text-brand-teal' },
              { label: 'Ventas del turno', value: fmt(ventasTurno?.total_ventas ?? 0),     icon: Receipt,      color: 'text-amber-400'  },
              { label: 'Efectivo en caja', value: fmt(turnoActivo.monto_inicial + (ventasTurno?.efectivo ?? 0)), icon: Banknote, color: 'text-green-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-brand-navy rounded-xl border border-white/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={color} />
                  <p className="text-[11px] text-gray-500">{label}</p>
                </div>
                <p className={cn('text-lg font-bold', color)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Ventas del turno — desglose por método de pago */}
          <div className="bg-brand-navy rounded-xl border border-amber-500/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Receipt size={13} className="text-amber-400" />
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Ventas del turno — {ventasTurno?.num_ventas ?? 0} transacciones
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Efectivo',      value: ventasTurno?.efectivo ?? 0,       color: 'text-green-400'  },
                { label: 'Transferencia', value: ventasTurno?.transferencias ?? 0, color: 'text-blue-400'   },
                { label: 'QR / Nequi',   value: ventasTurno?.qr ?? 0,             color: 'text-purple-400' },
                { label: 'Crédito',       value: ventasTurno?.credito ?? 0,        color: 'text-pink-400'   },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-brand-dark rounded-lg p-3">
                  <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                  <p className={cn('text-base font-bold', color)}>{fmt(value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ventas del día global — referencia para admin */}
          <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Ventas del día — todos los cajeros</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Efectivo',      value: ventasHoy?.efectivo ?? 0,       color: 'text-green-400'  },
                { label: 'Transferencia', value: ventasHoy?.transferencias ?? 0, color: 'text-blue-400'   },
                { label: 'QR / Nequi',   value: ventasHoy?.qr ?? 0,             color: 'text-purple-400' },
                { label: 'Crédito',       value: ventasHoy?.credito ?? 0,        color: 'text-pink-400'   },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-brand-dark rounded-lg p-3">
                  <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                  <p className={cn('text-base font-bold', color)}>{fmt(value)}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : (
        /* ═══ SIN TURNO — FORMULARIO APERTURA ══════════════════ */
        <div className="max-w-md mx-auto space-y-4">

          {/* Alerta turno pendiente de días anteriores */}
          {turnoPendienteDia && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-500/15 flex-shrink-0">
                  <AlertTriangle size={18} className="text-red-400" />
                </div>
                <div>
                  <p className="font-bold text-red-300 text-sm">Cierre de turno pendiente</p>
                  <p className="text-xs text-red-300/80 mt-1">
                    Tienes un turno sin cerrar del <span className="font-bold">{turnoPendienteDia.fecha}</span>.
                    Debes cerrarlo antes de abrir un nuevo turno.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`¿Cerrar el turno pendiente del ${turnoPendienteDia.fecha}? Se calcularán las ventas de ese día.`)) {
                    cerrarTurnoHistorico(turnoPendienteDia.id)
                  }
                }}
                disabled={cerrandoHistorico}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-red-500/20 hover:bg-red-500/30 border border-red-500/40
                           text-red-300 text-sm font-semibold transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock size={14} />
                {cerrandoHistorico ? 'Cerrando...' : `Cerrar turno del ${turnoPendienteDia.fecha}`}
              </button>
            </div>
          )}

          <div className={cn(
            'bg-brand-navy rounded-2xl border p-6 space-y-4',
            turnoPendienteDia ? 'border-red-500/20 opacity-50 pointer-events-none' : 'border-amber-500/20',
          )}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <AlertCircle size={20} className="text-amber-400" />
              </div>
              <div>
                <p className="font-bold text-white">Apertura de turno</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  Dinero en caja al inicio del turno
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fmtInput(montoInicial)}
                    onChange={e => setMontoInicial(stripDigits(e.target.value))}
                    placeholder="0"
                    className="w-full bg-brand-dark border border-white/10 rounded-xl
                               pl-7 pr-4 py-3 text-white font-bold text-lg
                               focus:outline-none focus:border-green-500/50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={notasApertura}
                  onChange={e => setNotasApertura(e.target.value)}
                  placeholder="Observaciones del turno..."
                  className="w-full bg-brand-dark border border-white/10 rounded-xl
                             px-4 py-2.5 text-sm text-white
                             focus:outline-none focus:border-brand-teal/50 transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 bg-brand-dark rounded-xl p-3 border border-white/5">
                <User size={14} className="text-gray-500 flex-shrink-0" />
                <p className="text-sm text-gray-400">
                  Cajero: <span className="text-white font-medium">{user?.nombre ?? 'Usuario'}</span>
                </p>
              </div>
            </div>

            {/* Validación mínimo $1.000 */}
            {montoInicial && parseInt(montoInicial) < 1000 && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 -mt-1">
                <AlertCircle size={12}/>
                El monto inicial debe ser mínimo $1.000
              </p>
            )}

            <button
              onClick={() => abrirCaja()}
              disabled={abriendo || !montoInicial || parseInt(montoInicial) < 1000 || !!turnoPendienteDia}
              className="w-full flex items-center justify-center gap-2 font-bold py-4 rounded-xl
                         bg-green-500 hover:bg-green-400 text-white text-base
                         transition-colors active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Unlock size={18} />
              {abriendo ? 'Abriendo...' : 'Abrir turno de caja'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ HISTORIAL DE TURNOS ════════════════════════════════ */}
      {historial.length > 0 && (
        <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
            <Calendar size={15} className="text-gray-500" />
            <h3 className="font-semibold text-white text-sm">Historial de turnos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-white/5 bg-brand-dark/40">
                  <th className="text-left px-3 py-3">Fecha</th>
                  <th className="text-left px-3 py-3">Cajero</th>
                  <th className="text-right px-3 py-3">Inicial</th>
                  <th className="text-right px-3 py-3">Total</th>
                  <th className="text-right px-3 py-3">Efec.</th>
                  <th className="text-right px-3 py-3">Trans.</th>
                  <th className="text-right px-3 py-3 text-blue-400">Créd.</th>
                  <th className="text-center px-3 py-3">Estado</th>
                  <th className="text-center px-3 py-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {historial.slice(0, 15).map(t => (
                  <tr key={t.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-3 py-3 text-white font-medium text-xs">
                      {new Date(t.apertura_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs">{t.usuario_apertura?.nombre ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-300 font-mono text-xs">{fmt(t.monto_inicial)}</td>
                    <td className="px-3 py-3 text-right text-brand-teal font-mono text-xs font-bold">{fmt(t.total_ventas)}</td>
                    <td className="px-3 py-3 text-right text-green-400 font-mono text-xs">{fmt(t.total_ventas_efectivo ?? 0)}</td>
                    <td className="px-3 py-3 text-right text-purple-400 font-mono text-xs">{fmt(t.total_ventas_transferencia ?? 0)}</td>
                    <td className="px-3 py-3 text-right text-blue-400 font-mono text-xs">{fmt(t.total_credito ?? 0)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full border',
                        t.estado === 'abierto'
                          ? 'bg-green-500/15 text-green-400 border-green-500/30'
                          : 'bg-gray-500/15 text-gray-400 border-gray-500/20'
                      )}>
                        {t.estado === 'abierto' ? 'Abierto' : 'Cerrado'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {t.estado === 'cerrado' ? (
                        <button
                          onClick={() => imprimirCierre(t, t.usuario_cierre?.nombre ?? '')}
                          className="text-gray-500 hover:text-brand-teal transition-colors p-1"
                          title="Imprimir reporte"
                        >
                          <Printer size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (confirm(`¿Cerrar el turno del ${t.fecha}? Se calcularán las ventas de ese día automáticamente.`)) {
                              cerrarTurnoHistorico(t.id)
                            }
                          }}
                          disabled={cerrandoHistorico}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                          title="Cerrar turno pendiente"
                        >
                          <Lock size={11} />
                          Cerrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODAL CIERRE DE CAJA ═══════════════════════════════ */}
      {showCierreModal && turnoActivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-brand-navy rounded-2xl border border-white/10 p-6 w-full max-w-md space-y-4 shadow-2xl my-auto">

            {/* Indicador de paso */}
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                cierreStep === 1 ? 'bg-red-500 text-white' : 'bg-green-500/20 text-green-400 border border-green-500/30')}>1</div>
              <div className="flex-1 h-px bg-white/10"/>
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                cierreStep === 2 ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-600')}>2</div>
              <p className="text-xs text-gray-500 ml-1">
                {cierreStep === 1 ? 'Arqueo de caja' : 'Conteo aleatorio'}
              </p>
            </div>

            {/* ── PASO 1: Arqueo de caja ── */}
            {cierreStep === 1 && (<>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/10">
                  <Lock size={20} className="text-red-400" />
                </div>
                <div>
                  <p className="font-bold text-white">Cerrar turno de caja</p>
                  <p className="text-xs text-gray-500">
                    Ventas del turno: <span className="text-white">{fmt(ventasTurno?.total_ventas ?? 0)}</span>
                    {' '}({ventasTurno?.num_ventas ?? 0} transacciones)
                  </p>
                </div>
              </div>

              <div className="bg-brand-dark rounded-xl p-4 space-y-2 border border-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Monto inicial:</span>
                  <span className="text-white font-mono">{fmt(turnoActivo.monto_inicial)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">+ Ventas efectivo:</span>
                  <span className="text-green-400 font-mono">{fmt(ventasTurno?.efectivo ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-white/5 pt-2 font-bold">
                  <span className="text-gray-300">Efectivo esperado:</span>
                  <span className="text-white font-mono">
                    {fmt(turnoActivo.monto_inicial + (ventasTurno?.efectivo ?? 0))}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  Efectivo contado en caja al cierre
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="text" inputMode="numeric"
                    value={fmtInput(montoCierre)}
                    onChange={e => setMontoCierre(stripDigits(e.target.value))}
                    placeholder="0" autoFocus
                    className="w-full bg-brand-dark border border-white/10 rounded-xl
                               pl-7 pr-4 py-3 text-white font-bold text-lg
                               focus:outline-none focus:border-brand-teal/50 transition-colors"
                  />
                </div>
                {montoCierre && (() => {
                  const esperado = turnoActivo.monto_inicial + (ventasTurno?.efectivo ?? 0)
                  const contado  = parseInt(montoCierre) || 0
                  const diff     = contado - esperado
                  return (
                    <p className={cn('text-xs mt-1 ml-1 font-semibold', diff < 0 ? 'text-red-400' : diff > 0 ? 'text-yellow-400' : 'text-green-400')}>
                      Diferencia: {diff >= 0 ? '+' : ''}{fmt(diff)}
                      {diff < 0 ? ' ⚠️ Faltante' : diff > 0 ? ' Sobrante' : ' ✓ Cuadra'}
                    </p>
                  )
                })()}
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">Notas del cierre (opcional)</label>
                <input
                  type="text" value={notasCierre}
                  onChange={e => setNotasCierre(e.target.value)}
                  placeholder="Observaciones..."
                  className="w-full bg-brand-dark border border-white/10 rounded-xl
                             px-4 py-2.5 text-sm text-white
                             focus:outline-none focus:border-brand-teal/50 transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowCierreModal(false); setCierreStep(1); setConteoItems([]) }}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400
                             hover:bg-white/5 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const items = sortearProductos(5)
                    setConteoItems(items)
                    setCierreStep(2)
                  }}
                  disabled={!montoCierre}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                             bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm
                             transition-colors disabled:opacity-40"
                >
                  <Shuffle size={15} />
                  Siguiente → Conteo
                </button>
              </div>
            </>)}

            {/* ── PASO 2: Conteo aleatorio ── */}
            {cierreStep === 2 && (<>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500/10">
                  <Shuffle size={20} className="text-orange-400" />
                </div>
                <div>
                  <p className="font-bold text-white">Conteo aleatorio de inventario</p>
                  <p className="text-xs text-gray-500">Cuenta físicamente estos productos y registra la cantidad real</p>
                </div>
              </div>

              <div className="space-y-2">
                {conteoItems.map((item, idx) => {
                  const contado = parseInt(item.contado) || 0
                  const diff    = contado - item.stock_actual
                  return (
                    <div key={item.id} className="bg-brand-dark rounded-xl px-4 py-3 border border-white/5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{item.nombre}</p>
                          <p className="text-[10px] text-gray-500">Sistema: {item.stock_actual} uds.</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <input
                            type="number" min="0"
                            value={item.contado}
                            onChange={e => setConteoItems(prev => prev.map((it, i) =>
                              i === idx ? { ...it, contado: e.target.value } : it
                            ))}
                            placeholder="0"
                            className="w-20 bg-brand-navy border border-white/15 rounded-lg px-3 py-2
                                       text-white text-sm font-bold text-center focus:outline-none
                                       focus:border-brand-teal/50"
                          />
                          {item.contado !== '' && (
                            <span className={cn('text-xs font-bold w-12 text-right',
                              diff < 0 ? 'text-red-400' : diff > 0 ? 'text-yellow-400' : 'text-green-400')}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {conteoItems.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Sin productos con stock para contar
                  </p>
                )}
              </div>

              {/* Resumen descuadres */}
              {conteoItems.some(i => i.contado !== '' && parseInt(i.contado) !== i.stock_actual) && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs text-yellow-300 font-semibold">⚠️ Descuadres detectados</p>
                  {conteoItems
                    .filter(i => i.contado !== '' && parseInt(i.contado) !== i.stock_actual)
                    .map(i => (
                      <p key={i.id} className="text-[11px] text-yellow-200/70 mt-0.5">
                        {i.nombre}: sistema {i.stock_actual} · físico {i.contado}
                        {' '}({parseInt(i.contado) - i.stock_actual > 0 ? '+' : ''}{parseInt(i.contado) - i.stock_actual})
                      </p>
                    ))
                  }
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCierreStep(1)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400
                             hover:bg-white/5 transition-colors text-sm"
                >
                  ← Volver
                </button>
                <button
                  onClick={() => cerrarCaja()}
                  disabled={cerrando}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                             bg-red-500 hover:bg-red-400 text-white font-bold text-sm
                             transition-colors active:scale-[0.97] disabled:opacity-50"
                >
                  <Lock size={15} />
                  {cerrando ? 'Cerrando...' : 'Confirmar cierre'}
                </button>
              </div>
            </>)}

          </div>
        </div>
      )}

    </div>
  )
}
