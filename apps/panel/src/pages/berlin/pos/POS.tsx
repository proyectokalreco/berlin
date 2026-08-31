import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { Producto, Categoria } from '../../../types'
import toast from 'react-hot-toast'
import {
  Search, X, Minus, Plus, Trash2, Printer, CheckCircle,
  ShoppingCart, Grid3X3, Delete, ChevronLeft, ChevronRight,
  Keyboard, Lock, Banknote, Zap, Smartphone, CreditCard, Users,
  Phone, Wifi, WifiOff, RefreshCw,
} from 'lucide-react'
import { useOfflineQueue } from './useOfflineQueue'
import type { QueuedSale } from './useOfflineQueue'
import { useProductosConSnapshot } from './useProductosConSnapshot'
import { cn } from '../../../lib/utils'
import { useAuthStore } from '../../../store/authStore'
import { useNavigate } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────
interface CartItem {
  producto:     Producto
  cantidad:     number
  itemKey:      string   // producto.id para normales; uuid para venta libre
  precioLibre?: number   // precio personalizado (solo venta libre)
  nombreLibre?: string   // descripción personalizada (solo venta libre)
}

// Una venta en pausa — el carrito completo de un cliente que se dejó a un lado
// para atender a otro sin perder nada. Mismo patrón que Esquina del Crédito.
// Persiste en localStorage con key propia (br_) — nunca compartir key entre negocios.
interface VentaEnPausa {
  id:              string
  numero:          number
  cart:            CartItem[]
  efectivo:        string
  metodoPago:      'efectivo' | 'exacto' | 'transferencia' | 'credito'
  clienteCredito:  { id: string; nombre: string; telefono?: string } | null
  buscandoCliente: string
  idempotencyKey:  string
  creadaEn:        number
}
const STORAGE_KEY_VENTAS = 'br_pos_ventas_pausa'
const ventaVacia = (id: string, numero: number): VentaEnPausa => ({
  id, numero, cart: [], efectivo: '', metodoPago: 'efectivo',
  clienteCredito: null, buscandoCliente: '',
  idempotencyKey: crypto.randomUUID(), creadaEn: Date.now(),
})

// Precio/nombre efectivos para cualquier item
const precioEfectivo = (i: CartItem) => i.precioLibre ?? i.producto.precio_venta
const nombreEfectivo = (i: CartItem) => i.nombreLibre ?? i.producto.nombre

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n)

const prodCode = (idx: number) => `#${String(idx + 1).padStart(3, '0')}`

/**
 * Redondea al múltiplo de $50 más cercano.
 * En Colombia la moneda mínima en circulación es $50, por lo que
 * el total a cobrar debe ser siempre múltiplo de $50.
 *   16.645 → 16.650  (+5,  residuo 45 ≥ 25 → sube)
 *   16.620 → 16.600  (-20, residuo 20 < 25  → baja)
 *   16.600 → 16.600  (0,   ya es múltiplo)
 */
function roundToCOP50(n: number): number {
  return Math.round(n / 50) * 50
}

const DENOMINACIONES = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000]

// ── Detección de emoji vs URL ─────────────────────────────────
function isEmojiIcon(s?: string | null): boolean {
  if (!s) return false
  return !s.startsWith('http') && !s.startsWith('/') && s.length <= 8
}

