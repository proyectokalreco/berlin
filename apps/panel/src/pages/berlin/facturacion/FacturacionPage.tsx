import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../store/authStore'
import * as XLSX from 'xlsx'
import {
  FileText, Printer, X, Search, Loader2,
  Trash2, AlertTriangle, FileSpreadsheet, ChevronLeft, ChevronRight,
  TrendingUp, ShoppingCart, Banknote, Smartphone, CreditCard, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const hoyCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// ── Tipos ─────────────────────────────────────────────────────
interface VentaItem {
  id?: string
  producto?: { nombre: string }
  producto_nombre?: string
  cantidad: number
  precio_unitario: number
  subtotal?: number
  descuento?: number
}

interface Venta {
  id: string
  numero_venta: string
  fecha: string
  total: number
  subtotal?: number
  descuento?: number
  metodo_pago: string
  estado: string
  notas?: string
  cliente?: { id: string; nombre: string } | null
  vendedor?: { id: string; nombre: string } | null
  items?: VentaItem[]
}

// ── Imprimir factura 80mm ─────────────────────────────────────
function imprimirFactura(venta: Venta, anulada = false) {
  const origin = window.location.origin
  const fecha  = new Date(venta.fecha).toLocaleString('es-CO', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Bogota',
  })
  const itemsHtml = (venta.items || []).map(i => {
    const nombre   = i.producto?.nombre ?? i.producto_nombre ?? 'Producto'
    const sub      = i.subtotal ?? (i.cantidad * i.precio_unitario - (i.descuento || 0))
    return `<p class="item-nm">${nombre}</p>
<div class="row"><span class="item-sub">&nbsp;&nbsp;${i.cantidad} x ${fmt(i.precio_unitario)}</span><span class="amt">${fmt(sub)}</span></div>`
  }).join('')

  const anuladaBanner = anulada ? `
<div style="border:2px solid #000;color:#000;padding:6px 0;text-align:center;font-weight:900;font-size:18px;letter-spacing:2px;margin:5px 0">
  *** FACTURA ANULADA ***
</div>
<p class="c sm" style="color:#000;font-weight:bold;margin-bottom:4px">${venta.notas || 'Anulada por administrador'}</p>` : ''

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Factura ${venta.numero_venta}${anulada ? ' — ANULADA' : ''}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  @page { margin:5mm; size:80mm auto }
  body { font-family:Arial,sans-serif; font-weight:600; font-size:14px; color:#000 }
  .c { text-align:center } .b { font-weight:bold }
  .sep  { border-top:1px dashed #000; margin:5px 0 }
  .sep2 { border-top:2px solid  #000; margin:5px 0 }
  .row  { display:flex; justify-content:space-between; align-items:baseline; gap:6px; margin:2px 0 }
  .row > span:first-child { flex:1; min-width:0; overflow-wrap:break-word }
  .amt  { flex-shrink:0; text-align:right; white-space:nowrap; font-weight:700; min-width:58px }
  .item-nm  { font-weight:700; font-size:14px; margin-top:5px; word-break:break-word }
  .item-sub { font-size:13px; color:#000 }
  img.logo  { display:block; margin:4px auto; max-width:60mm; height:auto; max-height:28mm; object-fit:contain }
  .biz-sub  { font-size:13px; letter-spacing:1px; margin-top:3px; font-weight:bold }
  .total-row { display:flex; justify-content:space-between; align-items:baseline;
               border-top:2px solid #000; margin-top:5px; padding-top:5px; gap:6px }
  .total-lbl { font-size:16px; font-weight:900 }
  .total-val { font-size:20px; font-weight:900; white-space:nowrap }
  .sm { font-size:13px; color:#000 }
  h3  { font-size:14px; font-weight:bold }
</style></head><body>
<div class="c" style="padding:4px 0 2px">
  <img class="logo" src="${origin}/logos/berlin.png" alt="Berlín Café Bar"/>
  <p class="biz-sub">*Café Bar Berlín*</p>
</div>
<div class="c" style="margin-bottom:4px">
  <p class="sm">NIT: 1035424712-4</p>
  <p class="sm">Direccion: Calle 28 #30-19 - Don Matias, Antioquia</p>
  <p class="sm">Tel: 3215994825</p>
</div>
<div class="sep2"></div>
${anuladaBanner}
<div class="c">
  <h3>FACTURA DE VENTA</h3>
  <p>No. <strong>${venta.numero_venta}</strong></p>
  <p class="sm">${fecha}</p>
  ${venta.vendedor ? `<p class="sm">Cajero: ${venta.vendedor.nombre}</p>` : ''}
  ${venta.cliente ? `<p class="sm">Cliente: ${venta.cliente.nombre}</p>` : ''}
</div>
<div class="sep2"></div>
<div class="row b sm"><span>DESCRIPCION</span><span class="amt">TOTAL</span></div>
<div class="sep"></div>
${itemsHtml || '<p style="font-size:13px;color:#000;margin:4px 0">Detalle no disponible</p>'}
<div class="sep"></div>
${venta.descuento && venta.descuento > 0 ? `<div class="row sm"><span>Descuento:</span><span>- ${fmt(venta.descuento)}</span></div>` : ''}
<div class="total-row">
  <span class="total-lbl">TOTAL:</span>
  <span class="total-val">${fmt(venta.total)}</span>
</div>
<div class="sep"></div>
<div class="row sm"><span>Metodo de pago:</span><span>${venta.metodo_pago}</span></div>
<div class="sep"></div>
<div class="c sm">
  <p>Regimen Simple de Tributacion</p>
  <p>No somos responsables del IVA</p>
  <p>Conserve este documento como soporte</p>
</div>
<div class="sep"></div>
<div class="c"><p class="b" style="font-size:13px">Gracias por su compra!</p>
<p class="sm" style="margin-top:6px">Sistema Kalreco v1.0</p></div>
</body></html>`

  const w = window.open('', '_blank', 'width=440,height=760')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); setTimeout(() => w.close(), 800) }, 400) }
}

// ── Badge método pago ─────────────────────────────────────────
const METODO_COLOR: Record<string, string> = {
  efectivo:      'bg-green-500/15 text-green-400 border-green-500/30',
  transferencia: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  credito:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  qr:            'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
}
function MetodoBadge({ m }: { m: string }) {
  const cls = METODO_COLOR[m] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/30'
  const lbl = m === 'efectivo' ? 'Efectivo' : m === 'transferencia' ? 'Transferencia'
    : m === 'credito' ? 'Crédito' : m === 'qr' ? 'QR/Nequi' : m
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>{lbl.toUpperCase()}</span>
}

// ── Componente principal ──────────────────────────────────────
export default function FacturacionPage() {
  const queryClient = useQueryClient()
  const { user }    = useAuthStore()
  const puedeAnular = ['super_admin', 'admin', 'admin_berlin'].includes(user?.rol ?? '')

  const [modoRango,   setModoRango]   = useState(false)
  const [fecha,       setFecha]       = useState(hoyCol)
  const [rangoDesde,  setRangoDesde]  = useState(hoyCol)
  const [rangoHasta,  setRangoHasta]  = useState(hoyCol)
  const [busqueda,    setBusqueda]    = useState('')
  const [preview,     setPreview]     = useState<Venta | null>(null)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [anularModal, setAnularModal] = useState<Venta | null>(null)
  const [motivo,      setMotivo]      = useState('')
  const [ventaAnulada,setVentaAnulada]= useState<Venta | null>(null)

  // ── Navegación de fecha (modo día) ───────────────────────────
  const cambiarFecha = (dias: number) => {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + dias)
    setFecha(d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))
  }
  const esHoy      = fecha === hoyCol()
  const labelRango = modoRango
    ? (rangoDesde === rangoHasta ? rangoDesde : `${rangoDesde} → ${rangoHasta}`)
    : fecha

  // ── Query ventas ─────────────────────────────────────────────
  const params = modoRango
    ? { desde: rangoDesde, hasta: rangoHasta, limit: 2000 }
    : { fecha, limit: 500 }
  const { data: ventas = [], isLoading } = useQuery<Venta[]>({
    queryKey: ['ventas-facturacion', modoRango, modoRango ? rangoDesde + rangoHasta : fecha],
    queryFn:  () => api.get('/berlin/ventas', { params }).then(r => r.data?.data ?? []),
    refetchInterval: modoRango ? false : 30_000,
  })

  // ── Resumen calculado ─────────────────────────────────────────
  const resumen = useMemo(() => {
    const ok  = ventas.filter(v => v.estado === 'completada')
    const sum = (arr: Venta[]) => arr.reduce((s, v) => s + v.total, 0)
    return {
      total:         sum(ok),
      count:         ok.length,
      efectivo:      sum(ok.filter(v => v.metodo_pago === 'efectivo')),
      transferencia: sum(ok.filter(v => v.metodo_pago === 'transferencia')),
      qr:            sum(ok.filter(v => v.metodo_pago?.includes('qr'))),
      credito:       sum(ok.filter(v => v.metodo_pago === 'credito')),
      anuladas:      ventas.filter(v => v.estado === 'anulada').length,
    }
  }, [ventas])

  // ── Exportar Excel ────────────────────────────────────────────
  const exportarExcel = () => {
    const resumenSheet = XLSX.utils.json_to_sheet([
      { Concepto: 'Total ventas',    Valor: resumen.total },
      { Concepto: 'Transacciones',   Valor: resumen.count },
      { Concepto: 'Efectivo',        Valor: resumen.efectivo },
      { Concepto: 'Transferencia',   Valor: resumen.transferencia },
      { Concepto: 'QR / Nequi',      Valor: resumen.qr },
      { Concepto: 'Crédito',         Valor: resumen.credito },
      { Concepto: 'Anuladas',        Valor: resumen.anuladas },
    ])
    const detalleSheet = XLSX.utils.json_to_sheet(
      ventas.map(v => ({
        'N° Factura': v.numero_venta,
        Fecha:        new Date(v.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        Total:        v.total,
        'Método pago': v.metodo_pago,
        Estado:        v.estado,
        Cajero:        v.vendedor?.nombre ?? '',
        Cliente:       v.cliente?.nombre ?? '',
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, resumenSheet, 'Resumen')
    XLSX.utils.book_append_sheet(wb, detalleSheet, 'Detalle')
    XLSX.writeFile(wb, `Facturacion_${labelRango}.xlsx`)
  }

  // ── Imprimir resumen día ──────────────────────────────────────
  const imprimirResumen = () => {
    const origin = window.location.origin
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Resumen Facturación ${labelRango}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  @page { margin:5mm; size:80mm auto }
  body { font-family:Arial,sans-serif; font-weight:600; font-size:13px; color:#000 }
  .c { text-align:center } .sep { border-top:1px dashed #000; margin:5px 0 }
  .sep2 { border-top:2px solid #000; margin:5px 0 }
  .row { display:flex; justify-content:space-between; margin:3px 0 }
  .b { font-weight:bold } .sm { font-size:13px }
  img.logo { display:block; margin:4px auto; max-width:60mm; height:auto; max-height:28mm }
</style></head><body>
<div class="c"><img class="logo" src="${origin}/logos/berlin.png" alt="Berlín Café Bar"/>
<p style="font-size:13px;letter-spacing:1px;font-weight:bold">*Café Bar Berlín*</p></div>
<div class="sep2"></div>
<div class="c"><p class="b">RESUMEN DE FACTURACION</p><p class="sm">${labelRango}</p></div>
<div class="sep2"></div>
<div class="row b"><span>Transacciones:</span><span>${resumen.count}</span></div>
<div class="row b" style="font-size:15px"><span>TOTAL VENTAS:</span><span>${fmt(resumen.total)}</span></div>
<div class="sep"></div>
<div class="row sm"><span>Efectivo:</span><span>${fmt(resumen.efectivo)}</span></div>
<div class="row sm"><span>Transferencia:</span><span>${fmt(resumen.transferencia)}</span></div>
<div class="row sm"><span>QR / Nequi:</span><span>${fmt(resumen.qr)}</span></div>
<div class="row sm"><span>Crédito:</span><span>${fmt(resumen.credito)}</span></div>
<div class="sep"></div>
<div class="row sm" style="${resumen.anuladas > 0 ? 'color:#000;font-weight:bold' : ''}"><span>Facturas anuladas:</span><span>${resumen.anuladas}</span></div>
<div class="sep2"></div>
<div class="c sm"><p>Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
<p>Sistema Kalreco v1.0</p></div>
</body></html>`
    const w = window.open('', '_blank', 'width=440,height=600')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); setTimeout(() => w.close(), 800) }, 400) }
  }

  // ── Abrir preview con ítems cargados ─────────────────────────
  const abrirPreview = async (v: Venta) => {
    setLoadingPrev(true)
    try {
      const { data: full } = await api.get(`/berlin/ventas/${v.id}`)
      setPreview({
        ...full,
        items: (full.items ?? []).map((i: any) => ({
          producto:        i.producto,
          producto_nombre: i.producto?.nombre ?? 'Producto',
          cantidad:        i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal:        i.subtotal,
          descuento:       i.descuento,
        })),
      })
    } catch {
      setPreview(v)
    } finally {
      setLoadingPrev(false)
    }
  }

  // ── Mutation anular ───────────────────────────────────────────
  const anularMut = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.post(`/berlin/ventas/${id}/anular`, { motivo }).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ventas-facturacion'] })
      queryClient.invalidateQueries({ queryKey: ['rep-ventas-dia'] })
      setAnularModal(null)
      setMotivo('')
      setVentaAnulada(data.venta) // ofrecer imprimir evidencia
      toast.success('Factura anulada. Stock restaurado.')
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error ?? 'Error al anular la factura')
    },
  })

  const q = busqueda.toLowerCase()
  const filtradas = ventas.filter(v => {
    if (!q) return true
    if (v.numero_venta.toLowerCase().includes(q)) return true
    if ((v.cliente?.nombre ?? '').toLowerCase().includes(q)) return true
    if ((v.items ?? []).some(i => (i.producto?.nombre ?? '').toLowerCase().includes(q))) return true
    return false
  })

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-violet-400"/>
          <h2 className="text-lg font-bold text-white">Facturación Diaria</h2>
        </div>
        {/* Navegación de fecha */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Toggle modo día / rango */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
            <button onClick={() => setModoRango(false)}
              className={`px-3 py-1.5 min-h-[36px] transition-colors ${!modoRango ? 'bg-violet-500 text-white' : 'text-gray-400 hover:bg-white/5'}`}>
              Día
            </button>
            <button onClick={() => setModoRango(true)}
              className={`px-3 py-1.5 min-h-[36px] transition-colors ${modoRango ? 'bg-violet-500 text-white' : 'text-gray-400 hover:bg-white/5'}`}>
              Rango
            </button>
          </div>

          {!modoRango ? (
            /* Modo día */
            <>
              <button onClick={() => cambiarFecha(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5">
                <ChevronLeft size={15}/>
              </button>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="bg-brand-navy border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white
                           focus:outline-none focus:border-violet-500/50 min-h-[36px] [color-scheme:dark]"/>
              <button onClick={() => cambiarFecha(1)} disabled={esHoy}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30">
                <ChevronRight size={15}/>
              </button>
              {!esHoy && (
                <button onClick={() => setFecha(hoyCol())}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25">
                  Hoy
                </button>
              )}
            </>
          ) : (
            /* Modo rango */
            <>
              <input type="date" value={rangoDesde} onChange={e => {
                  setRangoDesde(e.target.value)
                  if (e.target.value > rangoHasta) setRangoHasta(e.target.value)
                }}
                className="bg-brand-navy border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white
                           focus:outline-none focus:border-violet-500/50 min-h-[36px] [color-scheme:dark]"/>
              <span className="text-gray-500 text-xs">→</span>
              <input type="date" value={rangoHasta} min={rangoDesde} onChange={e => setRangoHasta(e.target.value)}
                className="bg-brand-navy border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white
                           focus:outline-none focus:border-violet-500/50 min-h-[36px] [color-scheme:dark]"/>
              <button onClick={() => { setRangoDesde(hoyCol()); setRangoHasta(hoyCol()) }}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/25">
                Hoy
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tarjeta de resumen */}
      <div className="bg-brand-navy rounded-xl border border-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {modoRango ? `Resumen ${rangoDesde === rangoHasta ? rangoDesde : `${rangoDesde} → ${rangoHasta}`}` : 'Resumen del día'}
          </p>
          <div className="flex gap-2">
            <button onClick={exportarExcel}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors">
              <FileSpreadsheet size={12}/> Excel
            </button>
            <button onClick={imprimirResumen}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
              <Printer size={12}/> Imprimir
            </button>
          </div>
        </div>

        {/* KPIs principales */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-brand-dark rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={14} className="text-violet-400"/>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Total ventas</p>
              <p className="text-sm font-bold text-white tabular-nums">{fmt(resumen.total)}</p>
            </div>
          </div>
          <div className="bg-brand-dark rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-teal/15 flex items-center justify-center flex-shrink-0">
              <ShoppingCart size={14} className="text-brand-teal"/>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Transacciones</p>
              <p className="text-sm font-bold text-white">{resumen.count}</p>
            </div>
          </div>
          <div className="bg-brand-dark rounded-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <Trash2 size={14} className="text-red-400"/>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Anuladas</p>
              <p className={`text-sm font-bold tabular-nums ${resumen.anuladas > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {resumen.anuladas}
              </p>
            </div>
          </div>
        </div>

        {/* Breakdown por método */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Efectivo',      value: resumen.efectivo,      icon: Banknote,    color: 'text-green-400', bg: 'bg-green-500/10' },
            { label: 'Transferencia', value: resumen.transferencia, icon: Smartphone,  color: 'text-purple-400',bg: 'bg-purple-500/10' },
            { label: 'QR / Nequi',   value: resumen.qr,            icon: Clock,       color: 'text-yellow-400',bg: 'bg-yellow-500/10' },
            { label: 'Crédito',      value: resumen.credito,       icon: CreditCard,  color: 'text-blue-400',  bg: 'bg-blue-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-brand-dark rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-5 h-5 rounded-md ${bg} flex items-center justify-center`}>
                  <Icon size={10} className={color}/>
                </div>
                <p className="text-[10px] text-gray-500">{label}</p>
              </div>
              <p className={`text-xs font-bold tabular-nums ${value > 0 ? color : 'text-gray-600'}`}>{fmt(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por N° factura, cliente o producto…"
          className="w-full bg-brand-navy border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white
                     placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50 min-h-[44px]"/>
      </div>

      {/* Lista de ventas */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-600">
            <Loader2 size={16} className="animate-spin"/><p className="text-sm">Cargando…</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
            <FileText size={36} className="opacity-20"/>
            <p className="text-sm">No hay ventas para {labelRango}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtradas.map(v => {
              const anulada = v.estado === 'anulada'
              return (
                <div key={v.id} className={`flex items-center gap-3 p-4 ${anulada ? 'opacity-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${anulada ? 'bg-red-500/10' : 'bg-violet-500/10'}`}>
                    <FileText size={14} className={anulada ? 'text-red-400' : 'text-violet-400'}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-semibold ${anulada ? 'line-through text-gray-500' : 'text-white'}`}>
                        {v.numero_venta}
                      </p>
                      {anulada && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">ANULADA</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-[10px] text-gray-500">
                        {new Date(v.fecha).toLocaleTimeString('es-CO', { timeZone:'America/Bogota', hour:'2-digit', minute:'2-digit' })}
                      </p>
                      <MetodoBadge m={v.metodo_pago}/>
                      {v.cliente && <span className="text-[10px] text-gray-500">{v.cliente.nombre}</span>}
                    </div>
                  </div>
                  <p className={`text-sm font-bold tabular-nums flex-shrink-0 ${anulada ? 'line-through text-gray-500' : 'text-white'}`}>
                    {fmt(v.total)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Botón eliminar — solo admin, solo ventas no anuladas */}
                    {puedeAnular && !anulada && (
                      <button onClick={() => { setAnularModal(v); setMotivo('') }}
                        title="Anular factura"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600
                                   hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={13}/>
                      </button>
                    )}
                    {/* Botón imprimir factura */}
                    <button onClick={() => abrirPreview(v)} disabled={loadingPrev}
                      className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg min-h-[36px]
                                  border transition-colors
                                  ${anulada
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                    : 'bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20'}`}>
                      {loadingPrev ? <Loader2 size={11} className="animate-spin"/> : <Printer size={11}/>}
                      {anulada ? 'Evidencia' : 'Factura'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer conteo */}
        {filtradas.length > 0 && (
          <div className="px-4 py-3 border-t border-white/5 flex justify-between items-center">
            <p className="text-[11px] text-gray-600">
              {filtradas.length} {filtradas.length !== ventas.length ? `de ${ventas.length}` : ''} transacciones
            </p>
            <p className="text-[11px] font-bold text-white tabular-nums">
              {fmt(filtradas.filter(v => v.estado === 'completada').reduce((s, v) => s + v.total, 0))}
            </p>
          </div>
        )}
      </div>

      {/* ── Modal preview / imprimir ──────────────────────────── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#112240] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div>
                <h3 className="text-white font-bold">
                  {preview.estado === 'anulada' ? '🚫 Factura Anulada' : 'Factura de Venta'}
                </h3>
                <p className="text-[11px] text-gray-500">{preview.numero_venta}</p>
              </div>
              <button onClick={() => setPreview(null)}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
                <X size={18}/>
              </button>
            </div>

            {/* Cuerpo */}
            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              {preview.estado === 'anulada' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <p className="text-red-400 font-bold text-sm">FACTURA ANULADA</p>
                  {preview.notas && <p className="text-red-400/70 text-xs mt-1">{preview.notas}</p>}
                </div>
              )}

              {/* Info cabecera */}
              <div className="bg-brand-dark rounded-xl p-4 border border-white/5 space-y-2 text-sm">
                {[
                  ['Número',        preview.numero_venta],
                  ['Fecha', new Date(preview.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })],
                  ['Cajero',        preview.vendedor?.nombre ?? '—'],
                  ['Cliente',       preview.cliente?.nombre ?? 'Consumidor final'],
                  ['Método de pago',preview.metodo_pago],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-4">
                    <span className="text-gray-400 flex-shrink-0">{l}</span>
                    <span className="text-white text-right">{v}</span>
                  </div>
                ))}
              </div>

              {/* Items */}
              {(preview.items?.length ?? 0) > 0 && (
                <div className="bg-brand-dark rounded-xl border border-white/5 overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/5 flex justify-between text-[10px] font-bold text-gray-500 uppercase">
                    <span>Producto</span><span>Cant</span><span>Precio</span><span>Subtotal</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {preview.items!.map((item, idx) => {
                      const nombre  = item.producto?.nombre ?? item.producto_nombre ?? 'Producto'
                      const sub     = item.subtotal ?? (item.cantidad * item.precio_unitario)
                      return (
                        <div key={idx} className="px-4 py-2.5 grid grid-cols-4 gap-2 text-xs items-center">
                          <span className="text-white col-span-1 truncate" title={nombre}>{nombre}</span>
                          <span className="text-gray-400 text-center">{item.cantidad}</span>
                          <span className="text-gray-400 text-right tabular-nums">{fmt(item.precio_unitario)}</span>
                          <span className="text-white font-bold text-right tabular-nums">{fmt(sub)}</span>
                        </div>
                      )
                    })}
                  </div>
                  {/* Total */}
                  <div className="px-4 py-3 border-t-2 border-white/10 flex justify-between font-bold">
                    <span className="text-gray-300">TOTAL</span>
                    <span className="text-white text-base tabular-nums">{fmt(preview.total)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="px-5 pb-5 pt-3 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button onClick={() => setPreview(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">
                Cerrar
              </button>
              <button onClick={() => imprimirFactura(preview, preview.estado === 'anulada')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white min-h-[48px]
                            ${preview.estado === 'anulada' ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-500 hover:bg-violet-600'}`}>
                <Printer size={15}/>
                {preview.estado === 'anulada' ? 'Imprimir evidencia' : 'Imprimir factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal anular factura ──────────────────────────────── */}
      {anularModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-red-500/20 shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={16} className="text-red-400"/>
              </div>
              <div>
                <h3 className="text-white font-bold">Anular factura</h3>
                <p className="text-[11px] text-gray-500">{anularModal.numero_venta} · {fmt(anularModal.total)}</p>
              </div>
              <button onClick={() => setAnularModal(null)}
                className="ml-auto w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
                <X size={16}/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-xs text-red-300 leading-relaxed">
                  Esta acción anulará la factura, <strong>restaurará el stock</strong> de los productos
                  y quedará registrada en el movimiento contable. <strong>No se puede deshacer.</strong>
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Motivo de anulación <span className="text-red-400">*</span></label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Error en el pedido, devolución del cliente…"
                  rows={3}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-red-500/50 resize-none"/>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setAnularModal(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">
                Cancelar
              </button>
              <button
                onClick={() => anularMut.mutate({ id: anularModal.id, motivo })}
                disabled={!motivo.trim() || anularMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-red-600 hover:bg-red-700 text-white font-bold text-sm min-h-[48px]
                           disabled:opacity-50 disabled:cursor-not-allowed">
                {anularMut.isPending ? <Loader2 size={15} className="animate-spin"/> : <Trash2 size={15}/>}
                {anularMut.isPending ? 'Anulando…' : 'Anular factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal imprimir evidencia de anulación ─────────────── */}
      {ventaAnulada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl">
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">Factura anulada exitosamente</h3>
              <p className="text-[11px] text-gray-500">{ventaAnulada.numero_venta}</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <p className="text-xs text-green-300 leading-relaxed">
                  Stock restaurado ✓ · Movimiento contable registrado ✓ · Se reflejará en el cierre de turno ✓
                </p>
              </div>
              <p className="text-xs text-gray-400 text-center">
                ¿Deseas imprimir la evidencia física de la anulación?
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setVentaAnulada(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">
                No imprimir
              </button>
              <button onClick={() => { imprimirFactura(ventaAnulada, true); setVentaAnulada(null) }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                           bg-red-600 hover:bg-red-700 text-white font-bold text-sm min-h-[48px]">
                <Printer size={15}/> Imprimir evidencia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
