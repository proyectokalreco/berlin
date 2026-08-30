import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../store/authStore'
import {
  BookOpen, TrendingUp, TrendingDown, ShoppingCart,
  Wallet, ChevronDown, ChevronUp, Calendar, Check, X,
  List, Table2, Download,
} from 'lucide-react'

// Clonado de apps/panel/src/pages/credito/esquinadelcredito/movimientos/MovimientosPage.tsx
// (2026-08-23) — adaptado a Café Bar Berlín: Berlín no tiene el concepto de
// "financiadora" de Esquina, así que el bolsillo CxC se arma con el mismo criterio
// (metodo_pago='credito') sobre la misma fuente unificada, sin queries aparte.

type BolsilloTipo = 'efectivo' | 'electronico' | 'cxc'

const BOLSILLO_CONFIG: Record<BolsilloTipo, { titulo: string; emoji: string; color: string }> = {
  efectivo:    { titulo: 'Efectivo',    emoji: '💵', color: '#10B981' },
  electronico: { titulo: 'Electrónico', emoji: '📱', color: '#6366F1' },
  cxc:         { titulo: 'CxC (Crédito clientes)', emoji: '🏦', color: '#D99439' },
}

// Mismo criterio que el backend (movimientos.controller.js de panaderia)
const EXCLUIR_KPI = ['apertura_caja', 'cierre_caja', 'anulacion_venta', 'produccion', 'venta_mesa']
const esElectronico = (mp: string | null | undefined) =>
  mp === 'transferencia' || (mp || '').includes('qr') || mp === 'pago_electronico'

function filtrarBolsillo(movs: any[], bolsillo: BolsilloTipo): any[] {
  const base = movs.filter(m => !EXCLUIR_KPI.includes(m.categoria))
  if (bolsillo === 'efectivo') {
    return base.filter(m =>
      (m.tipo === 'ingreso' || m.tipo === 'egreso') && m.metodo_pago !== 'credito' && !esElectronico(m.metodo_pago)
    )
  }
  if (bolsillo === 'electronico') {
    return base.filter(m => (m.tipo === 'ingreso' || m.tipo === 'egreso') && esElectronico(m.metodo_pago))
  }
  // cxc: ventas a crédito (no hay cobros de financiadora en Berlín, a diferencia de Esquina)
  return base.filter(m => m.tipo === 'ingreso' && m.metodo_pago === 'credito')
}

const fmt2 = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

