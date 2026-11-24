import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import {
  PieChart, Download, FileText, FileSpreadsheet, Printer,
  X, TrendingUp, TrendingDown, ShoppingCart, Package, Scale, Percent,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { fallbackSiNoRed } from '../../../lib/offline'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

// ── Tipos ─────────────────────────────────────────────────────
interface VentaItem { nombre: string; cantidad: number; total: number }
interface Resumen {
  ingresos: number; egresos: number; utilidad: number
  num_ventas?: number; ticket_promedio?: number
}
interface VentaDia {
  id: string
  numero_venta: string
  fecha: string
  total: number
  metodo_pago: string
  saldo_pendiente?: number
  cliente?: { id: string; nombre: string } | null
  vendedor?: { id: string; nombre: string } | null
  items?: { cantidad: number; precio_unitario: number; subtotal: number; producto?: { nombre: string } }[]
  _source?: string
  _categoria?: string
}

interface DesgloseVendedor {
  vendedor_id: string | null; nombre: string; total: number; num_ventas: number
  pos:  { total: number; num_ventas: number }
  mesa: { total: number; num_ventas: number }
}
interface DesgloseArea {
  id: string; nombre: string; total: number; pos: number; mesa: number
  responsables?: string[]
  items: { nombre: string; cantidad: number; valor: number }[]
}
interface DetalleVentas {
  desde: string; hasta: string; num_turnos: number
  total_ventas: number; num_ventas: number
  transacciones: VentaDia[]
  desglose_vendedores: DesgloseVendedor[]
  desglose_estaciones: DesgloseArea[]
}

// ── Badge método de pago ───────────────────────────────────────
const METODO_BADGE: Record<string, { label: string; cls: string }> = {
  efectivo:      { label: 'Efectivo',      cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  exacto:        { label: 'Exacto',        cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  transferencia: { label: 'Pago Electrónico', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  credito:       { label: 'Crédito',       cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  qr:            { label: 'QR/Nequi',      cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  encargo:       { label: 'Encargo',       cls: 'bg-brand-teal/15 text-brand-teal border-brand-teal/30' },
  separe:        { label: 'Separe',        cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  anticipo_encargo: { label: 'Anticipo Enc.', cls: 'bg-brand-teal/10 text-brand-teal border-brand-teal/20' },
  anticipo_separe:  { label: 'Anticipo Sep.', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
}

function MetodoBadge({ metodo }: { metodo: string }) {
  const b = METODO_BADGE[metodo] ?? { label: metodo, cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.cls}`}>
      {b.label.toUpperCase()}
    </span>
  )
}

// ── Exportar Excel genérico ────────────────────────────────────
function exportarExcel(
  nombre: string, datos: Record<string, unknown>[], sufijo?: string,
  hojaExtra?: { nombre: string; datos: Record<string, unknown>[] },
) {
  const ws = XLSX.utils.json_to_sheet(datos)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31))
  if (hojaExtra) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaExtra.datos), hojaExtra.nombre.slice(0, 31))
  const fecha = sufijo || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  XLSX.writeFile(wb, `${nombre.replace(/\s+/g, '_')}_${fecha}.xlsx`)
}

// ── Imprimir reporte en ventana 80mm ──────────────────────────
function imprimirReporte(titulo: string, filas: string[][], columnas: string[], subtitulo?: string) {
  const origin = window.location.origin
  const thead = `<tr>${columnas.map(c => `<th>${c}</th>`).join('')}</tr>`
  const tbody = filas.map(f => `<tr>${f.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${titulo}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  @page { margin:5mm; size:80mm auto }
  body { font-family:Arial,sans-serif; font-weight:600; font-size:13px; color:#000 }
  .c { text-align:center } .b { font-weight:bold }
  .sep { border-top:1px dashed #000; margin:5px 0 }
  .sep2 { border-top:2px solid #000; margin:5px 0 }
  img.logo { display:block; margin:4px auto; max-width:60mm; height:auto; max-height:20mm }
  table { width:100%; border-collapse:collapse; margin-top:4px }
  /* th/td se quedan chicos a propósito — hasta 6 columnas caben en 70mm útiles;
     el negro sólido + Arial en negrita ya arregla la ilegibilidad sin romper el ancho */
  th { font-size:10px; border-bottom:1px solid #000; padding:2px 0; text-align:left }
  td { font-size:10px; padding:2px 0; border-bottom:1px dotted #000 }
  td:last-child, th:last-child { text-align:right }
</style></head><body>
<img class="logo" src="${origin}/logos/berlin.png" alt=""/>
<div class="c b" style="font-size:13px;margin:3px 0">*Café Bar Berlín*</div>
<div class="sep2"></div>
<div class="c b">${titulo.toUpperCase()}</div>
<div class="c" style="font-size:12px">${subtitulo ?? new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>
<div class="sep"></div>
<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
<div class="sep"></div>
<div class="c" style="font-size:12px;margin-top:4px">Sistema Kalreco v1.0</div>
</body></html>`
  const w = window.open('','_blank','width=440,height=700')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); setTimeout(() => w.close(), 600) }, 400) }
}

// ── Tarjeta de reporte ────────────────────────────────────────
function ReporteCard({
  label, sub, icon: Icon, color, onPreview
}: { label: string; sub: string; icon: React.ElementType; color: string; onPreview: () => void }) {
  return (
    <div onClick={onPreview}
      className="bg-brand-navy rounded-xl border border-white/5 p-4 cursor-pointer
                 hover:border-white/15 transition-colors group flex items-start gap-3 min-h-[80px]">
      <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${color}18` }}>
        <Icon size={18} style={{ color }}/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
      </div>
      <Download size={14} className="text-gray-600 group-hover:text-gray-300 transition-colors flex-shrink-0 mt-0.5"/>
    </div>
  )
}

// ── Modal de previa ───────────────────────────────────────────
function PreviewModal({
  titulo, subtitulo, columnas, filas, datos, hojaExtra, sufijoArchivo, controles, onClose
}: {
  titulo: string; subtitulo?: string; columnas: string[]; filas: string[][]; datos: Record<string,unknown>[]
  hojaExtra?: { nombre: string; datos: Record<string,unknown>[] }; sufijoArchivo?: string
  controles?: React.ReactNode; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-white font-bold">{titulo}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{subtitulo ?? new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={18}/>
          </button>
        </div>

        {/* Tabla preview */}
        <div className="flex-1 overflow-auto p-4">
          {controles}
          {filas.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
              <PieChart size={36} className="opacity-20"/>
              <p className="text-sm">Sin datos para este período</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {columnas.map(c => (
                    <th key={c} className="text-left text-[11px] text-gray-500 uppercase tracking-wider pb-2 pr-4 font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filas.map((fila, i) => (
                  <tr key={i}>
                    {fila.map((v, j) => (
                      <td key={j} className="py-2.5 pr-4 text-white text-xs">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Acciones */}
        <div className="px-5 pb-5 pt-3 border-t border-white/10 flex gap-3 flex-shrink-0 flex-wrap">
          <button onClick={() => exportarExcel(titulo, datos, sufijoArchivo, hojaExtra)}
            className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400
                       border border-green-500/30 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors">
            <FileSpreadsheet size={15}/> Exportar Excel
          </button>
          <button onClick={() => imprimirReporte(titulo, filas, columnas, subtitulo)}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400
                       border border-red-500/30 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors">
            <Printer size={15}/> Imprimir / PDF
          </button>
          <button onClick={onClose}
            className="ml-auto px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm hover:bg-white/5 min-h-[44px]">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Ventas Día — transacciones individuales ─────────────
type SortCol = 'ticket'|'monto'|'metodo'|'cliente'|'vendedor'
const hoyCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const sumarDias = (f: string, n: number) => {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().split('T')[0]
}
const fmtFecha = (f: string) => {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ModalVentasDia({ onClose, desdeInicial, hastaInicial }: { onClose: () => void; desdeInicial?: string; hastaInicial?: string }) {
  const [desde, setDesde] = useState(desdeInicial || hoyCol())
  const [hasta, setHasta] = useState(hastaInicial || hoyCol())
  const [tab, setTab] = useState<'trans' | 'cajero' | 'area'>('trans')
  const rangoValido = !!desde && !!hasta && desde <= hasta

  const { data: detalle, isLoading, isError } = useQuery<DetalleVentas>({
    queryKey: ['rep-ventas-detalle', desde, hasta],
    queryFn:  () => api.get('/berlin/reportes/ventas-detalle', { params: { desde, hasta } }).then(r => r.data),
    enabled:  rangoValido,
  })
  const ventas = detalle?.transacciones ?? []
  const etiquetaRango = desde === hasta ? fmtFecha(desde) : `${fmtFecha(desde)} – ${fmtFecha(hasta)}`
  const hoy = hoyCol()
  const atajos: [string, string, string][] = [
    ['Hoy', hoy, hoy],
    ['Ayer', sumarDias(hoy, -1), sumarDias(hoy, -1)],
    ['7 días', sumarDias(hoy, -6), hoy],
    ['Este mes', `${hoy.substring(0, 7)}-01`, hoy],
  ]
  const totalVentas  = ventas.reduce((s, v) => s + v.total, 0)
  const totalCredito = ventas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + v.total, 0)

  const [sortCol,  setSortCol]  = useState<SortCol>('ticket')
  const [sortAsc,  setSortAsc]  = useState(false)
  const [fTicket,  setFTicket]  = useState('')
  const [fMonto,   setFMonto]   = useState('')
  const [fMetodo,  setFMetodo]  = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fVendedor,setFVendedor]= useState('')

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(v => !v)
    else { setSortCol(col); setSortAsc(true) }
  }
  const SortIcon = ({ col }: { col: SortCol }) => (
    <span className={`ml-0.5 text-[10px] ${sortCol === col ? 'text-brand-teal' : 'text-gray-600'}`}>
      {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  const filtradas = ventas
    .filter(v => {
      const hora  = new Date(v.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      const ticket = `${v.numero_venta} ${hora}`.toLowerCase()
      const metodo = (METODO_BADGE[v._categoria ?? v.metodo_pago]?.label ?? v.metodo_pago).toLowerCase()
      const cliente = (v.cliente?.nombre ?? 'pago contado').toLowerCase()
      const vendedor = (v.vendedor?.nombre ?? '').toLowerCase()
      return (
        ticket.includes(fTicket.toLowerCase()) &&
        String(v.total).includes(fMonto.replace(/\D/g,'')) &&
        metodo.includes(fMetodo.toLowerCase()) &&
        cliente.includes(fCliente.toLowerCase()) &&
        vendedor.includes(fVendedor.toLowerCase())
      )
    })
    .sort((a, b) => {
      let va: string|number = 0, vb: string|number = 0
      if (sortCol === 'ticket')   { va = a.numero_venta;              vb = b.numero_venta }
      if (sortCol === 'monto')    { va = a.total;                     vb = b.total }
      if (sortCol === 'metodo')   { va = a.metodo_pago;               vb = b.metodo_pago }
      if (sortCol === 'cliente')  { va = a.cliente?.nombre ?? '';     vb = b.cliente?.nombre ?? '' }
      if (sortCol === 'vendedor') { va = a.vendedor?.nombre ?? '';    vb = b.vendedor?.nombre ?? '' }
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })

  const imprimirVenta = (v: VentaDia) => {
    const origin = window.location.origin
    const hora = new Date(v.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    const items = (v.items ?? []).map(it =>
      `<tr><td>${it.producto?.nombre ?? '—'}</td><td class="r">×${it.cantidad}</td><td class="r">${fmt(it.subtotal)}</td></tr>`
    ).join('')
    const metodo = METODO_BADGE[v.metodo_pago]?.label ?? v.metodo_pago
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>${v.numero_venta}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{margin:5mm;size:80mm auto}
  body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
  .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:4px 0}
  img.logo{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:18mm}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  td{padding:2px 0;font-size:13px}.r{text-align:right}
  .total{font-size:14px;font-weight:bold}
</style></head><body>
<img class="logo" src="${origin}/logos/berlin.png" alt=""/>
<div class="c b" style="font-size:13px;margin:3px 0">*Café Bar Berlín*</div>
<div class="sep"></div>
<div class="c">${v.numero_venta} · ${hora}</div>
<div class="sep"></div>
<table>
  <tr><td class="b">Producto</td><td class="r b">Cant.</td><td class="r b">Total</td></tr>
  ${items}
</table>
<div class="sep"></div>
<table>
  <tr><td class="b total">TOTAL</td><td class="r total">${fmt(v.total)}</td></tr>
  <tr><td>Método</td><td class="r">${metodo}</td></tr>
  ${v.cliente ? `<tr><td>Cliente</td><td class="r">${v.cliente.nombre}</td></tr>` : ''}
  ${v.metodo_pago === 'credito' ? `<tr><td>Deuda pendiente</td><td class="r">${fmt(v.saldo_pendiente ?? v.total)}</td></tr>` : ''}
</table>
<div class="sep"></div>
<div class="c" style="font-size:10px;margin-top:4px">Sistema Kalreco v1.0</div>
</body></html>`
    const w = window.open('', '_blank', 'width=440,height=600')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); setTimeout(() => w.close(), 600) }, 400) }
  }

  const exportarExcelVentas = () => {
    const datos = ventas.map(v => ({
      'Ticket':    v.numero_venta,
      'Hora':      new Date(v.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      'Total':     v.total,
      'Método':    METODO_BADGE[v.metodo_pago]?.label ?? v.metodo_pago,
      'Cliente':   v.cliente?.nombre ?? '—',
      'Vendedor':  v.vendedor?.nombre ?? '—',
      'Saldo':     v.saldo_pendiente ?? 0,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'Transacciones')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((detalle?.desglose_vendedores ?? []).map(d => ({
      Cajero: d.nombre, 'No. ventas': d.num_ventas, Total: d.total,
      'POS ventas': d.pos.num_ventas, 'POS total': d.pos.total,
      'Mesas ventas': d.mesa.num_ventas, 'Mesas total': d.mesa.total,
    }))), 'Por cajero')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((detalle?.desglose_estaciones ?? []).flatMap(e =>
      e.items.map(it => ({
        Área: e.nombre, Responsable: (e.responsables ?? []).join(' / '),
        Producto: it.nombre, Cantidad: it.cantidad, Valor: it.valor,
      })))), 'Por área')
    XLSX.writeFile(wb, `Ventas_${desde}_a_${hasta}.xlsx`)
  }

  // Resumen 80mm: totales por cajero y por área con productos (lo que ya no sale en el cierre)
  const imprimirResumen = () => {
    const origin = window.location.origin
    const cajeros = (detalle?.desglose_vendedores ?? []).map(d => `
<div class="row b"><span>${d.nombre} (${d.num_ventas})</span><span class="amt">${fmt(d.total)}</span></div>
${d.pos.num_ventas > 0 ? `<div class="row"><span>&nbsp;&nbsp;POS (${d.pos.num_ventas})</span><span class="amt">${fmt(d.pos.total)}</span></div>` : ''}
${d.mesa.num_ventas > 0 ? `<div class="row"><span>&nbsp;&nbsp;Mesas (${d.mesa.num_ventas})</span><span class="amt">${fmt(d.mesa.total)}</span></div>` : ''}`).join('')
    const areas = (detalle?.desglose_estaciones ?? []).map(e => `
<div class="row b" style="margin-top:5px;font-size:15px;text-transform:uppercase"><span>${e.nombre}${e.responsables && e.responsables.length ? ` — ${e.responsables.join(' / ')}` : ''}</span><span class="amt">${fmt(e.total)}</span></div>
${e.items.map(it => `<div class="row"><span>&nbsp;&nbsp;${it.cantidad}x ${it.nombre}</span><span class="amt">${fmt(it.valor)}</span></div>`).join('')}`).join('')
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Ventas ${desde} a ${hasta}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{margin:5mm;size:80mm auto}
  body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
  .c{text-align:center}.b{font-weight:bold}
  .sep{border-top:1px dashed #000;margin:5px 0}.sep2{border-top:2px solid #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;gap:6px;margin:2px 0}
  .row>span:first-child{flex:1;min-width:0}
  .amt{flex-shrink:0;text-align:right;white-space:nowrap;font-weight:700}
  img.logo{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:20mm}
</style></head><body>
<img class="logo" src="${origin}/logos/berlin.png" alt=""/>
<div class="c b">*Café Bar Berlín*</div>
<div class="sep2"></div>
<div class="c b" style="font-size:14px">RESUMEN DE VENTAS</div>
<div class="c">${etiquetaRango}</div>
<div class="c">${detalle?.num_turnos ?? 0} turno(s) · ${ventas.length} transacciones</div>
<div class="sep2"></div>
<div class="row b"><span>Total ventas</span><span class="amt">${fmt(detalle?.total_ventas ?? 0)}</span></div>
<div class="sep"></div>
<p class="b">VENTAS POR CAJERO — POS / MESAS</p>${cajeros}
<div class="sep"></div>
<p class="b">DESPACHO POR AREA</p>${areas}
<div class="sep"></div>
<div class="c">Sistema Kalreco v1.0</div>
</body></html>`
    const w = window.open('', '_blank', 'width=440,height=760')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); setTimeout(() => w.close(), 800) }, 400) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-3xl border border-white/10 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-white font-bold">Ventas por fecha</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {etiquetaRango}
              {' · '}{detalle?.num_turnos ?? 0} turno(s) · {ventas.length} transacciones · Total: {fmt(totalVentas)}
              {totalCredito > 0 && <span className="text-blue-400 ml-2">· Crédito: {fmt(totalCredito)}</span>}
            </p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={18}/>
          </button>
        </div>

        {/* Rango de fechas — filtra por la fecha de APERTURA del turno */}
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center gap-2 flex-shrink-0">
          {atajos.map(([lbl, d, h]) => (
            <button key={lbl} onClick={() => { setDesde(d); setHasta(h) }}
              className={`text-xs px-3 py-1.5 rounded-lg border min-h-[34px] ${desde === d && hasta === h
                ? 'bg-brand-teal/20 border-brand-teal/40 text-brand-teal'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}>{lbl}</button>
          ))}
          <label className="text-[11px] text-gray-500 ml-1">Desde
            <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)}
              className="ml-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"/>
          </label>
          <label className="text-[11px] text-gray-500">Hasta
            <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)}
              className="ml-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"/>
          </label>
        </div>
        <div className="px-5 pt-2 flex gap-1 border-b border-white/10 flex-shrink-0">
          {([['trans', 'Transacciones'], ['cajero', 'Por cajero'], ['area', 'Por área y productos']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 ${tab === k
                ? 'text-brand-teal border-brand-teal' : 'text-gray-500 border-transparent hover:text-white'}`}>{l}</button>
          ))}
        </div>

        {!rangoValido ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-gray-500">Elige un rango de fechas válido (Desde ≤ Hasta)</div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-gray-500">Cargando…</div>
        ) : isError ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-red-400">No se pudo cargar el reporte</div>
        ) : tab === 'cajero' ? (
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {(detalle?.desglose_vendedores ?? []).length === 0 && <p className="text-sm text-gray-600 text-center py-12">Sin ventas en este rango</p>}
            {(detalle?.desglose_vendedores ?? []).map(d => (
              <div key={d.vendedor_id ?? 'sin'} className="bg-brand-dark rounded-xl p-3 border border-white/5">
                <div className="flex justify-between font-bold text-sm">
                  <span className="text-white">{d.nombre} <span className="text-gray-500 font-normal">({d.num_ventas})</span></span>
                  <span className="text-brand-teal font-mono">{fmt(d.total)}</span>
                </div>
                {d.pos.num_ventas > 0 && <div className="flex justify-between text-xs pl-2 mt-1"><span className="text-gray-500">POS ({d.pos.num_ventas})</span><span className="text-gray-300 font-mono">{fmt(d.pos.total)}</span></div>}
                {d.mesa.num_ventas > 0 && <div className="flex justify-between text-xs pl-2"><span className="text-gray-500">Mesas ({d.mesa.num_ventas})</span><span className="text-gray-300 font-mono">{fmt(d.mesa.total)}</span></div>}
              </div>
            ))}
          </div>
        ) : tab === 'area' ? (
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {(detalle?.desglose_estaciones ?? []).length === 0 && <p className="text-sm text-gray-600 text-center py-12">Sin ventas en este rango</p>}
            {(detalle?.desglose_estaciones ?? []).map(e => (
              <div key={e.id} className="bg-brand-dark rounded-xl p-3 border border-white/5">
                <div className="flex justify-between font-bold text-sm uppercase">
                  <span className="text-white">{e.nombre}{e.responsables && e.responsables.length ? ` — ${e.responsables.join(' / ')}` : ''}</span>
                  <span className="text-brand-teal font-mono">{fmt(e.total)}</span>
                </div>
                <div className="mt-1 divide-y divide-white/5">
                  {e.items.map(it => (
                    <div key={it.nombre} className="flex justify-between text-xs py-1 pl-2">
                      <span className="text-gray-300">{it.cantidad}x {it.nombre}</span>
                      <span className="text-gray-400 font-mono">{fmt(it.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(() => {
              const aj = (detalle?.total_ventas ?? 0) - (detalle?.desglose_estaciones ?? []).reduce((s, e) => s + e.total, 0)
              return Math.abs(aj) >= 1 ? <p className="text-[11px] text-gray-500 text-right">Redondeo y ajustes: {aj < 0 ? '-' : ''}{fmt(Math.abs(aj))}</p> : null
            })()}
          </div>
        ) : (
        /* Tabla transacciones */
        <div className="flex-1 overflow-auto">
          {ventas.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-gray-600">
              <ShoppingCart size={36} className="opacity-20"/>
              <p className="text-sm">Sin ventas registradas en este rango</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1C1A18] z-10">
                {/* Encabezados clicables */}
                <tr className="border-b border-white/10">
                  {([
                    ['ticket',  'Ticket / Hora', 'text-left'],
                    ['monto',   'Monto',          'text-right'],
                    ['metodo',  'Método',         'text-center'],
                    ['cliente', 'Cliente / Deuda','text-left'],
                    ['vendedor','Vendedor',       'text-left'],
                  ] as [SortCol, string, string][]).map(([col, lbl, align]) => (
                    <th key={col}
                      className={`${align} px-4 py-2.5 text-[11px] text-gray-400 uppercase tracking-wider font-medium cursor-pointer hover:text-white select-none`}
                      onClick={() => toggleSort(col)}>
                      {lbl}<SortIcon col={col}/>
                    </th>
                  ))}
                  <th className="text-center px-4 py-2.5 text-[11px] text-gray-400 uppercase tracking-wider font-medium">Acción</th>
                </tr>
                {/* Inputs de búsqueda por columna */}
                <tr className="border-b border-white/5 bg-[#1C1A18]">
                  {([
                    [fTicket,   setFTicket,   'text-left',   'Buscar ticket…'],
                    [fMonto,    setFMonto,    'text-right',  'Valor…'],
                    [fMetodo,   setFMetodo,   'text-center', 'Método…'],
                    [fCliente,  setFCliente,  'text-left',   'Cliente…'],
                    [fVendedor, setFVendedor, 'text-left',   'Vendedor…'],
                  ] as [string, (v: string) => void, string, string][]).map(([val, set, , ph], i) => (
                    <td key={i} className="px-2 py-1.5">
                      <input value={val} onChange={e => set(e.target.value)}
                        placeholder={ph}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white
                                   placeholder:text-gray-600 focus:outline-none focus:border-brand-teal/50"/>
                    </td>
                  ))}
                  <td/>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtradas.map(v => {
                  const hora  = new Date(v.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                  const deuda = v.metodo_pago === 'credito' && (v.saldo_pendiente ?? 0) > 0
                  const badgeKey = v._categoria ?? v.metodo_pago
                  const esContable = !!v._source
                  return (
                    <tr key={v.id} className={`hover:bg-white/2 transition-colors ${esContable ? 'bg-brand-teal/3' : ''}`}>
                      {/* Ticket / Hora */}
                      <td className="px-4 py-3">
                        <p className={`text-xs font-bold font-mono ${esContable ? 'text-brand-teal' : 'text-brand-teal'}`}>
                          {esContable ? v.numero_venta : `#${v.numero_venta.slice(-8)}`}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{hora}</p>
                      </td>

                      {/* Monto */}
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-bold text-white tabular-nums">{fmt(v.total)}</p>
                        {deuda && <p className="text-[10px] text-blue-400 tabular-nums">Debe: {fmt(v.saldo_pendiente ?? 0)}</p>}
                        {v.metodo_pago === 'credito' && !deuda && <p className="text-[10px] text-green-400">Saldado</p>}
                      </td>

                      {/* Método */}
                      <td className="px-4 py-3 text-center">
                        <MetodoBadge metodo={badgeKey} />
                      </td>

                      {/* Cliente / Deuda */}
                      <td className="px-4 py-3">
                        {v.cliente ? (
                          <div>
                            <p className="text-xs text-white font-semibold">{v.cliente.nombre}</p>
                            {deuda && <p className="text-[10px] text-blue-400">Pago pendiente</p>}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-600">{esContable ? '—' : 'Pago contado'}</p>
                        )}
                      </td>

                      {/* Vendedor */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-400">{v.vendedor?.nombre ?? '—'}</p>
                      </td>

                      {/* Acción */}
                      <td className="px-4 py-3 text-center">
                        {!esContable && (
                          <button onClick={() => imprimirVenta(v)} title="Imprimir ticket"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg
                                       text-gray-500 hover:text-brand-teal hover:bg-brand-teal/10 transition-colors">
                            <Printer size={14}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Totales */}
              <tfoot className="border-t-2 border-white/10 bg-brand-dark/40">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-gray-400">
                    {filtradas.length} de {ventas.length} transacciones
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-brand-teal tabular-nums">
                    {fmt(filtradas.reduce((s, v) => s + v.total, 0))}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        )}

        {/* Acciones */}
        <div className="px-5 pb-5 pt-3 border-t border-white/10 flex gap-3 flex-shrink-0 flex-wrap">
          <button onClick={exportarExcelVentas}
            className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400
                       border border-green-500/30 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors">
            <FileSpreadsheet size={15}/> Exportar Excel
          </button>
          <button onClick={imprimirResumen}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400
                       border border-red-500/30 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors">
            <Printer size={15}/> Imprimir resumen
          </button>
          <button onClick={onClose}
            className="ml-auto px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm hover:bg-white/5 min-h-[44px]">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Barra de fechas compartida por todos los reportes ─────────
function BarraFechas({ desde, hasta, setRango }: { desde: string; hasta: string; setRango: (d: string, h: string) => void }) {
  const hoy = hoyCol()
  const mesAnt = (() => {
    const [y, m] = hoy.split('-').map(Number)
    const ini = new Date(Date.UTC(y, m - 2, 1)).toISOString().split('T')[0]
    const fin = new Date(Date.UTC(y, m - 1, 0)).toISOString().split('T')[0]
    return [ini, fin] as const
  })()
  const atajos: [string, string, string][] = [
    ['Hoy', hoy, hoy],
    ['Ayer', sumarDias(hoy, -1), sumarDias(hoy, -1)],
    ['7 días', sumarDias(hoy, -6), hoy],
    ['Este mes', `${hoy.substring(0, 7)}-01`, hoy],
    ['Mes anterior', mesAnt[0], mesAnt[1]],
  ]
  return (
    <div className="bg-brand-navy rounded-xl border border-white/5 p-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-gray-500 mr-1">Período de los reportes:</span>
      {atajos.map(([lbl, d, h]) => (
        <button key={lbl} onClick={() => setRango(d, h)}
          className={`text-xs px-3 py-1.5 rounded-lg border min-h-[34px] ${desde === d && hasta === h
            ? 'bg-brand-teal/20 border-brand-teal/40 text-brand-teal'
            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}>{lbl}</button>
      ))}
      <label className="text-[11px] text-gray-500 ml-1">Desde
        <input type="date" value={desde} max={hasta || undefined} onChange={e => e.target.value && setRango(e.target.value, hasta)}
          className="ml-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"/>
      </label>
      <label className="text-[11px] text-gray-500">Hasta
        <input type="date" value={hasta} min={desde || undefined} onChange={e => e.target.value && setRango(desde, e.target.value)}
          className="ml-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white [color-scheme:dark]"/>
      </label>
    </div>
  )
}

type ModalCfg = {
  titulo: string; subtitulo: string; columnas: string[]; filas: string[][]
  datos: Record<string, unknown>[]; hojaExtra?: { nombre: string; datos: Record<string, unknown>[] }
  controles?: React.ReactNode
}

// ── Componente principal ──────────────────────────────────────
export default function ReportesPage() {
  const [modalKey, setModalKey] = useState<string | null>(null)
  const [showVentasDia, setShowVentasDia] = useState(false)
  const [topN, setTopN] = useState<10 | 20 | 0>(10)   // 0 = todos

  // Fecha en zona Colombia (UTC-5) para que los queries coincidan con los datos almacenados
  const hoy  = hoyCol()
  const [desde, setDesde] = useState(`${hoy.substring(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const setRango = (d: string, h: string) => { setDesde(d); setHasta(h) }
  const rangoOk = !!desde && !!hasta && desde <= hasta
  const etiqueta = desde === hasta ? fmtFecha(desde) : `${fmtFecha(desde)} – ${fmtFecha(hasta)}`
  const sufijoArchivo = desde === hasta ? desde : `${desde}_a_${hasta}`

  const { data: topProd = [] } = useQuery<{producto_id:string;nombre:string;cantidad:number;total:number;total_credito:number}[]>({
    queryKey: ['rep-vendidos', desde, hasta],
    queryFn:  () => api.get('/berlin/reportes/productos-vendidos', { params: { desde, hasta } }).then(r => r.data).catch(fallbackSiNoRed([])),
    enabled:  rangoOk,
  })

  const { data: gastos = [] } = useQuery<{categoria:string;monto:number}[]>({
    queryKey: ['rep-gastos', desde, hasta],
    queryFn:  () => api.get('/berlin/gastos', { params: { desde, hasta, limit: 5000 } }).then(r => r.data).catch(fallbackSiNoRed([])),
    enabled:  rangoOk,
  })

  const { data: movResumen } = useQuery<Resumen & { credito_vendido?: number }>({
    queryKey: ['rep-mov-resumen', desde, hasta],
    queryFn:  () => api.get('/berlin/movimientos/resumen', { params: { periodo: 'rango', desde, hasta } }).then(r => r.data).catch(fallbackSiNoRed(({ ingresos:0,egresos:0,utilidad:0 }))),
    enabled:  rangoOk,
  })

  // Libro de movimientos = mismo origen que el Libro Diario (ventas, abonos, gastos y compras)
  const { data: libro } = useQuery<{ saldo_base: number; filas: any[] }>({
    queryKey: ['rep-libro', desde, hasta],
    queryFn:  () => api.get('/berlin/movimientos/libro-diario', { params: { desde, hasta } }).then(r => r.data).catch(fallbackSiNoRed({ saldo_base: 0, filas: [] })),
    enabled:  rangoOk,
  })
  const libroFilas = libro?.filas ?? []

  const { data: invMov } = useQuery<{ resumen: any[]; filas: any[] }>({
    queryKey: ['rep-inv-mov', desde, hasta],
    queryFn:  () => api.get('/berlin/reportes/movimiento-inventario', { params: { desde, hasta } }).then(r => r.data).catch(fallbackSiNoRed({ resumen: [], filas: [] })),
    enabled:  rangoOk,
  })

  const { data: productos = [] } = useQuery<{nombre:string;precio_venta:number;stock_actual:number;tipo_producto:string;reportar_a_dian:boolean;unidad_venta:string}[]>({
    queryKey: ['rep-productos'],
    queryFn:  () => api.get('/berlin/productos', { params: { limit: 500 } }).then(r => r.data).catch(fallbackSiNoRed([])),
  })

  const { data: insumos = [] } = useQuery<{nombre:string;stock_actual:number;costo_unitario:number;unidad_medida:string}[]>({
    queryKey: ['rep-insumos'],
    queryFn:  () => api.get('/berlin/insumos').then(r => r.data).catch(fallbackSiNoRed([])),
  })

  const { data: rentabilidadData = [] } = useQuery<{nombre:string;tipo:string;precio_venta:number;costo_base:number;costo_real:number;margen_pct:number|null;tiene_receta:boolean}[]>({
    queryKey: ['rep-rentabilidad'],
    queryFn:  () => api.get('/berlin/reportes/rentabilidad').then(r => r.data).catch(fallbackSiNoRed([])),
  })

  const fechaCorta = (f: string) => new Date(f).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
  const CORTE = 'Corte a hoy (no depende de fechas)'

  // ── Reportes disponibles ──────────────────────────────────────
  const REPORTES: { label: string; sub: string; icon: React.ElementType; color: string; abrir?: () => void; armar?: () => ModalCfg }[] = [
    {
      label: 'Ventas del día',
      sub:   'Consulta por día o rango · transacciones, por cajero y por área con productos',
      icon:  FileText, color: '#10B981',
      abrir: () => setShowVentasDia(true),
    },
    {
      label: 'Utilidades del período',
      sub:   'Ingresos cobrados, egresos y ganancia neta del rango',
      icon:  PieChart, color: '#6366F1',
      armar: () => ({
        titulo: 'Utilidades', subtitulo: etiqueta,
        columnas: ['Concepto','Valor'],
        filas: [
          ['Ingresos cobrados', fmt(movResumen?.ingresos ?? 0)],
          ['Egresos totales',   fmt(movResumen?.egresos ?? 0)],
          ['Utilidad neta',     fmt(movResumen?.utilidad ?? 0)],
          ['Crédito vendido (por cobrar, no incluido)', fmt(movResumen?.credito_vendido ?? 0)],
        ],
        datos: [
          { Concepto: 'Ingresos cobrados', Valor: movResumen?.ingresos ?? 0 },
          { Concepto: 'Egresos totales',   Valor: movResumen?.egresos  ?? 0 },
          { Concepto: 'Utilidad neta',     Valor: movResumen?.utilidad ?? 0 },
          { Concepto: 'Crédito vendido (por cobrar, no incluido)', Valor: movResumen?.credito_vendido ?? 0 },
        ],
      }),
    },
    {
      label: 'Gastos del período',
      sub:   'Desglose por categoría del rango elegido',
      icon:  FileSpreadsheet, color: '#F97316',
      armar: () => {
        const agrup: Record<string,number> = {}
        gastos.forEach((g: any) => { agrup[g.categoria] = (agrup[g.categoria]||0) + parseFloat(g.monto) })
        const orden = Object.entries(agrup).sort((a, b) => b[1] - a[1])
        const total = orden.reduce((s, [, m]) => s + m, 0)
        return {
          titulo: 'Gastos', subtitulo: etiqueta,
          columnas: ['Categoría','Total'],
          filas: [...orden.map(([cat, monto]) => [cat, fmt(monto)]), ...(orden.length ? [['TOTAL', fmt(total)]] : [])],
          datos: orden.map(([cat, monto]) => ({ Categoría: cat, Total: monto })),
        }
      },
    },
    {
      label: 'Productos más vendidos',
      sub:   'Lista completa del rango · 10 / 20 / todos',
      icon:  ShoppingCart, color: '#14B8A6',
      armar: () => {
        const lista = topN === 0 ? topProd : topProd.slice(0, topN)
        return {
          titulo: 'Productos vendidos', subtitulo: etiqueta,
          columnas: ['Producto','Unidades','Total'],
          filas: lista.map((p, i) => [`${i+1}. ${p.nombre}`, String(p.cantidad), fmt(p.total)]),
          datos: lista.map(p => ({ Producto: p.nombre, Unidades: p.cantidad, Total: p.total, 'De los cuales a crédito': p.total_credito })),
          controles: (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-[11px] text-gray-500 mr-1">Mostrar:</span>
              {([[10, 'Top 10'], [20, 'Top 20'], [0, 'Todos']] as const).map(([n, l]) => (
                <button key={n} onClick={() => setTopN(n)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${topN === n
                    ? 'bg-brand-teal/20 border-brand-teal/40 text-brand-teal'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}`}>{l}</button>
              ))}
              <span className="text-[11px] text-gray-500 ml-2">{topProd.length} productos en el rango</span>
            </div>
          ),
        }
      },
    },
    {
      label: 'Libro de movimientos',
      sub:   'Igual al Libro Diario: ventas, abonos, gastos y compras del rango',
      icon:  BarChart3Icon, color: '#8B5CF6',
      armar: () => ({
        titulo: 'Libro de movimientos', subtitulo: etiqueta,
        columnas: ['Fecha','Concepto','Categoría','Pago','Ingreso','Egreso','Compra','Saldo'],
        filas: libroFilas.map((m: any) => [
          fechaCorta(m.fecha), m.concepto, m.categoria, m.metodo_pago || '',
          m.es_credito ? 'Crédito (no cobrado)' : (m.ingreso > 0 ? fmt(m.ingreso) : '—'),
          m.egreso > 0 ? fmt(m.egreso) : '—', m.compra > 0 ? fmt(m.compra) : '—', fmt(m.saldo),
        ]),
        datos: libroFilas.map((m: any) => ({
          Fecha: fechaCorta(m.fecha), Concepto: m.concepto, Categoría: m.categoria, Pago: m.metodo_pago || '',
          Ingreso: m.ingreso, Egreso: m.egreso, Compra: m.compra, Saldo: m.saldo,
          Nota: m.es_credito ? 'Venta a crédito: no suma hasta que se abone' : '',
        })),
      }),
    },
    {
      label: 'Movimiento de inventario',
      sub:   'Entradas y salidas de productos e insumos del rango',
      icon:  Package, color: '#0EA5E9',
      armar: () => {
        const res = invMov?.resumen ?? []
        const det = invMov?.filas ?? []
        const num = (n: number) => (Math.round(n * 100) / 100).toString()
        return {
          titulo: 'Movimiento inventario', subtitulo: `${etiqueta} · entradas, salidas y neto por ítem`,
          columnas: ['Tipo','Ítem','Entradas','Salidas','Neto'],
          filas: res.map((a: any) => [a.item_tipo, `${a.nombre}${a.unidad ? ` (${a.unidad})` : ''}`, num(a.entradas), num(a.salidas), num(a.neto)]),
          datos: res.map((a: any) => ({ Tipo: a.item_tipo, Ítem: a.nombre, Unidad: a.unidad, Entradas: a.entradas, Salidas: a.salidas, Neto: a.neto })),
          hojaExtra: { nombre: 'Detalle', datos: det.map((f: any) => ({
            Fecha: fechaCorta(f.fecha), Tipo: f.item_tipo, Ítem: f.nombre, Unidad: f.unidad,
            Entrada: f.entrada, Salida: f.salida, Origen: f.origen, Detalle: f.detalle,
          })) },
          controles: (
            <p className="text-[11px] text-amber-400/80 mb-3">
              Nota: el consumo de insumos por planilla de producción no queda registrado con fecha, por eso no aparece como salida de insumos.
              El Excel trae también la hoja "Detalle" con cada movimiento.
            </p>
          ),
        }
      },
    },
    {
      label: 'Inventario valorizado',
      sub:   `Stock actual + valor en pesos · ${CORTE}`,
      icon:  Package, color: '#3B82F6',
      armar: () => {
        const prodRows = productos.map(p => ({
          Tipo:     'Producto terminado',
          Nombre:   p.nombre,
          Stock:    p.stock_actual,
          Unidad:   p.unidad_venta,
          'Precio unitario': p.precio_venta,
          'Valor total':     Math.round(p.stock_actual * p.precio_venta),
        }))
        const insRows = insumos.map(i => ({
          Tipo:     'Insumo',
          Nombre:   i.nombre,
          Stock:    i.stock_actual,
          Unidad:   i.unidad_medida,
          'Precio unitario': i.costo_unitario,
          'Valor total':     Math.round(i.stock_actual * i.costo_unitario),
        }))
        const todos = [...prodRows, ...insRows]
        const totalValor = todos.reduce((s, r) => s + r['Valor total'], 0)
        return {
          titulo: 'Inventario valorizado', subtitulo: CORTE,
          columnas: ['Tipo','Nombre','Stock','Unidad','Precio','Valor total'],
          filas: [
            ...todos.map(r => [r.Tipo, r.Nombre, String(r.Stock), r.Unidad, fmt(r['Precio unitario']), fmt(r['Valor total'])]),
            ['','','','','TOTAL →', fmt(totalValor)],
          ],
          datos: todos,
        }
      },
    },
    {
      label: 'Rentabilidad por producto',
      sub:   `Costo real vs precio venta · margen % · ${CORTE}`,
      icon:  Percent, color: '#F43F5E',
      armar: () => {
        const conReceta  = rentabilidadData.filter(p => p.tiene_receta)
        const sinReceta  = rentabilidadData.filter(p => !p.tiene_receta && p.precio_venta > 0)
        const todos      = [...conReceta, ...sinReceta]
        return {
          titulo: 'Rentabilidad por producto', subtitulo: CORTE,
          columnas: ['Producto','Tipo','Costo real','Precio venta','Margen %'],
          filas: todos.map(p => [
            p.nombre,
            p.tipo === 'receta' ? 'Fabricado' : 'Compra/Venta',
            p.costo_real > 0 ? fmt(p.costo_real) : '—',
            fmt(p.precio_venta),
            p.margen_pct !== null ? `${p.margen_pct}%` : '—',
          ]),
          datos: todos.map(p => ({
            Producto:       p.nombre,
            Tipo:           p.tipo === 'receta' ? 'Fabricado' : 'Compra/Venta',
            'Costo base':   p.costo_base,
            'Costo real':   p.costo_real,
            'Precio venta': p.precio_venta,
            'Margen %':     p.margen_pct ?? '',
          })),
        }
      },
    },
    {
      label: 'Reporte tributario DIAN',
      sub:   `Solo productos marcados para facturar · ${CORTE}`,
      icon:  Scale, color: '#A855F7',
      armar: () => {
        const dian = productos.filter(p => p.reportar_a_dian)
        return {
          titulo: 'Reporte tributario DIAN', subtitulo: CORTE,
          columnas: ['Producto','Tipo','Precio venta','Stock actual'],
          filas: dian.map(p => [
            p.nombre,
            p.tipo_producto === 'receta' ? 'Fabricado' : 'Compra/Venta',
            fmt(p.precio_venta),
            String(p.stock_actual),
          ]),
          datos: dian.map(p => ({
            Producto:      p.nombre,
            Tipo:          p.tipo_producto === 'receta' ? 'Fabricado' : 'Compra/Venta',
            'Precio venta': p.precio_venta,
            'Stock actual': p.stock_actual,
          })),
        }
      },
    },
  ]

  const modal: ModalCfg | null = modalKey ? (REPORTES.find(r => r.label === modalKey)?.armar?.() ?? null) : null

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <PieChart size={20} className="text-green-400"/>
          <h2 className="text-lg font-bold text-white">Reportes e Informes</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportarExcel('Movimientos', libroFilas.map((m: any) => ({
              Fecha: fechaCorta(m.fecha), Concepto: m.concepto, Categoría: m.categoria, Pago: m.metodo_pago || '',
              Ingreso: m.ingreso, Egreso: m.egreso, Compra: m.compra, Saldo: m.saldo,
            })), sufijoArchivo)}
            className="text-xs px-3 py-1.5 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors flex items-center gap-1.5">
            <FileSpreadsheet size={12}/> Excel
          </button>
          <button
            onClick={() => imprimirReporte(
              'Movimientos',
              [
                ['Ingresos cobrados', fmt(movResumen?.ingresos ?? 0)],
                ['Egresos',  fmt(movResumen?.egresos  ?? 0)],
                ['Utilidad', fmt(movResumen?.utilidad ?? 0)],
                ['', ''],
                ...libroFilas.map((m: any) => [fechaCorta(m.fecha) + ' ' + m.concepto, m.es_credito ? 'Crédito' : fmt(m.ingreso > 0 ? m.ingreso : -(m.egreso + m.compra))]),
              ],
              ['Concepto', 'Monto'],
              etiqueta,
            )}
            className="text-xs px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-1.5">
            <Printer size={12}/> PDF / Imprimir
          </button>
        </div>
      </div>

      {/* Fechas: aplican a todos los reportes de abajo */}
      <BarraFechas desde={desde} hasta={hasta} setRango={setRango} />
      {!rangoOk && <p className="text-xs text-red-400">La fecha "Desde" no puede ser mayor que "Hasta".</p>}

      {/* KPIs del período */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label:'Ingresos cobrados', value: movResumen?.ingresos??0, color:'text-green-400', icon: TrendingUp },
          { label:'Egresos',  value: movResumen?.egresos??0,  color:'text-red-400',   icon: TrendingDown },
          { label:'Utilidad', value: movResumen?.utilidad??0, color: (movResumen?.utilidad??0)>=0?'text-brand-teal':'text-red-400', icon: PieChart },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-brand-navy rounded-xl border border-white/5 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className={color}/>
              <p className="text-[10px] text-gray-500">{label} · {etiqueta}</p>
            </div>
            <p className={`text-sm font-bold ${color} tabular-nums`}>{fmt(value)}</p>
          </div>
        ))}
      </div>
      {(movResumen?.credito_vendido ?? 0) > 0 && (
        <p className="text-[11px] text-blue-400">Crédito vendido en el período (aún no cobrado, no incluido arriba): {fmt(movResumen?.credito_vendido ?? 0)}</p>
      )}

      {/* Grid de reportes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORTES.map(r => (
          <ReporteCard key={r.label} label={r.label} sub={r.sub} icon={r.icon} color={r.color}
            onPreview={() => (r.abrir ? r.abrir() : setModalKey(r.label))}/>
        ))}
      </div>

      {/* Modal ventas día — transacciones individuales */}
      {showVentasDia && (
        <ModalVentasDia onClose={() => setShowVentasDia(false)} desdeInicial={desde} hastaInicial={hasta} />
      )}

      {/* Modal previa genérico */}
      {modal && (
        <PreviewModal
          titulo={modal.titulo}
          subtitulo={modal.subtitulo}
          columnas={modal.columnas}
          filas={modal.filas}
          datos={modal.datos}
          hojaExtra={modal.hojaExtra}
          sufijoArchivo={modal.subtitulo.includes('Corte') ? undefined : sufijoArchivo}
          controles={modal.controles}
          onClose={() => setModalKey(null)}
        />
      )}
    </div>
  )
}

// Alias para BarChart3 (lucide no exporta BarChart3Icon)
function BarChart3Icon(props: { size?: number; style?: React.CSSProperties; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={props.size??18} height={props.size??18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} style={props.style}><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
}