// ── Auto-emoji por nombre y categoría ────────────────────────
function getAutoEmoji(nombre: string, catNombre?: string): string {
  const n = nombre.toLowerCase()
  const c = (catNombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  if (n.includes('coca') || n.includes('cocacola'))                       return '🥤'
  if (n.includes('agua') && n.includes('sab'))                            return '🧃'
  if (n.includes('agua gas') || n.includes('brisa'))                      return '🫧'
  if (n.includes('agua cristal') || n.includes('agua mini') ||
      n.includes('agua med')    || n.includes('agua lit'))                return '💧'
  if (n.includes('gaseosa') || n.includes('postobon') || n.includes('savile')) return '🫧'
  if (n.includes('fuzetea') || n.includes('fuze'))                        return '🍵'
  if (n.includes('del valle'))                                             return '🍊'
  if (n.includes('gatorade'))                                              return '🥤'
  if (n.includes('vive 100') || n.includes('amp') || n.includes('bretana')) return '⚡'
  if (n.includes('hit'))                                                   return '🍊'
  if (n.includes('malta'))                                                 return '🍺'
  if (n.includes('yogurt'))                                                return '🥛'
  if (n.includes('avena'))                                                 return '🥛'
  if (n.includes('cafe') || n.includes('café') || n.includes('nescafe'))  return '☕'
  if (n.includes('cheesecake'))                                            return '🍰'
  if (n.includes('torta') && n.includes('carne'))                         return '🥩'
  if (n.includes('torta') && n.includes('pescado'))                       return '🐟'
  if (n.includes('torta') || n.includes('ponque'))                        return '🎂'
  if (n.includes('fresas'))                                                return '🍓'
  if (n.includes('gelatina') || n.includes('leche asada') ||
      n.includes('postre'))                                                return '🍮'
  if (n.includes('nido de fruta'))                                         return '🍓'
  if (n.includes('brownie'))                                               return '🍫'
  if (n.includes('croissant'))                                             return '🥐'
  if (n.includes('churo'))                                                 return '🍩'
  if (n.includes('alfajor'))                                               return '🍪'
  if (n.includes('almojabana') || n.includes('buñuelo') ||
      n.includes('bunuelo')    || n.includes('gratinado'))                return '🧆'
  if (n.includes('palito de queso') || n.includes('pan de queso') ||
      n.includes('pan de bono'))                                           return '🧀'
  if (n.includes('pan pizza'))                                             return '🍕'
  if (n.includes('rollo'))                                                 return '🥐'
  if (n.includes('pastel'))                                                return '🥐'
  if (n.startsWith('pan ') || n === 'pan')                                return '🍞'
  if (n.includes('arepa'))                                                 return '🫓'
  if (n.includes('empanada'))                                              return '🥟'
  if (n.includes('chorizo'))                                               return '🌭'
  if (c.includes('gaseosa'))                                               return '🫧'
  if (c.includes('bebida') || c.includes('snack'))                        return '🧃'
  if (c.includes('postre'))                                                return '🍮'
  if (c.includes('torta') || c.includes('ponque'))                        return '🎂'
  if (c.includes('frito'))                                                 return '🥟'
  if (c.includes('panaderia'))                                             return '🍞'
  return '🥖'
}

// ── Ícono miniatura para carrito ──────────────────────────────
function MiniIcon({ producto, catNombre }: { producto: Producto; catNombre?: string }) {
  const imgUrl = producto.imagen_url
  const isImg  = !!imgUrl && !isEmojiIcon(imgUrl)
  const emoji  = isEmojiIcon(imgUrl) ? imgUrl! : getAutoEmoji(producto.nombre, catNombre)
  if (isImg) return (
    <img src={imgUrl!} alt="" className="w-11 h-11 rounded-lg object-cover bg-brand-dark flex-shrink-0" />
  )
  return (
    <div className="w-11 h-11 rounded-lg bg-[#1A2F4A] flex items-center justify-center text-2xl flex-shrink-0">
      {emoji}
    </div>
  )
}

// ── Ticket térmico 80mm (Epson TM-T20 / TM-T88) ──────────────
function imprimirTicket(venta: {
  numero_venta: string
  items:        CartItem[]
  subTotal:     number   // suma real de ítems (antes del redondeo)
  total:        number   // total redondeado al múltiplo de $50
  redondeo:     number   // ajuste: positivo = favor negocio, negativo = favor cliente
  efectivo:     number
  cambio:       number
  cajero?:      string
  metodoPago?:  string   // 'efectivo' | 'transferencia' | 'credito'
  clienteNombre?: string
}) {
  const fecha = new Date().toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const ivaTotal = venta.items.reduce((s, i) => {
    const pi = i.producto.porcentaje_iva ?? 0
    return pi > 0 ? s + (precioEfectivo(i) * i.cantidad * pi / (100 + pi)) : s
  }, 0)

  // URL absoluta para que la imagen cargue en la ventana popup de impresión
  const origin = window.location.origin

  // Filas de ítems — el precio tiene flex-shrink:0 para no recortarse
  const itemsHtml = venta.items.map(i => `
<p class="item-nm">${nombreEfectivo(i)}</p>
<div class="row">
  <span class="item-sub">&nbsp;&nbsp;${i.cantidad} x ${fmt(precioEfectivo(i))}</span>
  <span class="amt">${fmt(precioEfectivo(i) * i.cantidad)}</span>
</div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Tiquete ${venta.numero_venta}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  /* 80mm papel — 5mm cada lado → área útil 70mm */
  @page { margin:5mm; size:80mm auto }
  body {
    font-family:Arial,sans-serif;
    font-weight:600;
    font-size:14px;
    width:100%;
    color:#000;
    -webkit-print-color-adjust:exact;
  }
  .c        { text-align:center }
  .b        { font-weight:bold }
  /* separadores */
  .sep  { border-top:1px dashed #000; margin:5px 0 }
  .sep2 { border-top:2px solid  #000; margin:5px 0 }
  /* fila flex para descripción / precio — precio nunca se recorta */
  .row  { display:flex; justify-content:space-between; align-items:baseline;
          gap:6px; margin:2px 0 }
  /* columna izquierda puede encogerse */
  .row > span:first-child { flex:1; min-width:0; overflow-wrap:break-word }
  /* precio: nunca se encoge ni se parte */
  .amt  { flex-shrink:0; text-align:right; white-space:nowrap;
          font-weight:700; min-width:58px }
  /* ítems */
  .item-nm  { font-weight:700; font-size:14px; margin-top:5px; word-break:break-word }
  .item-sub { font-size:13px; color:#000 }
  /* logo */
  .logo-img { display:block; margin:4px auto; max-width:60mm; height:auto;
              max-height:28mm; object-fit:contain }
  /* negocio */
  .biz-sub  { font-size:13px; letter-spacing:1px; margin-top:3px; font-weight:bold }
  /* encabezados */
  h3  { font-size:14px; font-weight:bold }
  .sm { font-size:13px; color:#000 }
  /* total grande */
  .total-row { display:flex; justify-content:space-between; align-items:baseline;
               border-top:2px solid #000; margin-top:5px; padding-top:5px; gap:6px }
  .total-lbl { font-size:16px; font-weight:900 }
  .total-val { font-size:20px; font-weight:900; white-space:nowrap }
</style>
</head>
<body>

<!-- Logo + cabecera negocio -->
<div class="c" style="padding:4px 0 2px">
  <img class="logo-img" src="${origin}/logos/berlin.png" alt="Berlín Café Bar" />
  <p class="biz-sub">*Café Bar Berlín*</p>
</div>

<!-- Datos negocio -->
<div class="c" style="margin-bottom:4px">
  <p class="sm">NIT: 1035424712-4</p>
  <p class="sm">Direccion: Calle 28 #30-19 - Don Matias, Antioquia</p>
  <p class="sm">Tel: 3215994825</p>
</div>

<div class="sep2"></div>
<div class="c">
  <h3>TIQUETE DE CAJA POS</h3>
  <p>No. <strong>${venta.numero_venta}</strong></p>
  <p class="sm">${fecha}</p>
  ${venta.cajero ? `<p class="sm">Atendido por: <b>${venta.cajero}</b></p>` : ''}
</div>
<div class="sep2"></div>

<!-- Columnas items -->
<div class="row b sm"><span>DESCRIPCION</span><span class="amt">TOTAL</span></div>
<div class="sep"></div>
${itemsHtml}
<div class="sep"></div>

<!-- Totales -->
<div class="row"><span>Sub Total:</span><span class="amt">${fmt(venta.subTotal)}</span></div>
<div class="row"><span>Descuentos:</span><span class="amt">$ 0</span></div>
${venta.redondeo !== 0
  ? `<div class="row sm" style="color:#000"><span>Redondeo COP:</span><span class="amt">${venta.redondeo > 0 ? '+' : '-'}${fmt(Math.abs(venta.redondeo))}</span></div>`
  : ''}
${ivaTotal > 0
  ? `<div class="row sm"><span>IVA incluido (${Math.round(ivaTotal / venta.subTotal * 100)}%):</span><span class="amt">${fmt(ivaTotal)}</span></div>`
  : `<div class="row sm"><span>IVA: No Responsable</span><span class="amt">$ 0</span></div>`
}
<div class="total-row">
  <span class="total-lbl">TOTAL:</span>
  <span class="total-val">${fmt(venta.total)}</span>
</div>

<div class="sep"></div>
${venta.metodoPago === 'transferencia' ? `
<div class="row b"><span>Metodo de pago:</span><span>Transferencia</span></div>
<div class="row sm"><span>Efectivo recibido:</span><span>N/A</span></div>
` : venta.metodoPago === 'credito' ? `
<div class="row b" style="color:#c00"><span>*** VENTA A CREDITO ***</span></div>
<div class="row"><span>Cliente:</span><span><b>${venta.clienteNombre ?? 'Sin nombre'}</b></span></div>
<div class="row sm"><span>Metodo de pago:</span><span>Credito</span></div>
` : `
<div class="row"><span>Efectivo recibido:</span><span class="amt">${fmt(venta.efectivo)}</span></div>
<div class="row b"><span>Cambio entregado:</span><span class="amt">${fmt(venta.cambio)}</span></div>
<div class="row sm"><span>Metodo de pago:</span><span>Efectivo</span></div>
`}

<div class="sep"></div>
<div class="c sm">
  <p>Regimen Simple de Tributacion</p>
  <p>No somos responsables del IVA</p>
  <p>Conserve este tiquete como soporte de pago</p>
</div>

<div class="sep"></div>
<div class="c">
  <p class="b" style="font-size:13px">Gracias por su compra!</p>
  <p>Vuelva pronto</p>
  <p class="sm" style="margin-top:6px">Sistema Kalreco v1.0 | app.mymulticentro.com</p>
</div>

</body>
</html>`

  const win = window.open('', '_blank', 'width=440,height=760')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); setTimeout(() => win.close(), 800) }, 400)
  }
}