function BolsilloModal({ bolsillo, movimientos, saldoInicial, onClose }: {
  bolsillo: BolsilloTipo
  movimientos: any[]
  saldoInicial: number
  onClose: () => void
}) {
  const cfg = BOLSILLO_CONFIG[bolsillo]
  const filas = filtrarBolsillo(movimientos, bolsillo)
  const isCxc = bolsillo === 'cxc'

  const total = isCxc
    ? filas.reduce((s, m) => s + parseFloat(m.monto), 0)
    : saldoInicial + filas.reduce((s, m) => s + (m.tipo === 'ingreso' ? parseFloat(m.monto) : -parseFloat(m.monto)), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{cfg.emoji} {cfg.titulo}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Movimientos acumulados desde saldo inicial</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {!isCxc && saldoInicial > 0 && (
            <div className="flex items-center gap-3 px-5 py-3 bg-violet-50/60">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-500 italic">Saldo inicial</p>
                <p className="text-[11px] text-slate-400">Valor de apertura del bolsillo</p>
              </div>
              <span className="text-sm font-bold text-violet-600 flex-shrink-0">+{fmt2(saldoInicial)}</span>
            </div>
          )}

          {filas.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-400">Sin movimientos en este bolsillo</p>
          ) : filas.map((m: any, i: number) => {
            const monto = parseFloat(m.monto)
            const esIng = m.tipo === 'ingreso'
            return (
              <div key={m.id ?? i} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{m.concepto}</p>
                  <p className="text-[11px] text-slate-400">
                    {m.categoria} · {String(m.fecha).slice(0, 10)}
                    {m.registrado_por_user?.nombre ? ` · ${m.registrado_por_user.nombre}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: esIng ? '#10B981' : '#EF4444' }}>
                  {esIng ? '+' : '-'}{fmt2(monto)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center">
          <p className="text-xs text-slate-400">{filas.length} movimiento{filas.length !== 1 ? 's' : ''}</p>
          <p className="text-sm font-bold" style={{ color: total >= 0 ? cfg.color : '#EF4444' }}>Total acumulado: {fmt2(total)}</p>
        </div>
      </div>
    </div>
  )
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
const fmtShort = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)

type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'rango'
type TipoFiltro = '' | 'ingreso' | 'gasto' | 'compra'
type VistaMode = 'lista' | 'tabla'
const CAT_COMPRAS = ['compra_proveedor']

const VIOLET = '#D99439'

function agruparFilasTabla(filas: any[], saldoBase: number): any[] {
  const ventasPorFecha: Record<string, { ingreso: number; count: number }> = {}
  const procesados = new Set<string>()
  filas.forEach((f: any) => {
    if (f.categoria === 'venta') {
      const dia = String(f.fecha).slice(0, 10)
      if (!ventasPorFecha[dia]) ventasPorFecha[dia] = { ingreso: 0, count: 0 }
      ventasPorFecha[dia].ingreso += f.ingreso || 0
      ventasPorFecha[dia].count++
      procesados.add(f.id)
    }
  })
  const agrupadas: any[] = []
  const fechasVistas = new Set<string>()
  filas.forEach((f: any) => {
    if (procesados.has(f.id)) {
      const dia = String(f.fecha).slice(0, 10)
      if (!fechasVistas.has(dia)) {
        fechasVistas.add(dia)
        const v = ventasPorFecha[dia]
        agrupadas.push({ _resumen: true, fecha: dia, concepto: 'Total ventas del día', categoria: `${v.count} ${v.count === 1 ? 'venta' : 'ventas'}`, ingreso: v.ingreso, egreso: 0, compra: 0 })
      }
    } else {
      agrupadas.push({ ...f, fecha: String(f.fecha).slice(0, 10) })
    }
  })
  let saldo = saldoBase
  const conSaldo = agrupadas.map((f: any) => {
    saldo = saldo + (f.ingreso || 0) - (f.egreso || 0) - (f.compra || 0)
    return { ...f, saldo }
  })
  return conSaldo.reverse()
}

function ListaMovimientos({ filas, tipoColor, tipoLabel }: { filas: any[]; tipoColor: (m: any) => string; tipoLabel: (m: any) => string }) {
  if (filas.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white text-center py-12 text-slate-400 shadow-sm">Sin movimientos en este período</div>
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="divide-y divide-slate-100">
        {filas.map((m: any, i: number) => (
          <div key={m.id ?? i} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ color: tipoColor(m), background: `${tipoColor(m)}18` }}>
                {tipoLabel(m)}
              </span>
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: '#0F172A' }}>{m.concepto}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                  {m.categoria} · {String(m.fecha).slice(0, 10)}{m.registrado_por_user?.nombre ? ` · ${m.registrado_por_user.nombre}` : ''}
                </p>
              </div>
            </div>
            <span className="ml-4 font-bold text-sm flex-shrink-0" style={{ color: tipoColor(m) }}>
              {m.tipo === 'ingreso' ? '+' : '-'}{fmt(parseFloat(m.monto))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MovimientosPage() {
  const user    = useAuthStore(s => s.user)
  const esAdmin = ['super_admin', 'admin', 'admin_berlin'].includes(user?.rol ?? '')
  const puedeEditarSaldo = ['super_admin', 'admin_berlin'].includes(user?.rol ?? '')
  const qc = useQueryClient()

  const [periodo,       setPeriodo]       = useState<Periodo>('mes')
  const [tipo,          setTipo]          = useState<TipoFiltro>('')
  const [desde,         setDesde]         = useState('')
  const [hasta,         setHasta]         = useState('')
  const [utilidadOpen,  setUtilidadOpen]  = useState(false)
  const [editSaldo,        setEditSaldo]        = useState(false)
  const [nuevoEfectivo,    setNuevoEfectivo]    = useState('')
  const [nuevoElectronico, setNuevoElectronico] = useState('')
  const [nuevoCxc,         setNuevoCxc]         = useState('')
  const [nuevoSaldoFecha,  setNuevoSaldoFecha]  = useState('')
  const [vistaMode,     setVistaMode]     = useState<VistaMode>('lista')
  const [bolsilloModal, setBolsilloModal] = useState<BolsilloTipo | null>(null)

  const rangoValido = periodo === 'rango' && desde && hasta

  const resumenParams: Record<string, string> = { periodo }
  if (rangoValido) { resumenParams.desde = desde; resumenParams.hasta = hasta }

  // Rango de fechas del período seleccionado — mismo rango para libro-diario (lista y tabla)
  const rangoParams: Record<string, string> = {}
  if (rangoValido) {
    rangoParams.desde = desde; rangoParams.hasta = hasta
  } else if (periodo !== 'rango') {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    if (periodo === 'hoy') { rangoParams.desde = hoy; rangoParams.hasta = hoy }
    else if (periodo === 'semana') {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      d.setDate(d.getDate() - 6)
      rangoParams.desde = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); rangoParams.hasta = hoy
    } else if (periodo === 'mes') { rangoParams.desde = hoy.substring(0, 7) + '-01'; rangoParams.hasta = hoy }
  }

  const { data: resumen } = useQuery({
    queryKey: ['pan-movimientos-resumen', periodo, desde, hasta],
    queryFn:  () => api.get('/berlin/movimientos/resumen', { params: resumenParams }).then(r => r.data),
    enabled:  periodo !== 'rango' || !!rangoValido,
    refetchInterval: 30_000,
  })

  const { data: granBolsaData } = useQuery({
    queryKey: ['pan-gran-bolsa'],
    queryFn:  () => api.get('/berlin/movimientos/gran-bolsa').then(r => r.data),
    refetchInterval: 60_000,
  })

  // Todos los movimientos sin filtro de fecha — solo para el modal de bolsillo
  const { data: todosMovimientos = [] } = useQuery({
    queryKey: ['pan-movimientos-todos'],
    queryFn:  () => api.get('/berlin/movimientos/libro-diario').then(r => r.data?.filas ?? []),
    enabled:  bolsilloModal !== null,
    staleTime: 60_000,
  })

  // Fuente única para Lista y Tabla — movimientos + ventas ya unificados por el backend
  const { data: libroDiarioData, isLoading: ldLoading } = useQuery({
    queryKey: ['pan-libro-diario', periodo, desde, hasta],
    queryFn:  () => api.get('/berlin/movimientos/libro-diario', { params: rangoParams }).then(r => r.data),
    enabled:  periodo !== 'rango' || !!rangoValido,
    refetchInterval: 30_000,
  })

  const filasPeriodo: any[] = libroDiarioData?.filas ?? []
  const movimientosFiltrados = filasPeriodo.filter((m: any) => {
    if (tipo === 'ingreso') return m.tipo === 'ingreso'
    if (tipo === 'gasto')   return m.tipo === 'egreso' && !CAT_COMPRAS.includes(m.categoria)
    if (tipo === 'compra')  return CAT_COMPRAS.includes(m.categoria)
    return true
  }).slice().reverse()

  const saldoMutation = useMutation({
    mutationFn: async ({ efectivo, electronico, cxc, fecha_inicio }: { efectivo: number; electronico: number; cxc: number; fecha_inicio?: string }) => {
      const total = efectivo + electronico + cxc
      await Promise.all([
        api.put('/berlin/configuracion/saldo_inicial_gran_bolsa',  { valor: String(total) }),
        api.put('/berlin/configuracion/saldo_inicial_efectivo',    { valor: String(efectivo) }),
        api.put('/berlin/configuracion/saldo_inicial_electronico', { valor: String(electronico) }),
        api.put('/berlin/configuracion/saldo_inicial_cxc',         { valor: String(cxc) }),
        api.put('/berlin/configuracion/saldo_inicial_fecha',       { valor: fecha_inicio || '' }),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pan-gran-bolsa'] })
      qc.invalidateQueries({ queryKey: ['pan-libro-diario'] })
      setEditSaldo(false)
    },
  })

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'hoy', label: 'Hoy' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' },
    { key: 'mes_anterior', label: 'Anterior' }, { key: 'rango', label: 'Rango' },
  ]
  const tipos: { key: TipoFiltro; label: string }[] = [
    { key: '', label: 'Todos' }, { key: 'ingreso', label: 'Ingresos' }, { key: 'gasto', label: 'Gastos' }, { key: 'compra', label: 'Compras' },
  ]

  const granBolsaSaldo:          number = granBolsaData?.saldo ?? 0
  const saldoInicial:            number = granBolsaData?.saldo_inicial ?? 0
  const saldoInicialFecha:       string = granBolsaData?.saldo_inicial_fecha ?? ''
  const saldoInicialEfectivo:    number = granBolsaData?.saldo_inicial_efectivo ?? 0
  const saldoInicialElectronico: number = granBolsaData?.saldo_inicial_electronico ?? 0
  const saldoInicialCxc:         number = granBolsaData?.saldo_inicial_cxc ?? 0
  const efectivoTotal:           number = granBolsaData?.efectivo_total ?? 0
  const electronicoTotal:        number = granBolsaData?.electronico_total ?? 0
  const cxcTotal:                number = granBolsaData?.cxc_total ?? 0
  const pctUtilidad:             number = granBolsaData?.porcentaje_utilidad ?? 30
  const utilidadBruta:           number = (resumen?.ingresos ?? 0) * (pctUtilidad / 100)
  const gastosDelPeriodo:        number = resumen?.gastos ?? 0
  const utilidadNeta:            number = utilidadBruta - gastosDelPeriodo

  const tipoLabel = (m: any) => {
    if (CAT_COMPRAS.includes(m.categoria)) return 'Compra'
    if (m.tipo === 'ingreso') return 'Ingreso'
    return 'Gasto'
  }
  const tipoColor = (m: any) => {
    if (CAT_COMPRAS.includes(m.categoria)) return '#F97316'
    if (m.tipo === 'ingreso') return '#10B981'
    return '#EF4444'
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={20} style={{ color: VIOLET }} />
          <h1 className="text-lg font-bold" style={{ color: '#0F172A' }}>Libro Diario</h1>
        </div>
        {esAdmin && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button onClick={() => setVistaMode('lista')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vistaMode === 'lista' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              <List size={13} /> Lista
            </button>
            <button onClick={() => setVistaMode('tabla')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vistaMode === 'tabla' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              <Table2 size={13} /> Tabla
            </button>
          </div>
        )}
      </div>

      {/* Gran Bolsa */}
      <div className="rounded-2xl p-5 shadow-md" style={{ background: `linear-gradient(135deg, ${VIOLET}, #9333EA)` }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">Gran Bolsa</p>
            <p className="text-3xl font-bold text-white">{fmt(granBolsaSaldo)}</p>

            {!editSaldo && (
              <div className="mt-3">
                {saldoInicialFecha && (
                  <p className="text-white/50 text-xs mb-2.5">
                    Desde {new Date(saldoInicialFecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })} · acumulado
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'efectivo' as BolsilloTipo, emoji: '💵', label: 'Efectivo', valor: efectivoTotal },
                    { key: 'electronico' as BolsilloTipo, emoji: '📱', label: 'Electrónico', valor: electronicoTotal },
                    { key: 'cxc' as BolsilloTipo, emoji: '🏦', label: 'CxC (Crédito)', valor: cxcTotal },
                  ] as const).map(b => (
                    <button key={b.key} onClick={() => setBolsilloModal(b.key)}
                      className="rounded-xl px-3 py-2.5 flex flex-col gap-1 text-left transition-all hover:scale-[1.03] hover:brightness-110 active:scale-100"
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)' }}>
                      <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">{b.emoji} {b.label}</span>
                      <span className="text-sm font-bold text-white leading-tight">{fmt(b.valor)}</span>
                      <span className="text-[9px] text-white/40">Ver detalle →</span>
                    </button>
                  ))}
                </div>
                {puedeEditarSaldo && (
                  <button onClick={() => {
                    setNuevoEfectivo(saldoInicialEfectivo ? saldoInicialEfectivo.toLocaleString('es-CO') : '')
                    setNuevoElectronico(saldoInicialElectronico ? saldoInicialElectronico.toLocaleString('es-CO') : '')
                    setNuevoCxc(saldoInicialCxc ? saldoInicialCxc.toLocaleString('es-CO') : '')
                    setNuevoSaldoFecha(saldoInicialFecha || '')
                    setEditSaldo(true)
                  }} className="mt-2.5 text-xs text-white/50 underline hover:text-white">
                    Editar saldo inicial
                  </button>
                )}
              </div>
            )}

            {editSaldo && (() => {
              const parseMonto = (v: string) => parseFloat(v.replace(/\./g, '')) || 0
              const fmtInput = (e: React.ChangeEvent<HTMLInputElement>) => {
                const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '')
                return raw ? parseInt(raw).toLocaleString('es-CO') : ''
              }
              const totalPreview = parseMonto(nuevoEfectivo) + parseMonto(nuevoElectronico) + parseMonto(nuevoCxc)
              return (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-xs w-24">Efectivo</span>
                    <input type="text" value={nuevoEfectivo} onChange={e => setNuevoEfectivo(fmtInput(e))}
                      className="w-32 rounded-lg px-2 py-1 text-sm text-slate-900 bg-white focus:outline-none [color-scheme:light]" placeholder="0" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-xs w-24">Electrónico</span>
                    <input type="text" value={nuevoElectronico} onChange={e => setNuevoElectronico(fmtInput(e))}
                      className="w-32 rounded-lg px-2 py-1 text-sm text-slate-900 bg-white focus:outline-none [color-scheme:light]" placeholder="0" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 text-xs w-24">CxC</span>
                    <input type="text" value={nuevoCxc} onChange={e => setNuevoCxc(fmtInput(e))}
                      className="w-32 rounded-lg px-2 py-1 text-sm text-slate-900 bg-white focus:outline-none [color-scheme:light]" placeholder="0" />
                  </div>
                  <p className="text-white/70 text-xs">Total: <span className="font-bold text-white">{fmt(totalPreview)}</span></p>
                  <div className="flex items-center gap-2">
                    <input type="date" value={nuevoSaldoFecha} onChange={e => setNuevoSaldoFecha(e.target.value)}
                      className="rounded-lg px-2 py-1 text-sm text-slate-900 bg-white focus:outline-none [color-scheme:light]" />
                    <span className="text-white/50 text-xs">Fecha inicio</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saldoMutation.mutate({
                        efectivo: parseMonto(nuevoEfectivo), electronico: parseMonto(nuevoElectronico),
                        cxc: parseMonto(nuevoCxc), fecha_inicio: nuevoSaldoFecha || undefined,
                      })} disabled={saldoMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-lg hover:bg-white/30 text-white text-xs font-semibold">
                      <Check size={13} /> Guardar
                    </button>
                    <button onClick={() => setEditSaldo(false)} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20">
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
          <div className="p-3 bg-white/15 rounded-2xl ml-4 shrink-0"><Wallet size={32} className="text-white" /></div>
        </div>
      </div>

      {/* Selector período */}
      <div className="flex gap-2 flex-wrap">
        {periodos.map(p => (
          <button key={p.key} onClick={() => setPeriodo(p.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 ${periodo === p.key ? 'text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
            style={periodo === p.key ? { background: VIOLET } : {}}>
            {p.key === 'rango' && <Calendar size={12} />}{p.label}
          </button>
        ))}
      </div>

      {periodo === 'rango' && (
        <div className="flex items-center gap-3 flex-wrap p-3 bg-violet-50 rounded-xl border border-violet-100">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-violet-400 [color-scheme:light]" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-violet-400 [color-scheme:light]" />
          </div>
          {!rangoValido && <p className="text-xs text-violet-400">Selecciona ambas fechas para ver resultados</p>}
        </div>
      )}

      {/* KPIs del período */}
      {resumen && (periodo !== 'rango' || rangoValido) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3 shadow-sm">
            <div className="p-2.5 rounded-xl bg-emerald-50"><TrendingUp size={18} style={{ color: '#10B981' }} /></div>
            <div><p className="text-[11px]" style={{ color: '#64748B' }}>Ingresos</p><p className="text-base font-bold" style={{ color: '#059669' }}>{fmt(resumen.ingresos ?? 0)}</p></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3 shadow-sm">
            <div className="p-2.5 rounded-xl bg-red-50"><TrendingDown size={18} style={{ color: '#EF4444' }} /></div>
            <div><p className="text-[11px]" style={{ color: '#64748B' }}>Gastos</p><p className="text-base font-bold" style={{ color: '#DC2626' }}>{fmt(resumen.gastos ?? 0)}</p></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3 shadow-sm">
            <div className="p-2.5 rounded-xl bg-orange-50"><ShoppingCart size={18} style={{ color: '#F97316' }} /></div>
            <div><p className="text-[11px]" style={{ color: '#64748B' }}>Compras</p><p className="text-base font-bold" style={{ color: '#EA580C' }}>{fmt(resumen.compras ?? 0)}</p></div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 shadow-sm overflow-hidden">
            <button onClick={() => setUtilidadOpen(v => !v)} className="w-full p-4 flex items-center gap-3 hover:bg-violet-100 transition-colors">
              <div className="p-2.5 rounded-xl bg-white"><BookOpen size={18} style={{ color: VIOLET }} /></div>
              <div className="flex-1 text-left">
                <p className="text-[11px]" style={{ color: '#64748B' }}>Utilidad Neta</p>
                <p className="text-base font-bold" style={{ color: utilidadNeta >= 0 ? VIOLET : '#DC2626' }}>{fmt(utilidadNeta)}</p>
              </div>
              {utilidadOpen ? <ChevronUp size={16} style={{ color: VIOLET }} /> : <ChevronDown size={16} style={{ color: VIOLET }} />}
            </button>
            {utilidadOpen && (
              <div className="px-4 pb-3 flex flex-col gap-1.5">
                <div className="bg-white rounded-xl p-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold" style={{ color: '#64748B' }}>Utilidad Bruta ({pctUtilidad}% ventas)</p>
                  <p className="text-sm font-bold" style={{ color: VIOLET }}>{fmt(utilidadBruta)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold" style={{ color: '#64748B' }}>Gastos del período</p>
                  <p className="text-sm font-bold" style={{ color: '#EF4444' }}>-{fmt(gastosDelPeriodo)}</p>
                </div>
                <div className="bg-violet-100 rounded-xl p-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold" style={{ color: VIOLET }}>Utilidad Neta</p>
                  <p className="text-sm font-bold" style={{ color: utilidadNeta >= 0 ? VIOLET : '#DC2626' }}>{fmt(utilidadNeta)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA LISTA */}
      {vistaMode === 'lista' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {tipos.map(t => (
              <button key={t.key} onClick={() => setTipo(t.key)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${tipo === t.key ? 'text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                style={tipo === t.key ? { background: VIOLET } : {}}>
                {t.label}
              </button>
            ))}
          </div>
          {periodo === 'rango' && !rangoValido ? (
            <div className="text-center py-12 text-slate-400 text-sm">Selecciona un rango de fechas para ver los movimientos</div>
          ) : ldLoading ? (
            <div className="text-center py-12 text-slate-400">Cargando...</div>
          ) : (
            <ListaMovimientos filas={movimientosFiltrados} tipoColor={tipoColor} tipoLabel={tipoLabel} />
          )}
        </>
      )}

      {/* VISTA TABLA */}
      {vistaMode === 'tabla' && esAdmin && (
        <>
          {periodo === 'rango' && !rangoValido ? (
            <div className="text-center py-12 text-slate-400 text-sm">Selecciona un rango de fechas para ver la tabla</div>
          ) : ldLoading ? (
            <div className="text-center py-12 text-slate-400">Cargando libro diario...</div>
          ) : (() => {
            const filasRaw: any[] = filasPeriodo
            const saldoBase: number = libroDiarioData?.saldo_base ?? 0
            const filas = agruparFilasTabla(filasRaw, saldoBase)

            const exportarCSV = () => {
              const encab = 'Fecha,Descripción,Categoría,Ingreso,Egreso,Compra,Saldo'
              const rows = filas.map((f: any) => `${f.fecha},"${(f.concepto || '').replace(/"/g, '""')}",${f.categoria},${f.ingreso || ''},${f.egreso || ''},${f.compra || ''},${f.saldo}`)
              const csv = [encab, ...rows].join('\n')
              const a = document.createElement('a')
              a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
              a.download = `libro-diario-${rangoParams.desde ?? 'rango'}.csv`
              a.click()
            }

            const totIng  = filasRaw.reduce((s: number, f: any) => s + (f.ingreso || 0), 0)
            const totEgr  = filasRaw.reduce((s: number, f: any) => s + (f.egreso || 0), 0)
            const totComp = filasRaw.reduce((s: number, f: any) => s + (f.compra || 0), 0)
            const saldoFin = filas.length > 0 ? filas[filas.length - 1].saldo : saldoBase

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-slate-500 font-semibold">
                    {filas.length} movimiento{filas.length !== 1 ? 's' : ''} ·
                    Saldo inicial: <strong style={{ color: saldoBase >= 0 ? '#059669' : '#DC2626' }}>{fmt(saldoBase)}</strong>
                  </p>
                  <button onClick={exportarCSV} disabled={filas.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    <Download size={12} /> Exportar CSV
                  </button>
                </div>
                {filas.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">Sin movimientos en este período</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Fecha</th>
                          <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-28">Ingreso</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold text-red-500 uppercase tracking-wider w-28">Egreso</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold text-orange-500 uppercase tracking-wider w-28">Compra</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider w-32" style={{ color: VIOLET }}>Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="bg-slate-50 border-b-2 border-slate-300">
                          <td className="px-3 py-2.5" colSpan={2}><span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Totales del período</span></td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-emerald-700">{fmtShort(totIng)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-red-600">{fmtShort(totEgr)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-orange-600">{fmtShort(totComp)}</td>
                          <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums" style={{ color: saldoFin >= 0 ? VIOLET : '#DC2626' }}>{fmt(saldoFin)}</td>
                        </tr>
                        <tr className="bg-violet-50/60">
                          <td className="px-3 py-2 text-xs text-slate-400 italic">—</td>
                          <td className="px-3 py-2 text-xs font-semibold text-slate-500 italic">Saldo inicial del período</td>
                          <td /><td /><td />
                          <td className="px-3 py-2 text-right text-xs font-bold tabular-nums" style={{ color: VIOLET }}>{fmt(saldoBase)}</td>
                        </tr>
                        {filas.map((f: any, i: number) => (
                          <tr key={f.id ?? `row-${i}`} className={f._resumen ? 'transition-colors' : 'hover:bg-slate-50 transition-colors'} style={f._resumen ? { background: '#F0FDF4' } : {}}>
                            <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{f.fecha}</td>
                            <td className="px-3 py-2">
                              <p className="text-xs font-semibold leading-snug" style={{ color: f._resumen ? '#059669' : '#0F172A' }}>{f.concepto}</p>
                              <p className="text-[10px] text-slate-400">{f.categoria}{!f._resumen && f.registrado_por_user?.nombre ? ` · ${f.registrado_por_user.nombre}` : ''}</p>
                            </td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold text-emerald-600">{f.ingreso > 0 ? fmtShort(f.ingreso) : <span className="text-slate-200">—</span>}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold text-red-500">{f.egreso > 0 ? fmtShort(f.egreso) : <span className="text-slate-200">—</span>}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold text-orange-500">{f.compra > 0 ? fmtShort(f.compra) : <span className="text-slate-200">—</span>}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums font-bold" style={{ color: f.saldo >= 0 ? VIOLET : '#DC2626' }}>{fmt(f.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}

      {bolsilloModal && (
        <BolsilloModal
          bolsillo={bolsilloModal}
          movimientos={todosMovimientos as any[]}
          saldoInicial={bolsilloModal === 'efectivo' ? saldoInicialEfectivo : bolsilloModal === 'electronico' ? saldoInicialElectronico : saldoInicialCxc}
          onClose={() => setBolsilloModal(null)}
        />
      )}
    </div>
  )
}
