import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import {
  PieChart, Download, FileText, FileSpreadsheet, Printer,
  X, TrendingUp, TrendingDown, ShoppingCart, Package, Scale, Percent,
} from 'lucide-react'
import * as XLSX from 'xlsx'

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
function exportarExcel(nombre: string, datos: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(datos)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nombre)
  XLSX.writeFile(wb, `${nombre}_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// ── Imprimir reporte en ventana 80mm ──────────────────────────
function imprimirReporte(titulo: string, filas: string[][], columnas: string[]) {
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
<div class="c" style="font-size:12px">${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>
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
  titulo, columnas, filas, datos, onClose
}: { titulo: string; columnas: string[]; filas: string[][]; datos: Record<string,unknown>[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-white font-bold">{titulo}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">{new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={18}/>
          </button>
        </div>

        {/* Tabla preview */}
        <div className="flex-1 overflow-auto p-4">
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
          <button onClick={() => exportarExcel(titulo, datos)}
            className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400
                       border border-green-500/30 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors">
            <FileSpreadsheet size={15}/> Exportar Excel
          </button>
          <button onClick={() => imprimirReporte(titulo, filas, columnas)}
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
function ModalVentasDia({ ventas, onClose }: { ventas: VentaDia[]; onClose: () => void }) {
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
    const ws = XLSX.utils.json_to_sheet(datos)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas del Día')
    XLSX.writeFile(wb, `Ventas_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-3xl border border-white/10 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h3 className="text-white font-bold">Ventas del Día</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
              {' · '}{ventas.length} transacciones · Total: {fmt(totalVentas)}
              {totalCredito > 0 && <span className="text-blue-400 ml-2">· Crédito: {fmt(totalCredito)}</span>}
            </p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={18}/>
          </button>
        </div>

        {/* Tabla transacciones */}
        <div className="flex-1 overflow-auto">
          {ventas.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-gray-600">
              <ShoppingCart size={36} className="opacity-20"/>
              <p className="text-sm">Sin ventas registradas hoy</p>
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

        {/* Acciones */}
        <div className="px-5 pb-5 pt-3 border-t border-white/10 flex gap-3 flex-shrink-0 flex-wrap">
          <button onClick={exportarExcelVentas}
            className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400
                       border border-green-500/30 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors">
            <FileSpreadsheet size={15}/> Exportar Excel
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

// ── Componente principal ──────────────────────────────────────
export default function ReportesPage() {
  const [modal, setModal] = useState<null | {
    titulo: string; columnas: string[]; filas: string[][]; datos: Record<string,unknown>[]
  }>(null)
  const [showVentasDia, setShowVentasDia] = useState(false)

  // Fecha en zona Colombia (UTC-5) para que los queries coincidan con los datos almacenados
  const hoy  = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const mes  = hoy.substring(0,7)
  const mes1 = `${mes}-01`

  const { data: ventasDia = [] } = useQuery<VentaDia[]>({
    queryKey: ['rep-ventas-dia', hoy],
    queryFn:  () => api.get('/berlin/reportes/ventas-dia', { params: { fecha: hoy } }).then(r => r.data).catch(() => []),
  })

  const { data: topProd = [] } = useQuery<{nombre:string;cantidad:number;total:number}[]>({
    queryKey: ['rep-top'],
    queryFn:  () => api.get('/berlin/reportes/productos-top').then(r => r.data).catch(() => []),
  })

  const { data: gastos = [] } = useQuery<{categoria:string;monto:number}[]>({
    queryKey: ['rep-gastos'],
    queryFn:  () => api.get('/berlin/gastos', { params: { desde: mes1, hasta: hoy } }).then(r => r.data).catch(() => []),
  })

  const { data: movResumen } = useQuery<Resumen>({
    queryKey: ['rep-mov-mes'],
    queryFn:  () => api.get('/berlin/movimientos/resumen', { params: { periodo: 'mes' } }).then(r => r.data).catch(() => ({ ingresos:0,egresos:0,utilidad:0 })),
  })

  const { data: movimientos = [] } = useQuery<{fecha:string;tipo:string;categoria:string;concepto:string;monto:number}[]>({
    queryKey: ['rep-movimientos-mes'],
    queryFn:  () => api.get('/berlin/movimientos', { params: { desde: mes1, hasta: hoy } }).then(r => r.data).catch(() => []),
  })

  const { data: productos = [] } = useQuery<{nombre:string;precio_venta:number;stock_actual:number;tipo_producto:string;reportar_a_dian:boolean;unidad_venta:string}[]>({
    queryKey: ['rep-productos'],
    queryFn:  () => api.get('/berlin/productos', { params: { limit: 500 } }).then(r => r.data).catch(() => []),
  })

  const { data: insumos = [] } = useQuery<{nombre:string;stock_actual:number;costo_unitario:number;unidad_medida:string}[]>({
    queryKey: ['rep-insumos'],
    queryFn:  () => api.get('/berlin/insumos').then(r => r.data).catch(() => []),
  })

  const { data: rentabilidadData = [] } = useQuery<{nombre:string;tipo:string;precio_venta:number;costo_base:number;costo_real:number;margen_pct:number|null;tiene_receta:boolean}[]>({
    queryKey: ['rep-rentabilidad'],
    queryFn:  () => api.get('/berlin/reportes/rentabilidad').then(r => r.data).catch(() => []),
  })

  // ── Reportes disponibles ──────────────────────────────────────
  const REPORTES = [
    {
      label: 'Ventas del día',
      sub:   'Transacciones individuales — ticket, monto, método, cliente',
      icon:  FileText, color: '#10B981',
      abrir: () => setShowVentasDia(true),
    },
    {
      label: 'Utilidades del mes',
      sub:   'Ingresos, egresos y ganancia neta',
      icon:  PieChart, color: '#6366F1',
      abrir: () => setModal({
        titulo:   'Utilidades del Mes',
        columnas: ['Concepto','Valor'],
        filas:    [
          ['Ingresos totales', fmt(movResumen?.ingresos ?? 0)],
          ['Egresos totales',  fmt(movResumen?.egresos ?? 0)],
          ['Utilidad neta',   fmt(movResumen?.utilidad ?? 0)],
        ],
        datos: [
          { Concepto: 'Ingresos totales', Valor: movResumen?.ingresos ?? 0 },
          { Concepto: 'Egresos totales',  Valor: movResumen?.egresos  ?? 0 },
          { Concepto: 'Utilidad neta',    Valor: movResumen?.utilidad ?? 0 },
        ],
      }),
    },
    {
      label: 'Gastos del período',
      sub:   'Desglose por categoría — mes actual',
      icon:  FileSpreadsheet, color: '#F97316',
      abrir: () => {
        const agrup: Record<string,number> = {}
        gastos.forEach((g: any) => { agrup[g.categoria] = (agrup[g.categoria]||0) + parseFloat(g.monto) })
        const filas = Object.entries(agrup).map(([cat, monto]) => [cat, fmt(monto)])
        setModal({
          titulo:   'Gastos del Período',
          columnas: ['Categoría','Total'],
          filas,
          datos:    Object.entries(agrup).map(([cat, monto]) => ({ Categoría: cat, Total: monto })),
        })
      },
    },
    {
      label: 'Productos más vendidos',
      sub:   'Top 10 por unidades',
      icon:  ShoppingCart, color: '#14B8A6',
      abrir: () => setModal({
        titulo:   'Productos Más Vendidos',
        columnas: ['Producto','Unidades','Total'],
        filas:    topProd.slice(0,10).map((p,i) => [`${i+1}. ${p.nombre}`, String(p.cantidad), fmt(p.total)]),
        datos:    topProd.slice(0,10).map(p => ({ Producto: p.nombre, Unidades: p.cantidad, Total: p.total })),
      }),
    },
    {
      label: 'Libro de movimientos',
      sub:   'Todos los ingresos y egresos del mes',
      icon:  BarChart3Icon, color: '#8B5CF6',
      abrir: () => setModal({
        titulo:   'Libro de Movimientos',
        columnas: ['Fecha','Tipo','Categoría','Concepto','Monto'],
        filas:    movimientos.map((m: any) => [
          new Date(m.fecha).toLocaleDateString('es-CO'),
          m.tipo, m.categoria, m.concepto, fmt(parseFloat(m.monto)),
        ]),
        datos: movimientos.map((m: any) => ({
          Fecha: new Date(m.fecha).toLocaleDateString('es-CO'),
          Tipo: m.tipo, Categoría: m.categoria, Concepto: m.concepto, Monto: parseFloat(m.monto),
        })),
      }),
    },
    {
      label: 'Inventario valorizado',
      sub:   'Stock actual + valor en pesos',
      icon:  Package, color: '#3B82F6',
      abrir: () => {
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
        setModal({
          titulo:   'Inventario Valorizado',
          columnas: ['Tipo','Nombre','Stock','Unidad','Precio','Valor total'],
          filas:    [
            ...todos.map(r => [r.Tipo, r.Nombre, String(r.Stock), r.Unidad, fmt(r['Precio unitario']), fmt(r['Valor total'])]),
            ['','','','','TOTAL →', fmt(totalValor)],
          ],
          datos: todos,
        })
      },
    },
    {
      label: 'Rentabilidad por producto',
      sub:   'Costo real vs precio venta · margen %',
      icon:  Percent, color: '#F43F5E',
      abrir: () => {
        const conReceta  = rentabilidadData.filter(p => p.tiene_receta)
        const sinReceta  = rentabilidadData.filter(p => !p.tiene_receta && p.precio_venta > 0)
        const todos      = [...conReceta, ...sinReceta]
        setModal({
          titulo:   'Rentabilidad por Producto',
          columnas: ['Producto','Tipo','Costo real','Precio venta','Margen %'],
          filas:    todos.map(p => [
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
        })
      },
    },
    {
      label: 'Reporte tributario DIAN',
      sub:   'Solo productos marcados para facturar',
      icon:  Scale, color: '#A855F7',
      abrir: () => {
        const dian = productos.filter(p => p.reportar_a_dian)
        setModal({
          titulo:   'Reporte Tributario DIAN',
          columnas: ['Producto','Tipo','Precio venta','Stock actual'],
          filas:    dian.map(p => [
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
        })
      },
    },
  ]

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
            onClick={() => exportarExcel(`Movimientos_${mes}`, movimientos.map(m => ({
              Fecha: m.fecha, Tipo: m.tipo, Categoría: m.categoria,
              Concepto: m.concepto, Monto: m.monto,
            })))}
            className="text-xs px-3 py-1.5 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors flex items-center gap-1.5">
            <FileSpreadsheet size={12}/> Excel
          </button>
          <button
            onClick={() => imprimirReporte(
              `Movimientos ${mes}`,
              [
                ['Ingresos', fmt(movResumen?.ingresos ?? 0)],
                ['Egresos',  fmt(movResumen?.egresos  ?? 0)],
                ['Utilidad', fmt(movResumen?.utilidad ?? 0)],
                ['', ''],
                ...movimientos.map(m => [m.fecha + ' ' + m.concepto, fmt(m.monto)]),
              ],
              ['Concepto', 'Monto'],
            )}
            className="text-xs px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-1.5">
            <Printer size={12}/> PDF / Imprimir
          </button>
        </div>
      </div>

      {/* KPIs rápidos mes actual */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Ingresos mes', value: movResumen?.ingresos??0, color:'text-green-400', icon: TrendingUp },
          { label:'Egresos mes',  value: movResumen?.egresos??0,  color:'text-red-400',   icon: TrendingDown },
          { label:'Utilidad',     value: movResumen?.utilidad??0, color: (movResumen?.utilidad??0)>=0?'text-brand-teal':'text-red-400', icon: PieChart },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-brand-navy rounded-xl border border-white/5 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className={color}/>
              <p className="text-[10px] text-gray-500">{label}</p>
            </div>
            <p className={`text-sm font-bold ${color} tabular-nums`}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Grid de reportes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORTES.map(r => (
          <ReporteCard key={r.label} label={r.label} sub={r.sub} icon={r.icon} color={r.color} onPreview={r.abrir}/>
        ))}
      </div>

      {/* Modal ventas día — transacciones individuales */}
      {showVentasDia && (
        <ModalVentasDia ventas={ventasDia} onClose={() => setShowVentasDia(false)} />
      )}

      {/* Modal previa genérico */}
      {modal && (
        <PreviewModal
          titulo={modal.titulo}
          columnas={modal.columnas}
          filas={modal.filas}
          datos={modal.datos}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// Alias para BarChart3 (lucide no exporta BarChart3Icon)
function BarChart3Icon(props: { size?: number; style?: React.CSSProperties; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={props.size??18} height={props.size??18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} style={props.style}><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
}