// ── Tarjeta de producto (touch) ───────────────────────────────
function ProductCard({
  producto, code, enCart, cantidadEnCart, catNombre, onClick,
}: {
  producto:       Producto
  code:           string
  enCart:         boolean
  cantidadEnCart: number
  catNombre?:     string
  onClick:        () => void
}) {
  const agotado = (producto.origen === 'receta' || producto.categoria?.sin_stock_control)
    ? false
    : producto.stock_actual <= 0
  const imgUrl  = producto.imagen_url
  const showImg = !!imgUrl && !isEmojiIcon(imgUrl)
  const emoji   = isEmojiIcon(imgUrl) ? imgUrl! : getAutoEmoji(producto.nombre, catNombre)

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col bg-brand-navy rounded-xl border p-3 text-left select-none',
        'transition-transform duration-100 active:scale-[0.94]',
        agotado
          ? 'border-white/5 opacity-50 cursor-not-allowed'
          : enCart
          ? 'border-[#EA580C]/60 bg-[#EA580C]/5 shadow-[0_0_14px_rgba(234,88,12,0.18)]'
          : 'border-white/5 hover:border-white/20',
      )}
      disabled={agotado}
    >
      {enCart && !agotado && (
        <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-[#EA580C]
                        flex items-center justify-center text-white text-xs font-bold shadow-md">
          {cantidadEnCart}
        </div>
      )}
      {agotado && (
        <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 bg-gray-700/90
                        text-gray-300 text-[10px] font-semibold rounded-md">
          Agotado
        </div>
      )}

      {showImg ? (
        <img src={imgUrl!} alt={producto.nombre}
             className="w-full aspect-square object-cover rounded-lg mb-2 bg-brand-dark" />
      ) : (
        <div className={cn(
          'w-full aspect-square rounded-lg mb-2 flex items-center justify-center text-4xl',
          enCart ? 'bg-[#EA580C]/10' : 'bg-[#1A2F4A]',
        )}>
          {emoji}
        </div>
      )}

      <p className="text-[10px] text-gray-600 font-mono leading-none">{code}</p>
      <p className="text-sm font-semibold text-white leading-snug mt-0.5 line-clamp-2">
        {producto.nombre}
      </p>
      <p className="text-[#EA580C] font-bold text-base mt-1.5 leading-none">
        {fmt(producto.precio_venta)}
      </p>
      {producto.origen === 'receta' ? (
        <p className="text-brand-teal text-[11px] mt-1">Producción</p>
      ) : (
        <p className={cn('text-[11px] mt-1',
          producto.stock_actual <= 0 ? 'text-red-400' : 'text-gray-600',
        )}>
          {producto.stock_actual.toFixed(0)} disp.
        </p>
      )}
    </button>
  )
}

// ── Teclado numérico táctil (compact) ────────────────────────
function NumPad({
  valor, onChange, total,
}: {
  valor: string; onChange: (v: string) => void; total: number
}) {
  const press = (key: string) => {
    if (key === 'DEL') onChange(valor.slice(0, -1))
    else if (key === 'CLR') onChange('')
    else {
      if (valor === '' && key === '0') return
      onChange(valor + key)
    }
  }

  const teclas = ['7','8','9','4','5','6','1','2','3','CLR','0','DEL']

  return (
    <div className="space-y-1.5">
      {/* Denominaciones rápidas */}
      <div className="grid grid-cols-4 gap-1">
        {DENOMINACIONES.filter(d => d <= Math.max(total * 2, 20_000)).slice(0, 4).map(d => (
          <button key={d} onClick={() => onChange(String(d))}
            className="bg-brand-dark hover:bg-white/8 active:scale-[0.94] border border-white/5
                       rounded-lg py-2 text-[11px] text-gray-400 hover:text-white font-semibold
                       transition-all select-none">
            {d >= 1_000 ? `$${d / 1_000}K` : `$${d}`}
          </button>
        ))}
      </div>
      {/* Grid 3×4 — botones más compactos */}
      <div className="grid grid-cols-3 gap-1">
        {teclas.map(k => (
          <button key={k} onClick={() => press(k)}
            className={cn(
              'h-10 rounded-xl font-bold text-base transition-all select-none active:scale-[0.91] border',
              k === 'DEL'
                ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                : k === 'CLR'
                ? 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 text-sm'
                : 'bg-brand-dark border-white/5 text-white hover:bg-white/8',
            )}
          >
            {k === 'DEL' ? <Delete size={14} className="mx-auto" /> : k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Crear cliente rápido desde el POS ────────────────────────
function CrearClienteRapidoPOS({
  nombreInicial,
  onCreado,
}: {
  nombreInicial: string
  onCreado: (c: { id: string; nombre: string; telefono?: string }) => void
}) {
  const qc = useQueryClient()
  const [nombre,   setNombre]   = useState(nombreInicial)
  const [telefono, setTelefono] = useState('')
  const [open,     setOpen]     = useState(false)

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/clientes', { nombre: nombre.trim(), telefono: telefono.trim() || undefined }),
    onSuccess: (res) => {
      toast.success(`Cliente "${res.data.nombre}" creado ✅`)
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['clientes-picker-pos'] })
      onCreado(res.data)
    },
    onError: () => toast.error('Error al crear cliente'),
  })

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-teal
                   hover:bg-brand-teal/5 rounded-xl transition-colors border border-dashed border-brand-teal/30 mt-1">
        <Plus size={11}/>
        {nombreInicial.trim() ? `Crear "${nombreInicial}" como nuevo cliente` : '+ Crear cliente nuevo'}
      </button>
    )
  }

  return (
    <div className="bg-brand-dark border border-brand-teal/30 rounded-xl p-3 mt-1 space-y-2">
      <p className="text-[10px] text-brand-teal font-semibold">Nuevo cliente</p>
      <input value={nombre} onChange={e => setNombre(e.target.value)}
        placeholder="Nombre *"
        className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                   focus:outline-none focus:border-brand-teal"/>
      <input value={telefono} onChange={e => setTelefono(e.target.value)}
        placeholder="Teléfono (opcional)"
        className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-sm text-white
                   focus:outline-none focus:border-brand-teal"/>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)}
          className="flex-1 py-1.5 rounded-lg border border-white/10 text-gray-400 text-xs">
          Cancelar
        </button>
        <button disabled={!nombre.trim() || isPending} onClick={() => crear()}
          className="flex-1 py-1.5 rounded-lg bg-brand-teal text-brand-dark font-bold text-xs disabled:opacity-40">
          {isPending ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Componente principal POS
// ─────────────────────────────────────────────────────────────
export default function POS() {
  const queryClient = useQueryClient()
  const user        = useAuthStore(s => s.user)
  const navigate    = useNavigate()

  const [cart,           setCart]           = useState<CartItem[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())

  // ── Ventas en pausa (atender varios clientes a la vez sin perder el carrito) ──
  const [ventas,        setVentas]        = useState<VentaEnPausa[]>([])
  const [ventaActivaId, setVentaActivaId] = useState('')
  const contadorVentaRef = useRef(1)
  const hidratado         = useRef(false)

  // ── Venta Libre (producto con precio_venta = 0) ───────────────
  const [ventaLibreModal, setVentaLibreModal] = useState<{
    producto: Producto
    nombre:   string
    precio:   string
    cantidad: string
  } | null>(null)

  // ── Cola offline ──────────────────────────────────────────────
  const handleSaleSync = useCallback((data: unknown) => {
    const venta = data as { numero_venta: string }
    toast.success(`☁️ Venta sincronizada: ${venta.numero_venta}`)
    queryClient.invalidateQueries({ queryKey: ['productos-pos'] })
    queryClient.invalidateQueries({ queryKey: ['ventas-resumen-hoy'] })
  }, [queryClient])

  const { status: netStatus, pendingCount, enqueue, syncNow } = useOfflineQueue(handleSaleSync)
  const [busqueda,       setBusqueda]       = useState('')
  const [catActiva,      setCatActiva]      = useState<string | null>(null)
  const [efectivo,       setEfectivo]       = useState('')
  const [ventaOk,        setVentaOk]        = useState<{
    numero_venta: string; total: number
    metodo: 'efectivo' | 'exacto' | 'transferencia' | 'credito'
    clienteNombre?: string; efectivoPagado: number; cambioEntregado: number
  } | null>(null)
  const [metodoPago,     setMetodoPago]     = useState<'efectivo' | 'exacto' | 'transferencia' | 'credito'>('efectivo')
  const [clienteCredito, setClienteCredito] = useState<{ id: string; nombre: string; telefono?: string } | null>(null)
  const [buscandoCliente,setBuscandoCliente]= useState('')
  const searchRef                           = useRef<HTMLInputElement>(null)
  const catScrollRef                        = useRef<HTMLDivElement>(null)

  // ── Detección móvil para layout adaptable ──
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  )
  const [posView, setPosView] = useState<'catalogo' | 'carrito'>('catalogo')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Al agregar el primer ítem en móvil, mantener en catálogo (usuario agrega más)
  // Al pulsar Cobrar se cambia a 'carrito' automáticamente via setShowNumPad

  // ── Panel derecho redimensionable ──
  const PANEL_MIN = 240
  const PANEL_MAX = 520
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('pos-panel-width')
    const n = saved ? parseInt(saved, 10) : 320
    return isNaN(n) ? 320 : Math.min(Math.max(n, PANEL_MIN), PANEL_MAX)
  })
  const isDragging  = useRef(false)
  const dragStartX  = useRef(0)
  const dragStartW  = useRef(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartX.current - e.clientX   // arrastrar ← agranda
      const next  = Math.min(Math.max(dragStartW.current + delta, PANEL_MIN), PANEL_MAX)
      setPanelWidth(next)
    }
    const onUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPanelWidth(w => { localStorage.setItem('pos-panel-width', String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // ── Ventas en pausa — hidratar, sincronizar y persistir ──────
  // Mismo patrón que Esquina del Crédito: el carrito/pago/cliente activos
  // siguen viviendo en estado plano (cart, metodoPago, etc. — no se tocan
  // los ~30 sitios que ya los usan); un efecto los sincroniza dentro del
  // array `ventas` en cada cambio, y al cambiar de tab se cargan de vuelta.
  const cargarLive = (v: VentaEnPausa) => {
    setCart(v.cart); setEfectivo(v.efectivo); setMetodoPago(v.metodoPago)
    setClienteCredito(v.clienteCredito); setBuscandoCliente(v.buscandoCliente)
    setIdempotencyKey(v.idempotencyKey)
  }

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY_VENTAS)
    if (raw) {
      try {
        const saved = JSON.parse(raw)
        if (saved?.ventas?.length) {
          setVentas(saved.ventas)
          contadorVentaRef.current = Math.max(...saved.ventas.map((v: VentaEnPausa) => v.numero), 0) + 1
          const activa = saved.ventas.find((v: VentaEnPausa) => v.id === saved.ventaActivaId) || saved.ventas[0]
          setVentaActivaId(activa.id)
          cargarLive(activa)
          hidratado.current = true
          return
        }
      } catch { /* localStorage corrupto — arrancar limpio */ }
    }
    const id = crypto.randomUUID()
    setVentas([ventaVacia(id, 1)])
    setVentaActivaId(id)
    contadorVentaRef.current = 2
    hidratado.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hidratado.current || !ventaActivaId) return
    setVentas(prev => prev.map(v => v.id === ventaActivaId
      ? { ...v, cart, efectivo, metodoPago, clienteCredito, buscandoCliente, idempotencyKey }
      : v))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, efectivo, metodoPago, clienteCredito, buscandoCliente, idempotencyKey])

  useEffect(() => {
    if (!hidratado.current) return
    localStorage.setItem(STORAGE_KEY_VENTAS, JSON.stringify({ ventas, ventaActivaId }))
  }, [ventas, ventaActivaId])

  const cambiarVenta = (id: string) => {
    if (id === ventaActivaId) return
    const v = ventas.find(x => x.id === id)
    if (!v) return
    setVentaOk(null)
    setVentaActivaId(id)
    cargarLive(v)
  }

  const nuevaVenta = () => {
    const id = crypto.randomUUID()
    const numero = contadorVentaRef.current++
    const nueva = ventaVacia(id, numero)
    setVentas(prev => [...prev, nueva])
    setVentaActivaId(id)
    setVentaOk(null)
    cargarLive(nueva)
  }

  const descartarVenta = (id: string) => {
    if (!confirm('¿Descartar esta venta? Se perderá el carrito completo.')) return
    const restantes = ventas.filter(v => v.id !== id)
    if (id !== ventaActivaId) { setVentas(restantes); return }
    if (restantes.length > 0) {
      setVentas(restantes)
      setVentaActivaId(restantes[0].id)
      cargarLive(restantes[0])
    } else {
      const nuevoId = crypto.randomUUID()
      const nueva   = ventaVacia(nuevoId, contadorVentaRef.current++)
      setVentas([nueva])
      setVentaActivaId(nuevoId)
      cargarLive(nueva)
    }
  }

  // ── Verificar turno de caja activo ──
  const { data: turnoActivo, isLoading: isLoadingCaja } = useQuery<{ id: string } | null>({
    queryKey: ['turno-activo-pos'],
    queryFn:  () => api.get('/berlin/caja/turno-activo').then(r => r.data ?? null),
    refetchInterval: 30_000,
    retry: false,
  })

  // ── Datos (con snapshot offline) ──
  const { productos, categorias, isLoading } = useProductosConSnapshot()

  // ── Clientes para el selector de crédito ──
  const { data: clientesLista = [] } = useQuery<{ id: string; nombre: string; telefono?: string }[]>({
    queryKey: ['clientes-picker-pos', buscandoCliente],
    queryFn:  () => api.get('/berlin/clientes', {
      params: buscandoCliente ? { q: buscandoCliente } : {},
    }).then(r => r.data),
    enabled:   metodoPago === 'credito',
    staleTime: 60_000,
  })

  const catNameMap = useMemo(
    () => new Map(categorias.map(c => [c.id, c.nombre])),
    [categorias],
  )

  const codigoMap = useMemo(() => {
    const m: Record<string, string> = {}
    productos.forEach((p, i) => { m[p.id] = prodCode(i) })
    return m
  }, [productos])

  const filtrados = useMemo(() => {
    let list = productos
    if (catActiva) list = list.filter(p => p.categoria_id === catActiva)
    if (busqueda.trim())
      list = list.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (codigoMap[p.id] ?? '').includes(busqueda)
      )
    return list
  }, [productos, catActiva, busqueda, codigoMap])

  // ── Carrito ──
  const addItem = (p: Producto) => {
    if (p.precio_venta === 1 && p.nombre.toLowerCase().includes('venta libre')) {
      // Venta libre: pedir nombre/precio/cantidad antes de agregar
      setVentaLibreModal({ producto: p, nombre: p.nombre, precio: '', cantidad: '1' })
      return
    }
    setCart(prev => {
      const idx = prev.findIndex(i => i.itemKey === p.id)
      if (idx !== -1) {
        const upd = [...prev]; upd[idx] = { ...upd[idx], cantidad: upd[idx].cantidad + 1 }
        return upd
      }
      return [...prev, { producto: p, cantidad: 1, itemKey: p.id }]
    })
  }

  const confirmarVentaLibre = () => {
    if (!ventaLibreModal) return
    const precio = parseFloat(ventaLibreModal.precio.replace(/\./g, '').replace(',', '.'))
    const cantidad = parseInt(ventaLibreModal.cantidad) || 1
    if (!precio || precio <= 0) { toast.error('Ingresa un precio válido'); return }
    const itemKey = crypto.randomUUID()
    setCart(prev => [...prev, {
      producto:     ventaLibreModal.producto,
      cantidad,
      itemKey,
      precioLibre:  precio,
      nombreLibre:  ventaLibreModal.nombre.trim() || ventaLibreModal.producto.nombre,
    }])
    setVentaLibreModal(null)
  }

  const changeQty = (key: string, delta: number) =>
    setCart(prev =>
      prev.flatMap(item => {
        if (item.itemKey !== key) return [item]
        const next = item.cantidad + delta
        return next <= 0 ? [] : [{ ...item, cantidad: next }]
      })
    )

  const removeItem = (key: string) =>
    setCart(prev => {
      const next = prev.filter(i => i.itemKey !== key)
      if (next.length === 0) setEfectivo('')
      return next
    })

  const clearCart = () => {
    setCart([]); setEfectivo(''); setVentaOk(null)
    setMetodoPago('efectivo'); setClienteCredito(null); setBuscandoCliente('')
    setIdempotencyKey(crypto.randomUUID())
    if (isMobile) setPosView('catalogo')
  }

  const cambiarMetodo = (m: typeof metodoPago) => {
    setMetodoPago(m)
    setEfectivo('')
    if (m !== 'credito') { setClienteCredito(null); setBuscandoCliente('') }
  }

  // ── Cálculos ──
  const subTotal    = cart.reduce((s, i) => s + precioEfectivo(i) * i.cantidad, 0)
  const totalItems  = cart.reduce((s, i) => s + i.cantidad, 0)
  const total       = roundToCOP50(subTotal)      // redondeado al múltiplo de $50 más cercano
  const redondeo    = total - subTotal            // positivo → sube, negativo → baja, 0 → exacto
  const efectivoNum = parseFloat(efectivo) || 0
  const cambio      = Math.max(0, efectivoNum - total)
  const canCobrar   = cart.length > 0 && (
    (metodoPago === 'efectivo'     && efectivoNum >= total) ||
    (metodoPago === 'exacto'       ) ||
    (metodoPago === 'transferencia') ||
    (metodoPago === 'credito'      && clienteCredito !== null)
  )

  // ── Venta ──
  const { mutate: cobrar, isPending } = useMutation({
    mutationFn: () => {
      const metodoReal = metodoPago === 'exacto' ? 'efectivo' : metodoPago
      return api.post('/berlin/ventas', {
        items: cart.map(i => ({
          producto_id:     i.producto.id,
          cantidad:        i.cantidad,
          precio_unitario: precioEfectivo(i),
        })),
        metodo_pago:      metodoReal,
        cliente_id:       metodoPago === 'credito' ? clienteCredito?.id : undefined,
        redondeo,
        idempotency_key:  idempotencyKey,
      })
    },
    onSuccess: (res) => {
      const venta           = res.data
      const metodoPagoReal  = metodoPago === 'exacto' ? 'efectivo' : metodoPago
      const efectivoPagado  = metodoPago === 'exacto' ? total : metodoPago === 'efectivo' ? efectivoNum : 0
      const cambioEntregado = metodoPago === 'efectivo' ? cambio : 0

      setVentaOk({
        numero_venta: venta.numero_venta, total,
        metodo: metodoPago, clienteNombre: clienteCredito?.nombre,
        efectivoPagado, cambioEntregado,
      })
      imprimirTicket({
        numero_venta: venta.numero_venta,
        items:        cart,
        subTotal,
        total,
        redondeo,
        efectivo:     efectivoPagado,
        cambio:       cambioEntregado,
        cajero:       user?.nombre,
        metodoPago:   metodoPagoReal,
        clienteNombre: clienteCredito?.nombre,
      })
      toast.success(`✅ Venta ${venta.numero_venta} procesada`)
      setIdempotencyKey(crypto.randomUUID())
      queryClient.invalidateQueries({ queryKey: ['productos-pos'] })
      queryClient.invalidateQueries({ queryKey: ['ventas-resumen-hoy'] })
      if (metodoPago === 'credito') {
        queryClient.invalidateQueries({ queryKey: ['clientes'] })
      }
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message?: string; response?: { data?: { error?: string } } }
      const isNetErr = !e.response && (
        e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' ||
        e.message === 'Network Error' || e.message?.includes('timeout')
      )
      if (isNetErr) {
        const metodoReal = metodoPago === 'exacto' ? 'efectivo' : metodoPago
        const sale: QueuedSale = {
          idempotency_key: idempotencyKey,
          payload: {
            items: cart.map(i => ({
              producto_id: i.producto.id,
              cantidad: i.cantidad,
              precio_unitario: precioEfectivo(i),
            })),
            metodo_pago: metodoReal,
            cliente_id: metodoPago === 'credito' ? clienteCredito?.id : undefined,
            redondeo,
            idempotency_key: idempotencyKey,
          },
          queued_at: Date.now(),
        }
        enqueue(sale)
        toast('📶 Sin conexión — la venta quedó en cola y se enviará automáticamente', {
          icon: '⏳', duration: 5000,
        })
        // Limpiar carrito y generar nuevo key para la próxima venta
        clearCart()
      } else {
        toast.error(e.response?.data?.error || 'Error al procesar la venta')
      }
    },
  })

  // ── Atajos de teclado ─────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      // No interceptar cuando el usuario está escribiendo en un input/search
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = e.key

      // Números 0-9 → alimentar el numpad si el método activo es efectivo
      if (/^[0-9]$/.test(key) && cart.length > 0 && metodoPago === 'efectivo') {
        e.preventDefault()
        if (key !== '0' || efectivo !== '') setEfectivo(v => v + key)
        return
      }
      // Backspace → borrar último dígito del numpad
      if (key === 'Backspace' && cart.length > 0 && metodoPago === 'efectivo') {
        e.preventDefault()
        setEfectivo(v => v.slice(0, -1))
        return
      }
      // Delete / Supr → limpiar numpad
      if (key === 'Delete' && cart.length > 0 && metodoPago === 'efectivo') {
        e.preventDefault()
        setEfectivo('')
        return
      }
      // Enter → cobrar
      if (key === 'Enter' && canCobrar && !isPending) {
        e.preventDefault()
        cobrar()
        return
      }
      // F2 → enfocar búsqueda
      if (key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      // Escape → limpiar búsqueda / limpiar monto de efectivo
      if (key === 'Escape') {
        if (busqueda) { setBusqueda(''); return }
        if (efectivo) setEfectivo('')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [cart, efectivo, canCobrar, isPending, busqueda, cobrar, metodoPago])

  // ── Scroll de categorías ──────────────────────────────────────
  const scrollCats = (dir: 'left' | 'right') => {
    catScrollRef.current?.scrollBy({ left: dir === 'right' ? 200 : -200, behavior: 'smooth' })
  }

  // ── Render ────────────────────────────────────────────────────

  const numeroVentaActiva = ventas.find(v => v.id === ventaActivaId)?.numero ?? 1

  const puedeBypassCaja = user?.rol === 'super_admin' || user?.rol === 'admin_berlin'

  // Bloquear POS si no hay turno de caja abierto (bypass para super_admin y admin_berlin)
  if (!isLoadingCaja && !turnoActivo && !puedeBypassCaja) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Lock size={36} className="text-red-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">POS Bloqueado</h2>
          <p className="text-gray-400 max-w-sm">
            No puedes realizar ventas sin una apertura de caja activa.
            Ve al módulo de <strong className="text-white">Caja</strong> y abre el turno antes de comenzar.
          </p>
        </div>
        <button
          onClick={() => navigate('/caja')}
          className="flex items-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold
                     px-6 py-3 rounded-xl transition-colors active:scale-[0.97] select-none
                     shadow-[0_4px_20px_rgba(234,88,12,0.3)]"
        >
          <Banknote size={18} />
          Ir a apertura de caja
        </button>
        <p className="text-xs text-gray-600">
          El POS se habilitará automáticamente una vez que abras el turno.
        </p>
      </div>
    )
  }

  return (
    <>
    {/* ── Ventas en pausa — atender varios clientes sin perder el carrito ── */}
    <div className="flex items-center gap-1.5 px-3 py-2 bg-brand-navy border-b border-white/5 overflow-x-auto flex-shrink-0"
         style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {ventas.map((v, idx) => {
        const activa = v.id === ventaActivaId
        const items  = v.cart.reduce((s, i) => s + i.cantidad, 0)
        return (
          <button key={v.id} onClick={() => cambiarVenta(v.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap select-none transition-colors flex-shrink-0',
              activa
                ? 'bg-[#EA580C] text-white'
                : 'bg-brand-dark text-gray-400 hover:text-white hover:bg-white/5 border border-white/5',
            )}>
            <Users size={12} />
            <span className="max-w-[110px] truncate">Venta {v.numero}</span>
            {items > 0 && (
              <span className={cn('text-[10px] px-1.5 rounded-full',
                activa ? 'bg-white/20' : 'bg-white/5')}>{items}</span>
            )}
            {ventas.length > 1 && (
              <span onClick={e => { e.stopPropagation(); descartarVenta(v.id) }}
                className="hover:text-red-300 -mr-1 ml-0.5">
                <X size={11} />
              </span>
            )}
          </button>
        )
      })}
      <button onClick={nuevaVenta}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap
                   bg-brand-dark text-gray-400 hover:text-[#EA580C] hover:bg-white/5 border border-dashed
                   border-white/10 hover:border-[#EA580C]/40 flex-shrink-0 select-none transition-colors"
        title="Atender otro cliente sin perder esta venta">
        <Plus size={12} /> Nueva venta
      </button>
    </div>

    {/* ── Tab bar móvil ── */}
    {isMobile && (
      <div className="flex border-b border-white/10 bg-brand-navy flex-shrink-0">
        <button
          onClick={() => setPosView('catalogo')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
            posView === 'catalogo'
              ? 'text-[#EA580C] border-b-2 border-[#EA580C]'
              : 'text-gray-500 hover:text-white',
          )}
        >
          <Grid3X3 size={15} />
          Catálogo
        </button>
        <button
          onClick={() => setPosView('carrito')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors relative',
            posView === 'carrito'
              ? 'text-[#EA580C] border-b-2 border-[#EA580C]'
              : 'text-gray-500 hover:text-white',
          )}
        >
          <ShoppingCart size={15} />
          Carrito
          {cart.length > 0 && (
            <span className="absolute top-2 right-[calc(50%-28px)] w-4 h-4 rounded-full bg-[#EA580C] text-white text-[10px] font-bold flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>
    )}

    <div className={cn(
      'gap-0 rounded-xl overflow-hidden border border-white/5',
      isMobile
        ? 'flex flex-col flex-1 overflow-hidden'
        : 'flex h-[calc(100vh-160px)] min-h-[600px]',
    )}>

      {/* ═══════════════════════════════════════
          PANEL IZQUIERDO — Catálogo
      ═══════════════════════════════════════ */}
      <div
        className={cn(
          'flex flex-col min-w-0 bg-brand-dark',
          isMobile ? (posView === 'catalogo' ? 'flex-1 overflow-hidden' : 'hidden') : 'flex-1',
        )}
        style={!isMobile ? { minWidth: 0 } : undefined}
      >

        {/* ── Indicador de red ── */}
        {(netStatus !== 'online' || pendingCount > 0) && (
          <div className={cn(
            'flex items-center justify-between gap-2 px-4 py-2 text-xs font-medium',
            netStatus === 'offline'  && 'bg-red-500/15 border-b border-red-500/30 text-red-300',
            netStatus === 'syncing'  && 'bg-blue-500/15 border-b border-blue-500/30 text-blue-300',
            netStatus === 'online' && pendingCount > 0 && 'bg-amber-500/15 border-b border-amber-500/30 text-amber-300',
          )}>
            <div className="flex items-center gap-2">
              {netStatus === 'offline' && <WifiOff size={13} />}
              {netStatus === 'syncing' && <RefreshCw size={13} className="animate-spin" />}
              {netStatus === 'online' && pendingCount > 0 && <RefreshCw size={13} />}
              <span>
                {netStatus === 'offline'  && `Sin conexión${pendingCount > 0 ? ` · ${pendingCount} venta${pendingCount > 1 ? 's' : ''} en cola` : ''}`}
                {netStatus === 'syncing'  && `Sincronizando ${pendingCount} venta${pendingCount > 1 ? 's' : ''}…`}
                {netStatus === 'online' && pendingCount > 0 && `${pendingCount} venta${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''} de sincronizar`}
              </span>
            </div>
            {netStatus === 'online' && pendingCount > 0 && (
              <button onClick={syncNow}
                className="underline underline-offset-2 hover:text-amber-200 transition-colors">
                Sincronizar ahora
              </button>
            )}
          </div>
        )}

        {/* ── Búsqueda ── */}
        <div className="px-4 pt-4 pb-3 border-b border-white/5 bg-brand-navy">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            {busqueda && (
              <button onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1">
                <X size={14} />
              </button>
            )}
            <input
              ref={searchRef}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código…  (F2)"
              className="w-full bg-brand-dark border border-white/10 rounded-xl pl-10 pr-9 py-3
                         text-sm text-white placeholder:text-gray-600
                         focus:outline-none focus:border-[#EA580C]/50 transition-colors"
            />
          </div>
        </div>

        {/* ── Tabs categorías con scroll ── */}
        <div className="relative flex-shrink-0 bg-brand-navy border-b border-white/5">
          {/* Botón scroll izquierda */}
          <button
            onClick={() => scrollCats('left')}
            className="absolute left-0 top-0 bottom-0 z-10 px-1 bg-gradient-to-r from-brand-navy to-transparent
                       text-gray-500 hover:text-white flex items-center">
            <ChevronLeft size={16} />
          </button>
          {/* Tabs */}
          <div
            ref={catScrollRef}
            className="flex gap-2 px-8 py-2.5 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <button
              onClick={() => setCatActiva(null)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap',
                'transition-colors flex-shrink-0 select-none active:scale-[0.95]',
                catActiva === null
                  ? 'bg-[#EA580C] text-white'
                  : 'bg-brand-dark text-gray-400 hover:text-white hover:bg-white/5',
              )}
            >
              <Grid3X3 size={14} />
              Todos
              <span className={cn('text-xs px-1.5 rounded-full',
                catActiva === null ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-500'
              )}>{productos.length}</span>
            </button>
            {categorias.map(cat => {
              const count = productos.filter(p => p.categoria_id === cat.id).length
              if (count === 0) return null
              return (
                <button key={cat.id} onClick={() => setCatActiva(cat.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap',
                    'transition-colors flex-shrink-0 select-none active:scale-[0.95]',
                    catActiva === cat.id
                      ? 'bg-[#EA580C] text-white'
                      : 'bg-brand-dark text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {cat.emoji && <span>{cat.emoji}</span>}
                  {cat.nombre}
                  <span className={cn('text-xs px-1.5 rounded-full',
                    catActiva === cat.id ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-500'
                  )}>{count}</span>
                </button>
              )
            })}
          </div>
          {/* Botón scroll derecha */}
          <button
            onClick={() => scrollCats('right')}
            className="absolute right-0 top-0 bottom-0 z-10 px-1 bg-gradient-to-l from-brand-navy to-transparent
                       text-gray-500 hover:text-white flex items-center">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Grid de productos ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
              <ShoppingCart size={40} className="opacity-20 animate-pulse" />
              <p className="text-sm">Cargando productos…</p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
              <ShoppingCart size={40} className="opacity-20" />
              <p className="text-sm">
                {productos.length === 0 ? 'No hay productos disponibles' : 'Sin resultados'}
              </p>
              {(busqueda || catActiva) && (
                <button onClick={() => { setBusqueda(''); setCatActiva(null) }}
                  className="text-xs text-[#EA580C] hover:underline py-2 px-4">
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtrados.map(p => {
                const item = cart.find(i => i.itemKey === p.id)
                return (
                  <ProductCard key={p.id} producto={p}
                    code={codigoMap[p.id] ?? '#—'}
                    enCart={!!item}
                    cantidadEnCart={item?.cantidad ?? 0}
                    catNombre={catNameMap.get(p.categoria_id ?? '') ?? ''}
                    onClick={() => addItem(p)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* ── Barra inferior: atajos — solo en desktop ── */}
        {!isMobile && (
          <div className="px-4 py-2 border-t border-white/5 bg-brand-navy flex items-center gap-4 text-[10px] text-gray-600">
            <Keyboard size={12} className="flex-shrink-0" />
            <span><kbd className="bg-brand-dark border border-white/10 px-1 rounded">0-9</kbd> Numpad</span>
            <span><kbd className="bg-brand-dark border border-white/10 px-1 rounded">⌫</kbd> Borrar</span>
            <span><kbd className="bg-brand-dark border border-white/10 px-1 rounded">Enter</kbd> Cobrar</span>
            <span><kbd className="bg-brand-dark border border-white/10 px-1 rounded">F2</kbd> Buscar</span>
            <span><kbd className="bg-brand-dark border border-white/10 px-1 rounded">Esc</kbd> Cancelar</span>
          </div>
        )}
      </div>

      {/* ── Handle redimensionable — solo en desktop ── */}
      {!isMobile && (
        <div
          onMouseDown={e => {
            e.preventDefault()
            isDragging.current  = true
            dragStartX.current  = e.clientX
            dragStartW.current  = panelWidth
            document.body.style.cursor     = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
          className="w-1.5 flex-shrink-0 bg-white/5 hover:bg-[#EA580C]/60 active:bg-[#EA580C] cursor-col-resize transition-colors"
          title="Arrastra para ajustar el ancho del panel"
        />
      )}

      {/* ═══════════════════════════════════════
          PANEL DERECHO — Orden + Pago (Costco style)
      ═══════════════════════════════════════ */}
      <div
        className={cn(
          'flex-shrink-0 flex flex-col bg-brand-navy border-l border-white/5',
          isMobile ? (posView === 'carrito' ? 'flex-1 w-full' : 'hidden') : '',
        )}
        style={!isMobile ? { width: panelWidth } : undefined}
      >

        {/* ── Cabecera ── */}
        <div className="px-4 py-3 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest leading-none">Venta</p>
            <p className="text-white font-bold text-xl leading-tight">#{numeroVentaActiva}</p>
          </div>

          {/* Ventas pendientes — visible solo cuando hay cola */}
          {pendingCount > 0 && (
            <button
              onClick={syncNow}
              title="Sincronizar ventas pendientes"
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors select-none',
                netStatus === 'syncing'
                  ? 'text-blue-400 border-blue-500/20 bg-blue-500/10 cursor-default'
                  : 'text-amber-400 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer',
              )}
            >
              {netStatus === 'syncing'
                ? <><RefreshCw size={11} className="animate-spin" /><span>Sincronizando…</span></>
                : <><RefreshCw size={11} /><span>{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span></>
              }
            </button>
          )}
          {cart.length > 0 && (
            <button onClick={clearCart}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400
                         bg-white/5 hover:bg-red-500/10 px-3 py-2 rounded-xl transition-colors
                         active:scale-[0.95] select-none border border-white/5 hover:border-red-500/20">
              <X size={13} /> Limpiar
            </button>
          )}
        </div>

        {/* ── Lista de ítems ── */}
        <div className="flex-1 min-h-[100px] overflow-y-auto px-3 py-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-700">
              <ShoppingCart size={44} className="opacity-15" />
              <p className="text-xs text-center text-gray-600">
                Toca un producto para agregarlo
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {cart.map(item => {
                const catNom = catNameMap.get(item.producto.categoria_id ?? '') ?? ''
                return (
                  <div key={item.itemKey} className="flex items-center gap-2.5 py-2.5">
                    <MiniIcon producto={item.producto} catNombre={catNom} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white leading-snug line-clamp-2">
                        {nombreEfectivo(item)}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {fmt(precioEfectivo(item))} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => changeQty(item.itemKey, -1)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/12 active:scale-[0.90]
                                   flex items-center justify-center text-gray-300 transition-all select-none">
                        <Minus size={11} />
                      </button>
                      <span className="w-6 text-center text-white font-bold text-sm tabular-nums">
                        {item.cantidad}
                      </span>
                      <button onClick={() => changeQty(item.itemKey, 1)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-[#EA580C]/20 active:scale-[0.90]
                                   flex items-center justify-center text-gray-300 hover:text-[#EA580C]
                                   transition-all select-none">
                        <Plus size={11} />
                      </button>
                    </div>
                    <div className="text-right flex-shrink-0 min-w-[52px]">
                      <p className="text-sm font-bold text-white tabular-nums">
                        {fmt(precioEfectivo(item) * item.cantidad)}
                      </p>
                      <button onClick={() => removeItem(item.itemKey)}
                        className="text-gray-600 hover:text-red-400 transition-colors mt-0.5">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Pago — siempre visible debajo del carrito (igual patrón que Esquina del Crédito) ── */}
        <div className="border-t border-white/5 bg-[#0D1B2A] p-3 space-y-2.5 flex-shrink-0 overflow-y-auto max-h-[62%]">

          {/* Métodos de pago */}
          <div className="grid grid-cols-4 gap-1">
            {([
              { m: 'efectivo',     label: 'Efectivo',    icon: Banknote    },
              { m: 'exacto',       label: 'P. Completo', icon: Zap         },
              { m: 'transferencia',label: 'Transfer.',   icon: Smartphone  },
              { m: 'credito',      label: 'Crédito',     icon: CreditCard  },
            ] as { m: typeof metodoPago; label: string; icon: React.ElementType }[]).map(({ m, label, icon: Icon }) => (
              <button key={m} onClick={() => cambiarMetodo(m)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-[10px] font-semibold transition-all select-none',
                  metodoPago === m
                    ? 'bg-[#EA580C]/15 border-[#EA580C]/50 text-[#EA580C]'
                    : 'bg-brand-dark border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                )}>
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Área según método ── */}

          {/* EFECTIVO — numpad */}
          {metodoPago === 'efectivo' && (<>
            <div className="bg-[#162C50] border border-white/8 rounded-xl px-4 py-2.5 text-center">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Efectivo recibido</p>
              <p className="text-2xl font-bold text-white tabular-nums min-h-[1.8rem]">
                {efectivo ? fmt(parseFloat(efectivo)) : <span className="text-gray-700">$ 0</span>}
              </p>
            </div>
            <NumPad valor={efectivo} onChange={setEfectivo} total={total} />
            {efectivoNum >= total && total > 0 && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2
                              flex items-center justify-between">
                <p className="text-xs text-gray-400">Cambio</p>
                <p className="text-xl font-bold text-green-400 tabular-nums">{fmt(cambio)}</p>
              </div>
            )}
          </>)}

          {/* EXACTO — total sin vuelto */}
          {metodoPago === 'exacto' && (
            <div className="bg-[#162C50] border border-[#EA580C]/20 rounded-xl p-3 text-center space-y-1">
              <Zap size={20} className="text-[#EA580C] mx-auto" />
              <p className="text-xs text-gray-400">Total exacto a cobrar</p>
              <p className="text-2xl font-bold text-white tabular-nums">{fmt(total)}</p>
              <p className="text-xs text-green-400 font-medium">Sin vuelto · Cobro rápido</p>
            </div>
          )}

          {/* TRANSFERENCIA */}
          {metodoPago === 'transferencia' && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center space-y-1">
              <Smartphone size={20} className="text-blue-400 mx-auto" />
              <p className="text-white font-bold text-xl tabular-nums">{fmt(total)}</p>
              <p className="text-xs text-gray-400">El cliente realizó la transferencia</p>
              <p className="text-xs text-blue-400 font-medium">Verifica el recibo antes de confirmar</p>
            </div>
          )}

          {/* CRÉDITO — selector de cliente */}
          {metodoPago === 'credito' && (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  value={buscandoCliente}
                  onChange={e => setBuscandoCliente(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl pl-9 pr-3 py-2.5
                             text-sm text-white placeholder:text-gray-600
                             focus:outline-none focus:border-pink-500/50"
                />
              </div>
              {clienteCredito ? (
                <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center
                                  text-pink-400 font-bold text-sm flex-shrink-0">
                    {clienteCredito.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{clienteCredito.nombre}</p>
                    <p className="text-xs text-pink-400">Cliente seleccionado</p>
                  </div>
                  <button onClick={() => setClienteCredito(null)}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {clientesLista.length > 0 ? (
                    <div className="bg-brand-dark rounded-xl border border-white/5
                                    max-h-[140px] overflow-y-auto divide-y divide-white/5">
                      {clientesLista.map(c => (
                        <button key={c.id}
                          onClick={() => { setClienteCredito(c); setBuscandoCliente('') }}
                          className="w-full flex items-center gap-2.5 p-2.5 hover:bg-white/5
                                     text-left transition-colors">
                          <div className="w-7 h-7 rounded-full bg-pink-500/15 flex items-center justify-center
                                          text-pink-400 font-bold text-xs flex-shrink-0">
                            {c.nombre[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium truncate">{c.nombre}</p>
                            {c.telefono && (
                              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Phone size={9} />{c.telefono}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {/* Crear cliente nuevo — siempre visible */}
                  <CrearClienteRapidoPOS
                    nombreInicial={buscandoCliente}
                    onCreado={(c) => { setClienteCredito(c); setBuscandoCliente('') }}
                  />
                </>
              )}
            </div>
          )}

          {/* Totales */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Sub Total</span>
              <span className="tabular-nums text-gray-300">{fmt(subTotal)}</span>
            </div>
            {redondeo !== 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Redondeo COP</span>
                <span className={cn(
                  'tabular-nums font-medium',
                  redondeo > 0 ? 'text-orange-400' : 'text-green-400',
                )}>
                  {redondeo > 0 ? '+' : ''}{fmt(redondeo)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1.5 border-t border-white/5">
              <span className="text-white font-bold">TOTAL</span>
              <span className="text-white font-bold text-2xl tabular-nums">{fmt(total)}</span>
            </div>
          </div>

          {/* Cobrar — único botón, sin pantalla aparte */}
          <button
            disabled={cart.length === 0 || !canCobrar || isPending}
            onClick={() => cobrar()}
            className={cn(
              'w-full rounded-xl py-4 text-lg font-bold transition-all duration-150 select-none',
              cart.length > 0 && canCobrar && !isPending
                ? 'bg-[#EA580C] hover:bg-[#C2410C] text-white active:scale-[0.97]' +
                  ' shadow-[0_4px_20px_rgba(234,88,12,0.4)]'
                : 'bg-white/5 text-gray-600 cursor-not-allowed',
            )}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Procesando…
              </span>
            ) : cart.length === 0
              ? 'Orden vacía'
            : metodoPago === 'efectivo' && !efectivo
              ? 'Ingresar efectivo'
            : metodoPago === 'efectivo' && efectivoNum < total
              ? <span className="flex flex-col leading-tight">
                  <span className="text-sm font-normal opacity-60">Faltan</span>
                  <span>{fmt(total - efectivoNum)}</span>
                </span>
            : metodoPago === 'credito' && !clienteCredito
              ? 'Seleccionar cliente'
            : `Cobrar · ${fmt(total)}`
            }
          </button>
        </div>
      </div>
    </div>

    {/* ── Modal éxito venta + ticket ── */}
    {ventaOk && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className={cn(
          'bg-[#112240] border rounded-2xl w-full max-w-sm shadow-2xl text-center p-6',
          ventaOk.metodo === 'credito'      ? 'border-pink-500/30'
          : ventaOk.metodo === 'transferencia' ? 'border-blue-500/30'
          : 'border-green-500/30',
        )}>
          <CheckCircle size={40} className={cn('mx-auto mb-3',
            ventaOk.metodo === 'credito' ? 'text-pink-400'
            : ventaOk.metodo === 'transferencia' ? 'text-blue-400'
            : 'text-green-400'
          )} />
          <p className={cn('font-bold text-lg',
            ventaOk.metodo === 'credito' ? 'text-pink-400'
            : ventaOk.metodo === 'transferencia' ? 'text-blue-400'
            : 'text-green-400'
          )}>{ventaOk.numero_venta}</p>
          <p className="text-gray-400 text-sm mt-1">
            {ventaOk.metodo === 'credito' ? 'Venta a crédito'
            : ventaOk.metodo === 'transferencia' ? 'Pago por transferencia'
            : 'Venta procesada'}
          </p>
          <p className="text-white font-bold text-2xl mt-1 tabular-nums">{fmt(ventaOk.total)}</p>
          {ventaOk.metodo === 'credito' && ventaOk.clienteNombre && (
            <p className="text-pink-300 text-sm mt-2">
              Cliente: <strong>{ventaOk.clienteNombre}</strong>
            </p>
          )}
          {ventaOk.cambioEntregado > 0 && (
            <p className="text-green-300 text-sm mt-2">
              Cambio: <strong className="tabular-nums">{fmt(ventaOk.cambioEntregado)}</strong>
            </p>
          )}
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => ventaOk && imprimirTicket({
                numero_venta: ventaOk.numero_venta, items: cart,
                subTotal, total, redondeo,
                efectivo:  ventaOk.efectivoPagado,
                cambio:    ventaOk.cambioEntregado,
                cajero:    user?.nombre,
                metodoPago: ventaOk.metodo === 'exacto' ? 'efectivo' : ventaOk.metodo,
                clienteNombre: ventaOk.clienteNombre,
              })}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold
                         border border-white/10 text-gray-400 hover:text-white hover:bg-white/5">
              <Printer size={14} /> Imprimir
            </button>
            <button onClick={clearCart}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-[#EA580C] hover:bg-[#C2410C]">
              Nueva venta
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal Venta Libre ──────────────────────────────────────── */}
    {ventaLibreModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
           style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="bg-[#112240] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 className="text-white font-bold text-lg mb-1">Venta Libre</h3>
          <p className="text-gray-500 text-xs mb-5">Ingresa la descripción, precio y cantidad</p>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-gray-400 uppercase tracking-wider mb-1 block">
                Descripción / Nombre
              </label>
              <input
                autoFocus
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2.5
                           text-white text-sm placeholder:text-gray-600 focus:outline-none
                           focus:border-[#EA580C]/60"
                value={ventaLibreModal.nombre}
                onChange={e => setVentaLibreModal(prev => prev ? { ...prev, nombre: e.target.value } : prev)}
                onKeyDown={e => { if (e.key === 'Enter') document.getElementById('vl-precio')?.focus() }}
                placeholder="Ej: Torta personalizada"
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 uppercase tracking-wider mb-1 block">
                Precio
              </label>
              <input
                id="vl-precio"
                type="number"
                min="1"
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2.5
                           text-white text-sm placeholder:text-gray-600 focus:outline-none
                           focus:border-[#EA580C]/60"
                value={ventaLibreModal.precio}
                onChange={e => setVentaLibreModal(prev => prev ? { ...prev, precio: e.target.value } : prev)}
                onKeyDown={e => { if (e.key === 'Enter') document.getElementById('vl-cantidad')?.focus() }}
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 uppercase tracking-wider mb-1 block">
                Cantidad
              </label>
              <input
                id="vl-cantidad"
                type="number"
                min="1"
                className="w-full bg-[#0D1B2A] border border-white/10 rounded-xl px-3 py-2.5
                           text-white text-sm placeholder:text-gray-600 focus:outline-none
                           focus:border-[#EA580C]/60"
                value={ventaLibreModal.cantidad}
                onChange={e => setVentaLibreModal(prev => prev ? { ...prev, cantidad: e.target.value } : prev)}
                onKeyDown={e => { if (e.key === 'Enter') confirmarVentaLibre() }}
                placeholder="1"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setVentaLibreModal(null)}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                         hover:bg-white/5 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button
              onClick={confirmarVentaLibre}
              className="flex-1 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2460A]
                         text-white text-sm font-bold transition-colors">
              Agregar al carrito
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
