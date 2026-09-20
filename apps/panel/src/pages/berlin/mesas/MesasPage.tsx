import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutGrid, X, Plus, Minus, Trash2, Search, ChevronLeft,
  Lock, Unlock, CreditCard, Banknote, Smartphone, Layers,
  Settings, Edit2, Check, Send, AlertTriangle, RefreshCw,
  GlassWater, Droplet, Milk,
} from 'lucide-react'
import { useOfflineMesasCobro } from './useOfflineMesasCobro'
import { useOpsMesas, useOutboxMesas, encolarOp, nuevaOp, cargarOps, hayOpsPendientes, sincronizarOpsMesas } from './useOutboxMesas'
import { ordenConOps, ordenParaMesa, tableroConOps } from './overlayMesas'
import { hayInternet, useHayInternet } from '../../../lib/conexion'
import type { QueuedCobro } from './useOfflineMesasCobro'
import { api } from '../../../lib/api'
import { COBRO_TIMEOUT_MS, isTransientError, isAuthError, fallbackSiNoRed } from '../../../lib/offline'
import toast from 'react-hot-toast'
import type { Producto, Categoria } from '../../../types'
import { cn } from '../../../lib/utils'
import { coincide, normalizar } from '../../../lib/buscar'
import { esCategoriaComida, esCategoriaToppings, esCategoriaSalsas } from '../../../lib/comida'
import ModalModificarComida from '../../../components/ModalModificarComida'
import { fmtDinero, soloDigitos } from '../../../lib/dinero'
import { useAuthStore } from '../../../store/authStore'
import ProductImageInput from '../../../components/ProductImageInput'

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const redondear = (n: number) => Math.round(n / 50) * 50

function isEmoji(s?: string | null) { return !!s && !s.startsWith('http') && s.length <= 8 }

function getAutoEmoji(nombre: string): string {
  const n = nombre.toLowerCase()
  if (n.includes('agua'))       return '💧'
  if (n.includes('gaseosa') || n.includes('cola') || n.includes('brisa')) return '🫧'
  if (n.includes('cafe') || n.includes('café')) return '☕'
  if (n.includes('arepa'))      return '🫓'
  if (n.includes('almojabana') || n.includes('buñuelo')) return '🧆'
  if (n.includes('croissant'))  return '🥐'
  if (n.includes('torta') || n.includes('ponque')) return '🎂'
  if (n.includes('empanada'))   return '🥟'
  if (n.includes('pan'))        return '🍞'
  if (n.includes('avena') || n.includes('yogurt')) return '🥛'
  return '🥖'
}

// ── Mini ícono para carrito (igual que POS) ───────────────────
function MiniIconMesa({ nombre, imagenUrl }: { nombre: string; imagenUrl?: string | null }) {
  if (imagenUrl && !isEmoji(imagenUrl)) {
    return <img src={imagenUrl} alt="" className="w-9 h-9 rounded-lg object-cover bg-brand-dark flex-shrink-0" />
  }
  const emoji = isEmoji(imagenUrl) ? imagenUrl! : getAutoEmoji(nombre)
  return (
    <div className="w-9 h-9 rounded-lg bg-[#403A32] flex items-center justify-center text-xl flex-shrink-0">
      {emoji}
    </div>
  )
}

// ── Ticket 80mm para mesas ────────────────────────────────────
function imprimirTicketMesa(datos: {
  numero_venta:      string
  mesa_numero:       number
  mesa_nombre?:      string | null
  mesero?:           string
  items:             { nombre: string; cantidad: number; precio_unitario: number; subtotal: number; notas?: string | null }[]
  subtotal:          number
  redondeo:          number
  total:             number
  metodo_pago:       string
  efectivo_recibido?: number
  cambio?:           number
  mixto_efectivo?:      number
  mixto_transferencia?: number
  parcial?:             boolean
  provisional?:         boolean   // cobro guardado sin conexión: la factura se numera al sincronizar
}) {
  const fecha = new Date().toLocaleString('es-CO', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  })
  const mesaNom = datos.mesa_nombre
    ? `${datos.mesa_numero} — ${datos.mesa_nombre}`
    : `${datos.mesa_numero}`
  const origin = window.location.origin
  // Las notas las escribe el cajero: se escapan antes de meterlas en el HTML del ticket
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const itemsHtml = datos.items.map(i => `
<p class="item-nm">${i.nombre}</p>${i.notas ? `
<p class="item-sub" style="padding-left:8px;font-weight:700">** ${esc(i.notas)}</p>` : ''}
<div class="row">
  <span class="item-sub">&nbsp;&nbsp;${i.cantidad} x ${fmt(i.precio_unitario)}</span>
  <span class="amt">${fmt(i.subtotal)}</span>
</div>`).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Mesa ${mesaNom} — ${datos.numero_venta}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{margin:5mm;size:80mm auto}
  body{font-family:Arial,sans-serif;font-weight:600;font-size:14px;width:100%;color:#000;-webkit-print-color-adjust:exact}
  .c{text-align:center}.b{font-weight:bold}
  .sep{border-top:1px dashed #000;margin:5px 0}.sep2{border-top:2px solid #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin:2px 0}
  .row>span:first-child{flex:1;min-width:0;overflow-wrap:break-word}
  .amt{flex-shrink:0;text-align:right;white-space:nowrap;font-weight:700;min-width:58px}
  .item-nm{font-weight:700;font-size:14px;margin-top:5px;word-break:break-word}
  .item-sub{font-size:13px;color:#000}
  .logo-img{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:28mm;object-fit:contain}
  .biz-sub{font-size:13px;letter-spacing:1px;margin-top:3px;font-weight:bold}
  h3{font-size:14px;font-weight:bold}.sm{font-size:13px;color:#000}
  .total-row{display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid #000;margin-top:5px;padding-top:5px;gap:6px}
  .total-lbl{font-size:16px;font-weight:900}.total-val{font-size:20px;font-weight:900;white-space:nowrap}
</style></head><body>
<div class="c" style="padding:4px 0 2px">
  <img class="logo-img" src="${origin}/logos/berlin.png" alt="Berlín Café Bar"/>
  <p class="biz-sub">*Café Bar Berlín*</p>
</div>
<div class="c" style="margin-bottom:4px">
  <p class="sm">NIT: 1035424712-4</p>
  <p class="sm">Direccion: Calle 28 #30-19 - Don Matias, Antioquia</p>
  <p class="sm">Tel: 3215994825</p>
</div>
<div class="sep2"></div>
<div class="c">
  <h3>${datos.provisional ? 'COMPROBANTE PROVISIONAL' : datos.parcial ? 'CUENTA PARCIAL DE MESA' : 'CUENTA DE MESA'}</h3>
  ${datos.provisional ? '<p class="sm">Pago recibido SIN CONEXIÓN. La factura definitiva se numera al sincronizar.</p>' : ''}
  <p>No. <strong>${datos.numero_venta}</strong></p>
  <p class="sm">${fecha}</p>
  <p class="sm"><b>Mesa ${mesaNom}</b></p>
  ${datos.mesero ? `<p class="sm">Mesero: <b>${datos.mesero}</b></p>` : ''}
</div>
<div class="sep2"></div>
<div class="row b sm"><span>DESCRIPCION</span><span class="amt">TOTAL</span></div>
<div class="sep"></div>
${itemsHtml}
<div class="sep"></div>
<div class="row"><span>Sub Total:</span><span class="amt">${fmt(datos.subtotal)}</span></div>
${datos.redondeo !== 0
  ? `<div class="row sm" style="color:#000"><span>Redondeo COP:</span><span class="amt">${datos.redondeo > 0 ? '+' : '-'}${fmt(Math.abs(datos.redondeo))}</span></div>`
  : ''}
<div class="total-row">
  <span class="total-lbl">TOTAL:</span>
  <span class="total-val">${fmt(datos.total)}</span>
</div>
<div class="sep"></div>
<div class="row b"><span>Método de pago:</span><span>${
  datos.metodo_pago === 'mixto' ? 'Mixto'
  : datos.metodo_pago === 'transferencia' || datos.metodo_pago === 'qr' ? 'Pago Electrónico'
  : datos.metodo_pago === 'credito' ? 'Crédito'
  : 'Efectivo'
}</span></div>
${datos.metodo_pago === 'mixto' ? `
<div class="row"><span>Efectivo:</span><span class="amt">${fmt(datos.mixto_efectivo ?? 0)}</span></div>
<div class="row"><span>Pago Electrónico:</span><span class="amt">${fmt(datos.mixto_transferencia ?? 0)}</span></div>` : ''}
${datos.efectivo_recibido && datos.metodo_pago === 'efectivo' ? `
<div class="row"><span>Efectivo recibido:</span><span class="amt">${fmt(datos.efectivo_recibido)}</span></div>
<div class="row b" style="color:#000"><span>Cambio:</span><span class="amt">${fmt(datos.cambio ?? 0)}</span></div>` : ''}
<div class="sep"></div>
<div class="c sm">
  ${datos.parcial ? '<p>Pago parcial: el resto de la mesa se cobra aparte</p>' : ''}
  <p>Conserve este tiquete como soporte de pago</p>
</div>
<div class="sep"></div>
<div class="c">
  <p class="b" style="font-size:13px">Gracias por su visita!</p>
  <p class="sm" style="margin-top:6px">Sistema Kalreco v1.0 | app.mymulticentro.com</p>
</div>
</body></html>`

  const win = window.open('', '_blank', 'width=440,height=760')
  if (win) {
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); setTimeout(() => win.close(), 800) }, 400)
  }
}

// ── Tipos ─────────────────────────────────────────────────────
export interface Mesero  { id: string; nombre: string; color: string; usuario_id?: string | null }
export interface OrdenItem {
  id: string; cantidad: number; precio_unitario: number; subtotal: number; notas?: string
  enviado_at?: string | null; servido_at?: string | null
  venta_id?: string | null; pagado_at?: string | null   // venta_id != null → ya cobrado (cobro parcial)
  producto?: { id:string; nombre:string; imagen_url?:string; precio_venta:number; unidad_venta:string }
}
export interface Orden { id:string; total:number; estado:string; created_at:string; mesero?:Mesero; items:OrdenItem[] }
export interface Mesa  { id:string; numero:number; nombre?:string; capacidad:number; estado:'libre'|'ocupada'|'reservada'; imagen_url?:string|null; orden_activa?:Orden|null }

// ── Card de mesa ──────────────────────────────────────────────
function MesaCard({
  mesa, onClick, currentUserId, currentUserName, tomando,
}: {
  mesa: Mesa; onClick: () => void; currentUserId?: string; currentUserName?: string; tomando?: boolean
}) {
  const libre  = mesa.estado === 'libre'
  const mesero = mesa.orden_activa?.mesero
  const total  = mesa.orden_activa?.total ?? 0   // total PENDIENTE de cobro (el backend excluye lo ya cobrado)
  const itemsOrden  = mesa.orden_activa?.items ?? []
  const pendientes  = itemsOrden.filter(i => !i.venta_id)
  const hayCobrados = itemsOrden.some(i => i.venta_id)
  const items  = pendientes.length
  // Mesa ocupada por otro: atenuar (fallback por nombre si usuario_id no está vinculado aún)
  const esMia  = !mesero || mesero.usuario_id === currentUserId || !currentUserId
    || (!mesero.usuario_id && !!currentUserName && mesero.nombre === currentUserName)

  // Estado de servido (Fase E) — derivado de los ítems reales, sin columna nueva en mesa.
  // Solo cuenta ítems ya enviados a las estaciones (enviado_at) — lo que aún está en el
  // carrito sin enviar no aplica todavía.
  const enviados = pendientes.filter(i => i.enviado_at)
  const estadoServido: 'falta' | 'servido' | null = enviados.length === 0
    ? null
    : enviados.some(i => !i.servido_at) ? 'falta' : 'servido'

  const tieneImagen = !!mesa.imagen_url

  return (
    <button onClick={onClick}
      className={cn(
        'relative rounded-2xl p-4 border-2 transition-all text-left w-full overflow-hidden',
        'hover:scale-[1.02] active:scale-[0.98]',
        libre
          ? 'bg-brand-navy border-white/10 hover:border-white/20'
          : esMia
            ? 'bg-brand-navy border-2'
            : 'bg-brand-dark/70 border-2 opacity-60 cursor-not-allowed',
        tomando ? 'opacity-60 pointer-events-none' : '',
      )}
      style={!libre ? { borderColor: mesero?.color ?? '#00C49A' } : {}}
    >
      {tieneImagen && (
        <>
          <img src={mesa.imagen_url ?? ''} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(13,27,42,0.35) 0%, rgba(13,27,42,0.85) 100%)' }} />
        </>
      )}
      <div className="relative">
      {/* Número */}
      <div className="flex items-start justify-between mb-3">
        <div>
          {mesa.nombre
            ? <>
                <p className="text-lg font-black text-white leading-tight">{mesa.nombre}</p>
                <p className="text-[11px] text-gray-500">Mesa {mesa.numero}</p>
              </>
            : <p className="text-2xl font-black text-white">{mesa.numero}</p>}
        </div>
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          libre ? 'bg-gray-500/15' : 'bg-green-500/10')}>
          {libre ? <Unlock size={13} className="text-gray-500"/> : <Lock size={13} className="text-green-400"/>}
        </div>
      </div>

      {/* Estado */}
      {libre ? (
        <p className="text-xs text-gray-600">Disponible · {mesa.capacidad} personas</p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ background: (mesero?.color ?? '#00C49A') + '33', color: mesero?.color ?? '#00C49A' }}>
              {mesero?.nombre[0].toUpperCase()}
            </div>
            <p className="text-xs text-white font-medium">{mesero?.nombre ?? '—'}</p>
          </div>
          <p className="text-xs text-gray-500">{items} producto{items !== 1 ? 's' : ''}</p>
          {total > 0 && <p className="text-sm font-bold" style={{ color: mesero?.color ?? '#00C49A' }}>{fmt(total)}</p>}
          {hayCobrados && (
            <p className="text-[10px] font-bold px-2 py-0.5 rounded-lg inline-block bg-blue-500/15 text-blue-300">
              Cobro parcial · falta {fmt(total)}
            </p>
          )}
          {estadoServido && (
            <p className={cn(
              'text-xs font-bold px-2 py-1 rounded-lg inline-block',
              estadoServido === 'servido'
                ? 'bg-[#D9A652] text-brand-dark animate-pulse'
                : 'bg-[#EA580C]/15 text-[#EA580C]',
            )}>
              {estadoServido === 'servido' ? '💰 Listo para cobrar' : '⏳ Falta servir'}
            </p>
          )}
        </div>
      )}
      </div>
    </button>
  )
}

// ── Vista de orden (carrito) ──────────────────────────────────
const ROLES_COBRAR      = ['cajero', 'admin_berlin', 'admin', 'super_admin', 'vendedor']
const ROLES_ADMIN_MESA  = ['admin_berlin', 'admin', 'super_admin']
// Ítem con unidades ya reservadas por cobros guardados sin conexión (cantidad/subtotal = lo que aún se puede cobrar)
type ItemLocal = OrdenItem & { _reservado?: number }

function VistaOrden({ mesa, cajaId, onVolver, onEnqueueCobro, onDequeueCobro, onMarkInFlight, onPatchCobro, colaTodos, mesasLibres, onTrasladada }: {
  mesa: Mesa; cajaId?: string; onVolver: () => void
  onEnqueueCobro: (cobro: QueuedCobro) => void
  onDequeueCobro: (key: string) => void
  onMarkInFlight: (key: string, activa: boolean) => void
  onPatchCobro:   (key: string, patch: Partial<QueuedCobro>) => void
  colaTodos: QueuedCobro[]    // TODA la cola de cobros guardados sin conexión (o rechazados al sincronizar)
  mesasLibres: Mesa[]         // destinos posibles para "Cambiar de mesa"
  onTrasladada: (destino: Mesa, ordenId: string, origenId: string) => void
}) {
  const qc  = useQueryClient()
  const user = useAuthStore(s => s.user)
  const puedeCobar = ROLES_COBRAR.includes(user?.rol ?? '')
  // Una key por cobro: se regenera tras cada cobro exitoso (varios cobros parciales en la misma pantalla)
  const [cobrarKey, setCobrarKey] = useState(() => crypto.randomUUID())
  // Dividir cuenta: seleccion[itemId] = unidades elegidas para cobrar ahora
  const [showTrasladar, setShowTrasladar] = useState(false)
  // Celular: catálogo y pedido no caben lado a lado (el carrito solo mide 240-520 px). Se muestra
  // uno a la vez con pestañas, igual que el POS.
  const [esMovil, setEsMovil] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [vistaMovil, setVistaMovil] = useState<'catalogo' | 'pedido'>('catalogo')
  useEffect(() => {
    const revisar = () => setEsMovil(window.innerWidth < 768)
    window.addEventListener('resize', revisar)
    return () => window.removeEventListener('resize', revisar)
  }, [])
  const [modoDividir, setModoDividir] = useState(false)
  const [seleccion,   setSeleccion]   = useState<Record<string, number>>({})
  const [busqueda,    setBusqueda]    = useState('')
  const [catActiva,   setCatActiva]   = useState<string|null>(null)
  const [metodoPago,       setMetodoPago]       = useState<'efectivo'|'exacto'|'transferencia'|'credito'|'mixto'>('efectivo')
  const [showCobrar,       setShowCobrar]       = useState(false)
  const [clienteId,        setClienteId]        = useState<string>('')
  const [buscandoCli,      setBuscandoCli]      = useState('')
  const [efectivoRecibido, setEfectivoRecibido] = useState<string>('')
  const [mixtoEfectivo,      setMixtoEfectivo]      = useState('')
  const [mixtoTransferencia, setMixtoTransferencia] = useState('')
  const [ventaLibreModal,  setVentaLibreModal]  = useState<{ producto: Producto; nombre: string; precio: string; cantidad: string } | null>(null)
  const efectivoInputRef = useRef<HTMLInputElement>(null)

  // ── Panel carrito redimensionable (horizontal, catálogo↔carrito) — mismo patrón que POS ──
  const PANEL_MIN = 240
  const PANEL_MAX = 520
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('berlin-mesas-panel-width')
    const n = saved ? parseInt(saved, 10) : 280
    return isNaN(n) ? 280 : Math.min(Math.max(n, PANEL_MIN), PANEL_MAX)
  })
  const isDragging  = useRef(false)
  const dragStartX  = useRef(0)
  const dragStartW  = useRef(0)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartX.current - e.clientX
      const next  = Math.min(Math.max(dragStartW.current + delta, PANEL_MIN), PANEL_MAX)
      setPanelWidth(next)
    }
    const onUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      setPanelWidth(w => { localStorage.setItem('berlin-mesas-panel-width', String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Bloque de pago redimensionable (vertical, ítems↔pago) — mismo patrón ──
  const PAY_MIN = 220
  const PAY_MAX = 560
  const [paymentHeight, setPaymentHeight] = useState<number>(() => {
    const saved = localStorage.getItem('berlin-mesas-payment-height')
    const n = saved ? parseInt(saved, 10) : 300
    return isNaN(n) ? 300 : Math.min(Math.max(n, PAY_MIN), PAY_MAX)
  })
  const isDraggingV = useRef(false)
  const dragStartY  = useRef(0)
  const dragStartH  = useRef(0)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingV.current) return
      const delta = dragStartY.current - e.clientY
      const next  = Math.min(Math.max(dragStartH.current + delta, PAY_MIN), PAY_MAX)
      setPaymentHeight(next)
    }
    const onUp = () => {
      if (!isDraggingV.current) return
      isDraggingV.current = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      setPaymentHeight(h => { localStorage.setItem('berlin-mesas-payment-height', String(h)); return h })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Foco automático en el campo de efectivo al elegir ese método — igual que POS
  // (antes era un <p> de solo lectura, sin cursor, aunque el numpad sí escribía el valor).
  useEffect(() => {
    if (showCobrar && metodoPago === 'efectivo') efectivoInputRef.current?.focus()
  }, [showCobrar, metodoPago])

  // ── Teclado físico cuando el modal está abierto en modo efectivo ──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!showCobrar) return
    if (metodoPago === 'efectivo') {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        setEfectivoRecibido(v => (v === '' && e.key === '0') ? v : v + e.key)
        return
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setEfectivoRecibido(v => v.slice(0, -1))
        return
      } else if (e.key === 'Delete') {
        e.preventDefault()
        setEfectivoRecibido('')
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setShowCobrar(false)
    }
  }, [showCobrar, metodoPago])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // La cuenta que se ve = lo que dice el servidor + las operaciones de este equipo aún sin
  // sincronizar (useOutboxMesas): así tomar la mesa, agregar productos o enviar el pedido se
  // reflejan al instante, con o sin internet.
  const opsTodas = useOpsMesas()
  const { data: ordenSrv, isLoading: loadOrdenSrv } = useQuery<Orden | null>({
    queryKey: ['mesa-orden', mesa.id],
    // 404 = la mesa no tiene cuenta abierta en el servidor (todavía: puede existir solo en este equipo)
    queryFn:  () => api.get(`/berlin/mesas/${mesa.id}/orden`).then(r => r.data as Orden)
      .catch((e: { response?: { status?: number } }) => { if (e?.response?.status === 404) return null; throw e }),
    refetchInterval: 4_000,
  })
  const orden = useMemo(
    // Sin dato propio de la cuenta aún (abierta o trasladada sin conexión) se parte del tablero
    () => ordenParaMesa(ordenSrv ?? mesa.orden_activa ?? null, opsTodas, mesa.id),
    [ordenSrv, mesa.orden_activa, opsTodas, mesa.id],
  )
  const loadOrden = loadOrdenSrv && !orden

  // Cuenta al instante de tocar (incluye lo que se acaba de agregar y aún no se pinta), para
  // que dos toques seguidos no se pisen.
  const ordenFresca = (): Orden | null => {
    const srv = qc.getQueryData<Orden | null>(['mesa-orden', mesa.id])
    return ordenParaMesa(srv ?? mesa.orden_activa ?? null, cargarOps(), mesa.id)
  }
  const baseOp = (o: Orden) => ({ mesa_id: mesa.id, mesa_numero: mesa.numero, orden_id: o.id })

  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos-mesa'],
    queryFn:  () => api.get('/berlin/productos', { params: { limit: 1000 } }).then(r => r.data),
    staleTime: 30_000,
  })

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['categorias'],
    queryFn:  () => api.get('/berlin/categorias').then(r => r.data),
  })

  const { data: clientesTodos = [] } = useQuery<{id:string;nombre:string}[]>({
    queryKey: ['clientes-mesa'],
    queryFn:  () => api.get('/berlin/clientes', { params: { limit: 2000 } }).then(r => r.data),
    enabled:  metodoPago === 'credito',
  })
  const clientes = useMemo(
    () => buscandoCli.trim()
      ? clientesTodos.filter(c => coincide(buscandoCli, c.nombre))
      : clientesTodos,
    [clientesTodos, buscandoCli],
  )

  const agregarProd = (payload: { producto_id: string; cantidad: number; precio_unitario?: number; nombre_libre?: string; notas?: string }) => {
    const o = ordenFresca()
    if (!o) { toast.error('Esta mesa no tiene una cuenta abierta'); return }
    const prod = productos.find(x => x.id === payload.producto_id)
    if (!prod) { toast.error('Producto no disponible'); return }
    const qty    = Number(payload.cantidad) || 1
    // El precio es el que ve el cliente en pantalla (Venta Libre trae el suyo)
    const precio = payload.precio_unitario ? Number(payload.precio_unitario) : Number(prod.precio_venta)
    // Igual que el servidor: la Venta Libre lleva su nombre en la nota, con prefijo
    const notasFinal = payload.nombre_libre
      ? `[${payload.nombre_libre.trim()}]${payload.notas ? ' ' + payload.notas.trim() : ''}`
      : (payload.notas?.trim() || null)

    // Un producto = una línea con cantidad: si ya hay una igual (mismo precio y nota) que aún no
    // se envió a las estaciones, se le suma; una línea ya enviada nunca se toca.
    const igual = o.items.find(i => i.producto?.id === payload.producto_id
      && Number(i.precio_unitario) === precio && (i.notas ?? null) === notasFinal
      && !i.enviado_at && !i.venta_id)
    if (igual) {
      encolarOp(nuevaOp('cantidad', baseOp(o), {
        item_id: igual.id, delta: qty, cantidad_final: Number(igual.cantidad) + qty,
      }))
    } else {
      encolarOp(nuevaOp('agregar', baseOp(o), {
        item_id: crypto.randomUUID(), producto_id: prod.id, cantidad: qty, precio_unitario: precio, notas: notasFinal,
        producto: {
          id: prod.id, nombre: prod.nombre, imagen_url: prod.imagen_url,
          precio_venta: Number(prod.precio_venta), unidad_venta: prod.unidad_venta,
        },
      }))
    }
  }

  // ── Jugos/Limonadas/Aromáticas — mismo modal Sabor(+Base) que POS.tsx.
  // Detección de categoría por nombre normalizado, no por ID fijo. La base (Agua/Leche) se
  // deriva del NOMBRE DEL PRODUCTO, no de en qué categoría vive — si el cliente renombra o
  // fusiona "Jugos en Agua"/"Jugos en Leche" en una sola categoría "Jugos", sigue funcionando
  // (bug real 2026-09-16: se rompió al renombrar). Ver POS.tsx para el detalle.
  const idsJugos      = useMemo(() => new Set(
    categorias.filter(c => normalizar(c.nombre).includes('jugo')).map(c => c.id)
  ), [categorias])
  const idsLimonadas  = useMemo(() => new Set(
    categorias.filter(c => normalizar(c.nombre).includes('limonada')).map(c => c.id)
  ), [categorias])

  interface SaborJugo { sabor: string; agua?: Producto; leche?: Producto }
  const saboresJugos = useMemo(() => {
    const map = new Map<string, SaborJugo>()
    productos.forEach(p => {
      if (!idsJugos.has(p.categoria_id ?? '')) return
      const palabras = p.nombre.trim().split(/\s+/)
      const ultima   = normalizar(palabras[palabras.length - 1])
      const enAgua   = ultima === 'agua'
      const enLeche  = ultima === 'leche'
      const sabor    = (enAgua || enLeche) ? palabras.slice(0, -1).join(' ') : p.nombre
      const key      = normalizar(sabor)
      const entry    = map.get(key) ?? { sabor }
      if (enAgua)              entry.agua  = p
      if (enLeche)             entry.leche = p
      if (!enAgua && !enLeche) { entry.agua = p; entry.leche = p } // producto único sin variante — disponible bajo cualquier base
      map.set(key, entry)
    })
    return Array.from(map.values()).sort((a, b) => a.sabor.localeCompare(b.sabor))
  }, [productos, idsJugos])

  const saboresLimonada = useMemo(
    () => productos.filter(p => idsLimonadas.has(p.categoria_id ?? '')).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos, idsLimonadas],
  )

  const saboresAromaticas = useMemo(
    () => productos.filter(p => normalizar(p.nombre).startsWith('aromatica')).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos],
  )

  const [modalVariante, setModalVariante] = useState<{
    grupo:    'jugo' | 'limonada' | 'aromatica'
    saborKey: string | null
    base:     'agua' | 'leche' | null
    cantidad: string
  } | null>(null)

  // Igual que agregarProd, pero con cantidad exacta (no +1) — usado por el modal
  const agregarConCantidad = (p: Producto, cantidad: number) => agregarProd({ producto_id: p.id, cantidad })

  const confirmarModalVariante = () => {
    if (!modalVariante) return
    const cantidad = parseInt(modalVariante.cantidad) || 1
    const producto = modalVariante.grupo === 'jugo'
      ? saboresJugos.find(s => normalizar(s.sabor) === modalVariante.saborKey)?.[
          modalVariante.base === 'leche' ? 'leche' : 'agua'
        ]
      : (modalVariante.grupo === 'aromatica' ? saboresAromaticas : saboresLimonada)
          .find(p => p.id === modalVariante.saborKey)
    if (!producto) { toast.error('Selecciona sabor y presentación'); return }
    agregarConCantidad(producto, cantidad)
    setModalVariante(null)
  }

  const handleClickProducto = (p: Producto) => {
    if (Number(p.precio_venta) === 1 && p.nombre.toLowerCase().includes('venta libre')) {
      setVentaLibreModal({ producto: p, nombre: p.nombre, precio: '', cantidad: '1' })
      return
    }
    // Comida: preguntar antes si va completo o modificado
    if (idsComida.has(p.categoria_id ?? '')) { setModalComida(p); return }
    agregarProd({ producto_id: p.id, cantidad: 1 })
  }

  // ── Comida — "¿completo o modificar?" (mismo modal que POS) ──
  // Toppings y salsas son solo las OPCIONES: la modificación viaja como nota del ítem
  // (el backend ya la guarda, la agrupa por nota y la comanda ya la imprime).
  const idsComida = useMemo(() => new Set(
    categorias.filter(c => esCategoriaComida(c.nombre)).map(c => c.id)
  ), [categorias])
  const nombresToppings = useMemo(() => {
    const ids = new Set(categorias.filter(c => esCategoriaToppings(c.nombre)).map(c => c.id))
    return productos.filter(p => ids.has(p.categoria_id ?? '')).map(p => p.nombre).sort((a, b) => a.localeCompare(b))
  }, [categorias, productos])
  const nombresSalsas = useMemo(() => {
    const ids = new Set(categorias.filter(c => esCategoriaSalsas(c.nombre)).map(c => c.id))
    return productos.filter(p => ids.has(p.categoria_id ?? '')).map(p => p.nombre).sort((a, b) => a.localeCompare(b))
  }, [categorias, productos])
  const [modalComida, setModalComida] = useState<Producto | null>(null)

  const confirmarVentaLibre = () => {
    if (!ventaLibreModal) return
    const precio   = parseFloat(ventaLibreModal.precio.replace(/\./g, '').replace(',', '.'))
    const cantidad = parseInt(ventaLibreModal.cantidad) || 1
    if (!precio || precio <= 0) { toast.error('Ingresa un precio válido'); return }
    agregarProd({
      producto_id:    ventaLibreModal.producto.id,
      cantidad,
      precio_unitario: precio,
      nombre_libre:   ventaLibreModal.nombre.trim() || ventaLibreModal.producto.nombre,
    })
    setVentaLibreModal(null)
  }

  const quitarItem = (itemId: string) => {
    const o = ordenFresca()
    const it = o?.items.find(i => i.id === itemId)
    if (!o || !it) return
    if (it.venta_id) { toast.error('Este producto ya fue cobrado — no se puede quitar.'); return }
    encolarOp(nuevaOp('quitar', baseOp(o), { item_id: itemId }))
    // Si con esto se acaba lo pendiente de una cuenta ya cobrada en parte, el servidor la cierra al
    // sincronizar y la mesa queda libre (la pantalla vuelve al tablero sola).
  }

  const actualizarCantidad = ({ itemId, cantidad }: { itemId: string; cantidad: number }) => {
    const o = ordenFresca()
    const it = o?.items.find(i => i.id === itemId)
    if (!o || !it) return
    if (it.venta_id) { toast.error('Este producto ya fue cobrado — no se puede modificar.'); return }
    if (cantidad < 1) { quitarItem(itemId); return }
    const delta = cantidad - Number(it.cantidad)
    if (!delta) return
    encolarOp(nuevaOp('cantidad', baseOp(o), { item_id: itemId, delta, cantidad_final: cantidad }))
  }

  // Estado "Servido" manual (Fase E) — lo marca quien atiende la mesa al entregar el
  // producto al cliente, independiente de "Preparado" (que es cocina/barra terminando
  // de cocinarlo/servirlo en Comandas). Se guarda como operación local (funciona sin conexión);
  // el valor es absoluto: si ya estaba servido, este toque lo desmarca (por si fue un error).
  const marcarServido = (itemId: string) => {
    const o = ordenFresca()
    const it = o?.items.find(i => i.id === itemId)
    if (!o || !it) return
    if (it.venta_id) { toast.error('Este producto ya fue cobrado.'); return }
    encolarOp(nuevaOp('servido', baseOp(o), { item_id: itemId, servido: !it.servido_at }))
  }

  const enviando = false
  const enviarPedido = () => {
    const o = ordenFresca()
    const nuevos = (o?.items ?? []).filter(i => !i.enviado_at && !i.venta_id)
    if (!o || !nuevos.length) {
      toast.error('No hay productos nuevos para enviar — ya se mandaron todos a las estaciones.')
      return
    }
    encolarOp(nuevaOp('enviar', baseOp(o), { item_ids: nuevos.map(i => i.id) }))
    toast.success(hayInternet()
      ? '✅ Pedido enviado al cajero'
      : '📶 Pedido guardado — llegará a cocina cuando vuelva la conexión', { duration: 6000 })
    onVolver()
  }

  // Foto de TODO lo que se cobra, tomada al pulsar "Cobrar": la respuesta llega después y
  // el polling de la orden (cada 4 s) puede haber cambiado los datos vivos entretanto.
  interface CobroSnap {
    key:        string
    ordenId?:   string                                    // pedido que se cobra (sobrevive a un traslado de mesa)
    parcial:    boolean                                   // true = dividir cuenta (se manda items[])
    items?:     { item_id: string; cantidad: number }[]
    ticketItems: { nombre: string; cantidad: number; precio_unitario: number; subtotal: number; notas?: string | null }[]
    subtotal:   number
    redondeo:   number
    total:      number
    metodo:     string
    clienteId?: string
    efectivoNum: number
    cambio:     number
    mixtoEfe:   number
    mixtoTra:   number
  }

  const armarCobro = (): CobroSnap => {
    const parcial = modoDividir
    const ticketItems = parcial
      ? selItems.map(x => ({
          nombre:          x.item.producto?.nombre ?? 'Producto',
          cantidad:        x.cant,
          precio_unitario: x.item.precio_unitario,
          subtotal:        x.cant === Number(x.item.cantidad) ? x.item.subtotal : x.item.precio_unitario * x.cant,
          notas:           x.item.notas,
        }))
      : items.map(i => ({
          nombre:          i.producto?.nombre ?? 'Producto',
          cantidad:        i.cantidad,
          precio_unitario: i.precio_unitario,
          subtotal:        i.subtotal,
          notas:           i.notas,
        }))
    // Con cobros guardados sin conexión en la cola, "cobrar todo" NO puede mandarse sin
    // items (el servidor cobraría también las unidades reservadas por la cola): se manda
    // explícito lo que queda libre en pantalla.
    const explicito = parcial || colaCobros.length > 0
    return {
      key:      cobrarKey,
      ordenId:  orden?.id,
      parcial,
      items:    parcial
        ? selItems.map(x => ({ item_id: x.item.id, cantidad: x.cant }))
        : explicito ? items.map(i => ({ item_id: i.id, cantidad: Number(i.cantidad) })) : undefined,
      ticketItems,
      subtotal: total,
      redondeo: redond,
      total:    totalFinal,
      metodo:   metodoPago === 'exacto' ? 'efectivo' : metodoPago,
      clienteId: metodoPago === 'credito' ? clienteId || undefined : undefined,
      efectivoNum, cambio,
      mixtoEfe: mixtoEfeNum, mixtoTra: mixtoTraNum,
    }
  }

  const payloadDe = (s: CobroSnap) => ({
    metodo_pago:     s.metodo,
    cliente_id:      s.clienteId,
    caja_id:         cajaId || undefined,
    redondeo:        s.redondeo,
    idempotency_key: s.key,
    orden_id:        s.ordenId,
    monto_efectivo:      s.metodo === 'mixto' ? s.mixtoEfe : undefined,
    monto_transferencia: s.metodo === 'mixto' ? s.mixtoTra : undefined,
    items:           s.items,
  })

  // Escritura previa (write-ahead): el cobro se guarda en la cola local ANTES de enviarlo y solo
  // sale de la cola cuando el servidor confirma Y la pantalla ya refrescó la orden. Un corte de
  // internet o un cierre brusco a mitad del envío no lo pierde: al reabrir se reenvía solo (la
  // idempotency_key evita cobrar dos veces si el servidor sí lo había procesado).
  const { mutate: cobrarMutate, isPending: cobrando } = useMutation({
    mutationFn: async (s: CobroSnap) => {
      onMarkInFlight(s.key, true)
      onEnqueueCobro({
        idempotency_key: s.key,
        mesa_id:         mesa.id,
        mesa_numero:     mesa.numero,
        orden_id:        s.ordenId,
        payload:         payloadDe(s),
        queued_at:       Date.now(),
        total:           s.total,
      })
      try {
        // Sin conexión con el servidor: el cobro (ya guardado arriba) se queda en la cola
        if (!hayInternet()) throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
        // La cuenta (o sus productos) puede existir solo en este equipo todavía: primero se
        // sincroniza; si no se logra, el cobro se queda guardado y sale después, en orden.
        if (hayOpsPendientes(s.ordenId ?? null, mesa.id)) {
          await sincronizarOpsMesas()
          if (hayOpsPendientes(s.ordenId ?? null, mesa.id)) throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
        }
        return await api.post(`/berlin/mesas/${mesa.id}/cobrar`, payloadDe(s), { timeout: COBRO_TIMEOUT_MS })
      } catch (err) {
        // Fallo pasajero o sesión vencida: el cobro se queda en la cola. Un rechazo real del
        // servidor se ve al instante en pantalla: se saca de la cola para que el cajero corrija.
        if (!isTransientError(err) && !isAuthError(err)) onDequeueCobro(s.key)
        onMarkInFlight(s.key, false)
        throw err
      }
      // En éxito sigue "en vuelo" hasta sacarlo de la cola (onSuccess), para que la sincronización
      // en segundo plano no lo reenvíe mientras la pantalla refresca la orden.
    },
    onSuccess: (res, s) => {
      // Sacar de la cola SOLO tras refrescar la orden: mientras esté en la cola sus unidades se
      // restan de "pendiente" en pantalla; si se saca antes, reaparecerían como cobrables.
      void Promise.all([
        qc.refetchQueries({ queryKey: ['mesa-orden'] }),
        qc.refetchQueries({ queryKey: ['mesas'] }),
      ]).finally(() => { onDequeueCobro(s.key); onMarkInFlight(s.key, false) })
      const liberada = res.data.mesa_liberada === true
      const sinInfo  = res.data.mesa_liberada === undefined   // respuesta repetida (idempotencia)
      const pendiente = Number(res.data.total_pendiente ?? 0)
      toast.success(liberada || (sinInfo && !s.parcial)
        ? `¡Cobrado! ${fmt(res.data.venta.total)}`
        : `¡Cobrado ${fmt(res.data.venta.total)}! Faltan ${fmt(pendiente)} por cobrar`)
      qc.invalidateQueries({ queryKey: ['mesas'] })
      qc.invalidateQueries({ queryKey: ['mesa-orden', mesa.id] })
      qc.invalidateQueries({ queryKey: ['ventas-resumen-hoy'] })
      // Imprimir ticket de mesa (solo lo cobrado en ESTE cobro)
      imprimirTicketMesa({
        numero_venta: res.data.venta.numero_venta ?? res.data.venta.id?.slice(0,8).toUpperCase(),
        mesa_numero:  mesa.numero,
        mesa_nombre:  mesa.nombre ?? null,
        mesero:       mesero ? `${mesero.nombre}` : undefined,
        items:        s.ticketItems,
        subtotal:          s.subtotal,
        redondeo:          s.redondeo,
        total:             s.total,
        metodo_pago:       s.metodo,
        efectivo_recibido: s.metodo === 'efectivo' && s.efectivoNum > 0 ? s.efectivoNum : undefined,
        cambio:            s.metodo === 'efectivo' && s.efectivoNum > 0 ? s.cambio : undefined,
        mixto_efectivo:      s.metodo === 'mixto' ? s.mixtoEfe : undefined,
        mixto_transferencia: s.metodo === 'mixto' ? s.mixtoTra : undefined,
        parcial:           !liberada && (s.parcial || !sinInfo),
      })
      if (liberada || (sinInfo && !s.parcial)) { onVolver(); return }
      // La mesa sigue abierta — limpiar y dejar listo el siguiente cobro
      reiniciarTrasCobro()
    },
    onError: (err: unknown, s: CobroSnap) => {
      const e = err as { response?: { data?: { error?: string } } }
      if (isAuthError(err)) {
        toast('🔒 Sesión vencida — el cobro quedó guardado; se enviará al iniciar sesión de nuevo', { icon: '⏳', duration: 8000 })
        if (s.items) reiniciarTrasCobro(); else onVolver()
        return
      }
      if (isTransientError(err)) {
        // Sin conexión: el cobro (completo o parcial) YA está en la cola local (escritura previa)
        // con su propia key; se imprime un comprobante PROVISIONAL (la factura la numera el
        // servidor al sincronizar) y sus unidades quedan reservadas en pantalla hasta que se registre.
        const provisional = `PROV-${s.key.slice(0, 6).toUpperCase()}`
        onPatchCobro(s.key, { provisional })
        imprimirTicketMesa({
          numero_venta: provisional,
          mesa_numero:  mesa.numero,
          mesa_nombre:  mesa.nombre ?? null,
          mesero:       mesero ? `${mesero.nombre}` : undefined,
          items:        s.ticketItems,
          subtotal:          s.subtotal,
          redondeo:          s.redondeo,
          total:             s.total,
          metodo_pago:       s.metodo,
          efectivo_recibido: s.metodo === 'efectivo' && s.efectivoNum > 0 ? s.efectivoNum : undefined,
          cambio:            s.metodo === 'efectivo' && s.efectivoNum > 0 ? s.cambio : undefined,
          mixto_efectivo:      s.metodo === 'mixto' ? s.mixtoEfe : undefined,
          mixto_transferencia: s.metodo === 'mixto' ? s.mixtoTra : undefined,
          parcial:           s.parcial,
          provisional:       true,
        })
        toast('📶 Sin conexión — cobro guardado; se registrará al reconectar', { icon: '⏳', duration: 6000 })
        if (s.items) reiniciarTrasCobro()   // parcial o explícito: seguir en la mesa
        else onVolver()
      } else {
        toast.error(e.response?.data?.error || 'Error al cobrar')
      }
    },
  })

  const cobrar = () => cobrarMutate(armarCobro())

  // Deja la pantalla lista para el siguiente cobro de la misma mesa
  const reiniciarTrasCobro = () => {
    setShowCobrar(false)
    setSeleccion({})
    setMetodoPago('efectivo'); setEfectivoRecibido(''); setMixtoEfectivo(''); setMixtoTransferencia('')
    setClienteId(''); setBuscandoCli('')
    setCobrarKey(crypto.randomUUID())
  }

  // Cancelar la cuenta y liberar la mesa: operación local (el servidor comprueba quién puede y que
  // no haya cobros parciales; si la rechaza, queda el aviso rojo con el motivo).
  const cancelar = () => {
    const o = ordenFresca()
    if (!o) return
    encolarOp(nuevaOp('cancelar', baseOp(o)))
    toast(hayInternet() ? 'Orden cancelada' : '📶 Orden cancelada — se registrará al reconectar')
    onVolver()
  }

  // Cambiar el pedido a otra mesa libre — el backend solo cambia la mesa de la orden; ítems,
  // estados (enviado/servido/cobrado), mesero y total viajan intactos. Funciona sin conexión.
  const trasladando = false
  const trasladar = (destino: Mesa) => {
    const o = ordenFresca()
    if (!o) return
    encolarOp(nuevaOp('trasladar', baseOp(o), { destino_id: destino.id, destino_numero: destino.numero }))
    toast.success(`Pedido trasladado a ${destino.nombre ? `${destino.numero} — ${destino.nombre}` : `Mesa ${destino.numero}`}`
      + (hayInternet() ? '' : ' (se registrará al reconectar)'))
    setShowTrasladar(false)
    onTrasladada(destino, o.id, mesa.id)
  }

  // Cobro parcial: `items` = solo lo PENDIENTE de cobro; lo ya cobrado (venta_id) va aparte.
  // Cobros guardados de ESTE pedido: por orden_id (sobreviven a un traslado de mesa) y, los
  // guardados antes de esta versión (sin orden_id), por la mesa.
  const colaCobros = colaTodos.filter(c => c.orden_id ? c.orden_id === orden?.id : c.mesa_id === mesa.id)

  const itemsTodos     = orden?.items ?? []
  const itemsSrv       = itemsTodos.filter(i => !i.venta_id)   // pendientes según el servidor
  const itemsPagados   = itemsTodos.filter(i => !!i.venta_id)
  const totalPagado    = itemsPagados.reduce((s, i) => s + Number(i.subtotal), 0)

  // Modo sin conexión: las unidades de cobros guardados en la cola local (todavía no
  // registrados en el servidor) se restan de lo pendiente, para que nadie las vuelva a
  // cobrar. Un cobro encolado SIN items = cobro completo de la mesa → todo reservado.
  const reservado: Record<string, number> = {}
  let todoEnCola = false
  for (const c of colaCobros) {
    if (c.payload.items) for (const x of c.payload.items) reservado[x.item_id] = (reservado[x.item_id] ?? 0) + Number(x.cantidad)
    else todoEnCola = true
  }
  const items: ItemLocal[] = todoEnCola ? [] : itemsSrv
    .map((i): ItemLocal => {
      const r = Math.min(reservado[i.id] ?? 0, Number(i.cantidad))
      if (!r) return i
      const cant = Number(i.cantidad) - r
      return { ...i, cantidad: cant, subtotal: Number(i.precio_unitario) * cant, _reservado: r }
    })
    .filter(i => Number(i.cantidad) > 0)
  const totalCola = colaCobros.reduce((s, c) => s + Number(c.total ?? 0), 0)
  const totalPendiente = items.reduce((s, i) => s + Number(i.subtotal), 0)

  // Dividir cuenta: unidades elegidas por línea (acotadas a la cantidad vigente de la línea)
  const selItems = items
    .map(i => ({ item: i, cant: Math.min(seleccion[i.id] ?? 0, Number(i.cantidad)) }))
    .filter(x => x.cant > 0)
  const subtotalSel = selItems.reduce((s, x) =>
    s + (x.cant === Number(x.item.cantidad) ? Number(x.item.subtotal) : Number(x.item.precio_unitario) * x.cant), 0)
  const selListo = selItems.length > 0 && selItems.every(x => x.item.enviado_at && x.item.servido_at)
  const selFaltaEnviar = selItems.some(x => !x.item.enviado_at)

  // `total`/`redond`/`totalFinal` = lo que se cobra AHORA: la selección de la ventana
  // "Dividir cuenta" (modoDividir = ventana abierta), o todo lo pendiente si se cobra
  // desde el carrito. El modal de cobro y el ticket leen de acá.
  const total      = modoDividir ? subtotalSel : totalPendiente
  const redond     = redondear(total) - total
  const totalFinal = total + redond
  // Lo del carrito lateral es siempre "todo lo pendiente", esté o no abierta la ventana.
  const redondCarrito      = redondear(totalPendiente) - totalPendiente
  const totalFinalCarrito  = totalPendiente + redondCarrito
  const mesero     = mesa.orden_activa?.mesero

  // Aviso "lista para cobrar" — cuando el último ítem enviado queda servido, avisa
  // una sola vez (toast) y resalta el botón Cobrar mientras siga en ese estado. Si
  // llega un pedido nuevo (vuelve a haber algo sin servir) el resaltado se apaga
  // solo, y si se completa de nuevo, vuelve a avisar.
  const enviadosOrden = items.filter(i => i.enviado_at)
  const todoServidoOrden = enviadosOrden.length > 0 && enviadosOrden.every(i => i.servido_at)
  // Cobrar solo si TODO lo que hay en el carrito ya se envió Y se sirvió — evita
  // cobrar una cuenta con algo pendiente en cocina/barra o sin enviar todavía.
  // (En la ventana "Dividir cuenta" el candado aplica solo a lo seleccionado: selListo.)
  const listoParaCobrar = items.length > 0 && items.every(i => i.enviado_at && i.servido_at)
  const faltaPorEnviar  = items.some(i => !i.enviado_at)
  const todoServidoAntesRef = useRef(false)
  const [resaltarCobrar, setResaltarCobrar] = useState(false)
  useEffect(() => {
    if (todoServidoOrden && !todoServidoAntesRef.current) {
      toast.success('✅ Todo servido — mesa lista para cobrar', { duration: 6000 })
      setResaltarCobrar(true)
    }
    if (!todoServidoOrden) setResaltarCobrar(false)
    todoServidoAntesRef.current = todoServidoOrden
  }, [todoServidoOrden])

  // Sin nada pendiente ya no hay qué dividir
  useEffect(() => {
    if (modoDividir && items.length === 0) { setModoDividir(false); setSeleccion({}) }
  }, [modoDividir, items.length])

  // Si la mesa se libera mientras se está en su pantalla (por ejemplo, al sincronizar un
  // cobro guardado sin conexión que cerraba la cuenta), volver al tablero.
  const estadoMesaPrevRef = useRef(mesa.estado)
  useEffect(() => {
    if (estadoMesaPrevRef.current === 'ocupada' && mesa.estado === 'libre') {
      toast.success('Mesa saldada y liberada')
      onVolver()
    }
    estadoMesaPrevRef.current = mesa.estado
  }, [mesa.estado, onVolver])
  // Cancelar orden: solo quien tomó la mesa o un admin — mismo criterio que el backend
  // (antes cualquier cajero podía cancelar la orden de cualquier mesa, hueco real).
  const nombrePropioCancel = user?.apellido ? `${user.nombre} ${user.apellido}` : user?.nombre ?? ''
  const puedeCancelar = ROLES_ADMIN_MESA.includes(user?.rol ?? '')
    || !mesero || mesero.usuario_id === user?.id
    || (!mesero.usuario_id && !!nombrePropioCancel && mesero.nombre === nombrePropioCancel)
  const efectivoNum = parseInt(efectivoRecibido.replace(/\D/g, '') || '0', 10)
  const cambio     = efectivoNum > totalFinal ? efectivoNum - totalFinal : 0
  const mixtoEfeNum = parseInt(mixtoEfectivo.replace(/\D/g, '') || '0', 10)
  const mixtoTraNum = parseInt(mixtoTransferencia.replace(/\D/g, '') || '0', 10)
  const mixtoSuma   = mixtoEfeNum + mixtoTraNum
  const mixtoValido = Math.abs(mixtoSuma - totalFinal) <= 1

  // Mostrar todos los productos; productos con stock=0 y tipo=receta quedan deshabilitados
  const catNameMap = useMemo(() => new Map(categorias.map(c => [c.id, c.nombre])), [categorias])
  const prodsFiltrados = useMemo(() => {
    let list = productos
    if (catActiva) list = list.filter(p => p.categoria_id === catActiva)
    if (busqueda.trim())
      list = list.filter(p => coincide(busqueda, p.nombre, p.codigo_barras, catNameMap.get(p.categoria_id ?? '')))
    return list
  }, [productos, catActiva, busqueda, catNameMap])

  // Enter → ejecutar cobrar cuando el modal está abierto
  useEffect(() => {
    const onEnter = (e: KeyboardEvent) => {
      if (!showCobrar || e.key !== 'Enter') return
      e.preventDefault()
      const canCobrar = !cobrando
        && !(metodoPago === 'credito' && !clienteId)
        && !(metodoPago === 'efectivo' && efectivoNum > 0 && efectivoNum < totalFinal)
        && !(metodoPago === 'mixto' && !mixtoValido)
      if (canCobrar) cobrar()
    }
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
  }, [showCobrar, metodoPago, cobrando, clienteId, efectivoNum, totalFinal, mixtoValido, cobrar])

  return (
    <>
    <div className="flex flex-col h-[calc(100dvh-120px)] min-h-0 overflow-hidden">
      {/* Header mesa */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-shrink-0">
        <button onClick={onVolver}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-navy border border-white/10 text-gray-400 hover:text-white">
          <ChevronLeft size={18}/>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold truncate">Mesa {mesa.numero}{mesa.nombre ? ` — ${mesa.nombre}` : ''}</p>
          {mesero && (
            <p className="text-xs flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ background: mesero.color }}/>
              <span className="text-gray-400">{mesero.nombre}</span>
            </p>
          )}
        </div>
        {orden && (
          <button onClick={() => setShowTrasladar(true)}
            className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-white px-3 py-1.5 rounded-lg border border-brand-teal/30 hover:bg-brand-teal/10 transition-colors">
            <RefreshCw size={12}/> <span className="hidden sm:inline">Cambiar de mesa</span><span className="sm:hidden">Mover</span>
          </button>
        )}
        {puedeCancelar && itemsPagados.length === 0 && colaCobros.length === 0 && (
          <button onClick={() => { if(confirm('¿Cancelar la orden y liberar la mesa?')) cancelar() }}
            className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10">
            <span className="hidden sm:inline">Cancelar orden</span><span className="sm:hidden">Cancelar</span>
          </button>
        )}
      </div>

      {/* Celular: pestañas Catálogo / Pedido */}
      {esMovil && (
        <div className="flex border-b border-white/10 bg-brand-navy rounded-t-xl flex-shrink-0 mb-2">
          {([['catalogo', 'Catálogo'], ['pedido', 'Pedido']] as const).map(([k, etiqueta]) => (
            <button key={k} onClick={() => setVistaMovil(k)}
              className={cn(
                'flex-1 py-3 text-sm font-semibold transition-colors relative',
                vistaMovil === k ? 'text-[#EA580C] border-b-2 border-[#EA580C]' : 'text-gray-500 hover:text-white',
              )}>
              {etiqueta}
              {k === 'pedido' && items.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#EA580C] text-white text-[10px] font-bold">
                  {items.length} · {fmt(totalPendiente)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* ── Panel izquierdo: catálogo ── */}
        <div className={cn('flex flex-col flex-1 min-w-0 gap-2', esMovil && vistaMovil === 'pedido' && 'hidden')}>
          {/* Búsqueda */}
          <div className="relative flex-shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full bg-brand-navy border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white
                         placeholder:text-gray-600 focus:outline-none focus:border-brand-teal/50"/>
          </div>

          {/* Categorías */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-shrink-0 scrollbar-hide">
            <button onClick={() => setCatActiva(null)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0',
                !catActiva ? 'bg-brand-teal text-brand-dark' : 'bg-brand-navy text-gray-400 hover:text-white border border-white/10')}>
              Todos
            </button>
            {categorias.map(c => {
              const esJugo      = idsJugos.has(c.id)
              const esLimonada  = idsLimonadas.has(c.id)
              const esAromatica = normalizar(c.nombre).includes('aromatica')
              const onClickCat = () => {
                if (esJugo)      { setModalVariante({ grupo: 'jugo', saborKey: null, base: null, cantidad: '1' }); return }
                if (esLimonada)  { setModalVariante({ grupo: 'limonada', saborKey: null, base: null, cantidad: '1' }); return }
                if (esAromatica) { setModalVariante({ grupo: 'aromatica', saborKey: null, base: null, cantidad: '1' }); return }
                setCatActiva(catActiva === c.id ? null : c.id)
              }
              return (
                <button key={c.id} onClick={onClickCat}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0',
                    catActiva === c.id ? 'bg-brand-teal text-brand-dark' : 'bg-brand-navy text-gray-400 hover:text-white border border-white/10')}>
                  {c.emoji} {c.nombre}
                </button>
              )
            })}
          </div>

          {/* Grid productos */}
          <div className="flex-1 overflow-y-auto touch-pan-y overscroll-contain">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {prodsFiltrados.map(p => {
                const sinStock = (p.origen === 'receta' || p.categoria?.sin_stock_control)
                  ? false
                  : p.stock_actual <= 0
                return (
                  <button key={p.id}
                    onClick={() => !sinStock && handleClickProducto(p)}
                    disabled={sinStock}
                    className={cn(
                      'rounded-xl p-3 border transition-all text-left min-h-[80px] flex flex-col justify-between',
                      sinStock
                        ? 'bg-brand-dark border-white/5 opacity-40 cursor-not-allowed'
                        : 'bg-brand-navy border-white/5 hover:border-brand-teal/40 hover:bg-white/3 active:scale-95'
                    )}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-brand-teal/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {p.imagen_url && !isEmoji(p.imagen_url)
                          ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover"/>
                          : <span className="text-base">{p.imagen_url || '🍞'}</span>
                        }
                      </div>
                      <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{p.nombre}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-brand-teal">{fmt(p.precio_venta)}</p>
                      {sinStock && <span className="text-[9px] text-red-400 font-medium">Agotado</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Handle redimensionable (horizontal) — solo con mouse ── */}
        {!esMovil && <div
          onMouseDown={e => {
            e.preventDefault()
            isDragging.current  = true
            dragStartX.current  = e.clientX
            dragStartW.current  = panelWidth
            document.body.style.cursor     = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
          className="w-1.5 flex-shrink-0 rounded-full bg-white/5 hover:bg-[#EA580C]/60 active:bg-[#EA580C] cursor-col-resize transition-colors"
          title="Arrastra para ajustar el ancho del panel"
        />}

        {/* ── Panel derecho: carrito (idéntico al POS) ── */}
        <div className={cn(
            'flex flex-col bg-brand-navy border border-white/5 rounded-xl min-h-0',
            esMovil ? (vistaMovil === 'pedido' ? 'flex-1 w-full min-w-0' : 'hidden') : 'flex-shrink-0',
          )}
          style={esMovil ? undefined : { width: panelWidth }}>
          {/* Cabecera carrito */}
          <div className="px-3 py-2.5 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Orden</p>
            <p className="text-xs text-gray-500">{items.length} prod.</p>
          </div>

          {/* Items — estilo POS */}
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0 touch-pan-y overscroll-contain">
            {loadOrden && <p className="text-xs text-gray-600 text-center py-4">Cargando…</p>}
            {!loadOrden && items.length === 0 && itemsPagados.length === 0 && colaCobros.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-700 py-8">
                <LayoutGrid size={32} className="opacity-15"/>
                <p className="text-xs text-gray-600">Toca un producto para agregarlo</p>
              </div>
            )}
            <div className="divide-y divide-white/5">
              {items.map(item => {
                const pendienteServir = !!item.enviado_at && !item.servido_at
                return (
                <div key={item.id}
                  className={cn('flex items-center gap-2 py-2.5 pl-1.5 -ml-1.5',
                    pendienteServir ? 'border-l-2 border-[#EA580C]/60' : '')}>
                  {/* Mini ícono */}
                  <MiniIconMesa
                    nombre={item.producto?.nombre ?? ''}
                    imagenUrl={item.producto?.imagen_url}
                  />
                  {/* Nombre + precio unit */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white leading-snug line-clamp-2">
                      {item.producto?.nombre ?? '—'}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {fmt(item.precio_unitario)} c/u
                      {item._reservado ? <span className="text-amber-400"> · {item._reservado} en cola de cobro</span> : null}
                    </p>
                    {item.notas && (
                      <p className="text-[10px] font-semibold text-[#D9A652] mt-0.5 leading-snug break-words">✎ {item.notas}</p>
                    )}
                  </div>
                  {/* +/- cantidad */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      disabled={!!item._reservado}
                      onClick={() => {
                        if (item.cantidad <= 1) quitarItem(item.id)
                        else actualizarCantidad({ itemId: item.id, cantidad: item.cantidad - 1 })
                      }}
                      className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/12 active:scale-[0.90] disabled:opacity-30
                                 flex items-center justify-center text-gray-300 transition-all select-none">
                      <Minus size={10}/>
                    </button>
                    <span className="w-5 text-center text-white font-bold text-xs tabular-nums">
                      {item.cantidad}
                    </span>
                    <button
                      disabled={!!item._reservado}
                      onClick={() => actualizarCantidad({ itemId: item.id, cantidad: item.cantidad + 1 })}
                      className="w-6 h-6 rounded-lg bg-white/5 hover:bg-[#EA580C]/20 active:scale-[0.90] disabled:opacity-30
                                 flex items-center justify-center text-gray-300 hover:text-[#EA580C]
                                 transition-all select-none">
                      <Plus size={10}/>
                    </button>
                  </div>
                  {/* Subtotal + eliminar */}
                  <div className="text-right flex-shrink-0 min-w-[44px] flex flex-col items-end gap-0.5">
                    <p className="text-xs font-bold text-white tabular-nums">{fmt(item.subtotal)}</p>
                    {item.enviado_at && (
                      <button
                        title={item.servido_at ? 'Marcar como pendiente por servir' : 'Marcar como servido'}
                        onClick={() => marcarServido(item.id)}
                        className={cn('flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded-md transition-colors',
                          item.servido_at
                            ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                            : 'bg-[#EA580C]/15 text-[#EA580C] hover:bg-[#EA580C]/25')}>
                        <Check size={9}/> {item.servido_at ? 'Servido' : 'Servir'}
                      </button>
                    )}
                    <button onClick={() => quitarItem(item.id)} disabled={!!item._reservado}
                      className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30">
                      <Trash2 size={10}/>
                    </button>
                  </div>
                </div>
              )})}
            </div>

            {/* Cobros guardados sin conexión — se registran solos al reconectar */}
            {colaCobros.length > 0 && (
              <div className={cn('mt-3 rounded-xl border px-3 py-2 text-[11px] space-y-0.5',
                colaCobros.some(c => c.error)
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200')}>
                <p className="font-bold">
                  ⏳ {colaCobros.length} cobro{colaCobros.length !== 1 ? 's' : ''} guardado{colaCobros.length !== 1 ? 's' : ''} sin conexión
                  {totalCola > 0 ? ` · ${fmt(totalCola)}` : ''}
                </p>
                <p className="opacity-80">
                  {colaCobros.some(c => c.error)
                    ? 'Alguno fue rechazado al sincronizar — revisa el aviso rojo en el tablero de mesas.'
                    : 'Se registran solos al volver la conexión. Esas unidades ya no se pueden cobrar de nuevo.'}
                </p>
              </div>
            )}

            {/* Ya cobrado (cobros parciales) — solo historial, no se puede modificar */}
            {itemsPagados.length > 0 && (
              <div className="mt-3 pt-2 border-t border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1 flex items-center justify-between">
                  <span>Ya cobrado</span>
                  <span className="tabular-nums text-gray-400 normal-case tracking-normal">{fmt(totalPagado)}</span>
                </p>
                <div className="divide-y divide-white/5 opacity-60">
                  {itemsPagados.map(item => (
                    <div key={item.id} className="flex items-center gap-2 py-1.5">
                      <Check size={11} className="text-green-400 flex-shrink-0"/>
                      <p className="flex-1 min-w-0 text-[11px] text-gray-300 truncate">
                        {Number(item.cantidad)} × {item.producto?.nombre ?? '—'}
                      </p>
                      <p className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">{fmt(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divisor vertical arrastrable — mismo patrón que POS */}
          {items.length > 0 && (
            <div
              onMouseDown={e => {
                e.preventDefault()
                isDraggingV.current  = true
                dragStartY.current   = e.clientY
                dragStartH.current   = paymentHeight
                document.body.style.cursor     = 'row-resize'
                document.body.style.userSelect = 'none'
              }}
              className="h-2 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-[#EA580C]/40 cursor-row-resize transition-colors"
              title="Arrastra para redimensionar"
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
          )}

          {/* Totales + acciones (fijo abajo) */}
          {items.length > 0 && (
            <div className="border-t border-white/5 p-3 space-y-2 flex-shrink-0 overflow-y-auto"
              style={{ height: paymentHeight }}>
              {/* Totales */}
              <div className="space-y-0.5">
                {itemsPagados.length > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Ya cobrado</span>
                    <span className="tabular-nums text-green-400">{fmt(totalPagado)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{itemsPagados.length > 0 ? 'Falta por cobrar' : 'Sub Total'}</span>
                  <span className="tabular-nums text-gray-300">{fmt(totalPendiente)}</span>
                </div>
                {redondCarrito !== 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Redondeo</span>
                    <span className={cn('tabular-nums font-medium', redondCarrito > 0 ? 'text-orange-400' : 'text-green-400')}>
                      {redondCarrito > 0 ? '+' : ''}{fmt(redondCarrito)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1.5 border-t border-white/5">
                  <span className="text-white font-bold text-xs">TOTAL</span>
                  <span className="text-white font-bold text-lg tabular-nums text-brand-teal">{fmt(totalFinalCarrito)}</span>
                </div>
              </div>

              {/* Botón Enviar pedido (siempre visible) */}
              <button
                onClick={() => enviarPedido()}
                disabled={enviando}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-[#EA580C]/15 hover:bg-[#EA580C]/25 border border-[#EA580C]/30
                           text-[#EA580C] font-semibold text-xs transition-colors disabled:opacity-50 min-h-[40px]"
              >
                <Send size={13}/>
                {enviando ? 'Enviando…' : 'Enviar pedido comanda'}
              </button>

              {/* Botón Cobrar — solo cajero/admin, no mesero. Bloqueado hasta que
                  todo lo del carrito esté enviado Y servido. */}
              {puedeCobar && (
                <>
                  <button onClick={() => setShowCobrar(true)}
                    disabled={!listoParaCobrar}
                    title={!listoParaCobrar ? (faltaPorEnviar ? 'Falta enviar el pedido a comanda' : 'Falta servir productos en la mesa') : undefined}
                    className={cn(
                      'w-full py-3 rounded-xl text-brand-dark font-bold text-sm transition-colors',
                      'min-h-[48px] active:scale-[0.97] select-none',
                      !listoParaCobrar
                        ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                        : resaltarCobrar
                          ? 'bg-[#D9A652] hover:bg-[#c7913f] ring-2 ring-[#D9A652] ring-offset-2 ring-offset-brand-navy animate-pulse'
                          : 'bg-brand-teal hover:bg-[#00A882]',
                    )}>
                    {resaltarCobrar && listoParaCobrar ? '💰 ' : ''}
                    {itemsPagados.length > 0 ? 'Cobrar lo que falta' : 'Cobrar'} · {fmt(totalFinalCarrito)}
                  </button>
                  {!listoParaCobrar && items.length > 0 && (
                    <p className="text-[10px] text-center text-[#EA580C] -mt-1">
                      {faltaPorEnviar ? '⏳ Falta enviar el pedido a comanda' : '⏳ Falta servir productos en la mesa'}
                    </p>
                  )}
                  <button onClick={() => { setModoDividir(true); setSeleccion({}) }}
                    className="w-full py-2 rounded-xl border border-brand-teal/30 bg-brand-teal/10 text-brand-teal
                               hover:bg-brand-teal/20 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                    <Layers size={13}/> Dividir cuenta
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

    </div>

    {/* ── Ventana "Cambiar de mesa": trasladar el pedido a una mesa libre ─────── */}
    {showTrasladar && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="bg-[#2C2925] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
            <div className="min-w-0">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <RefreshCw size={17} className="text-brand-teal flex-shrink-0"/>
                Cambiar de mesa
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Pedido de Mesa {mesa.numero}{mesa.nombre ? ` · ${mesa.nombre}` : ''}. Elige la mesa libre a la que se pasa —
                los productos, sus estados y lo ya cobrado no cambian.
              </p>
            </div>
            <button onClick={() => setShowTrasladar(false)} disabled={trasladando}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg flex-shrink-0">
              <X size={16}/>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {mesasLibres.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No hay mesas libres en este momento.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {mesasLibres.map(m => (
                  <button key={m.id} disabled={trasladando}
                    onClick={() => {
                      const nom = m.nombre ? `${m.numero} — ${m.nombre}` : `${m.numero}`
                      if (confirm(`¿Pasar el pedido de la Mesa ${mesa.numero} a la Mesa ${nom}?`)) trasladar(m)
                    }}
                    className="rounded-xl p-3 border border-white/10 bg-brand-dark hover:border-brand-teal/50 hover:bg-brand-teal/10
                               text-left transition-colors disabled:opacity-40 active:scale-[0.97]">
                    <p className="text-sm font-black text-white leading-tight">{m.nombre ?? `Mesa ${m.numero}`}</p>
                    {m.nombre && <p className="text-[11px] text-gray-500">Mesa {m.numero}</p>}
                    <p className="text-[11px] text-gray-500 mt-1">{m.capacidad} personas</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-white/10 flex-shrink-0">
            <button onClick={() => setShowTrasladar(false)} disabled={trasladando}
              className="w-full py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-semibold">
              {trasladando ? 'Trasladando…' : 'Cancelar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Ventana "Dividir cuenta": elegir qué paga cada persona ──────────────
        Queda abierta tras cada cobro parcial (se elige lo de la siguiente persona)
        y se cierra sola cuando no queda nada pendiente. El modal de cobro (z-[60])
        se abre encima al pulsar "Cobrar selección". */}
    {modoDividir && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div className="bg-[#2C2925] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl flex flex-col max-h-[92vh]">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
            <div className="min-w-0">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Layers size={18} className="text-brand-teal flex-shrink-0"/>
                Dividir cuenta — Mesa {mesa.numero}{mesa.nombre ? ` · ${mesa.nombre}` : ''}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Elige lo que va a pagar esta persona. Al terminar de cobrar podrás elegir lo de la siguiente.
              </p>
            </div>
            <button onClick={() => { setModoDividir(false); setSeleccion({}) }}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg flex-shrink-0">
              <X size={16}/>
            </button>
          </div>

          {/* Resumen de la mesa */}
          <div className="flex flex-wrap gap-2 px-5 pt-3 flex-shrink-0">
            <span className="text-xs px-2.5 py-1 rounded-lg bg-brand-dark border border-white/5 text-gray-300">
              Falta por cobrar: <b className="text-white tabular-nums">{fmt(totalPendiente)}</b>
            </span>
            {itemsPagados.length > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300">
                Ya cobrado: <b className="tabular-nums">{fmt(totalPagado)}</b>
              </span>
            )}
          </div>

          {/* Productos pendientes */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0 touch-pan-y overscroll-contain">
            {items.map(item => {
              const cantN    = Number(item.cantidad)
              const sel      = Math.min(seleccion[item.id] ?? 0, cantN)
              const puedeSel = !!item.enviado_at && !!item.servido_at
              const setSel   = (n: number) => setSeleccion(prev => ({ ...prev, [item.id]: Math.max(0, Math.min(n, cantN)) }))
              const montoSel = sel === cantN ? Number(item.subtotal) : Number(item.precio_unitario) * sel
              return (
                <div key={item.id}
                  className={cn('flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors',
                    sel > 0 ? 'border-brand-teal/60 bg-brand-teal/10' : 'border-white/5 bg-brand-dark',
                    !puedeSel && 'opacity-80')}>
                  <MiniIconMesa nombre={item.producto?.nombre ?? ''} imagenUrl={item.producto?.imagen_url}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug">{item.producto?.nombre ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmt(item.precio_unitario)} c/u · {cantN} pendiente{cantN !== 1 ? 's' : ''}
                      {item._reservado ? <span className="text-amber-400"> · {item._reservado} en cola de cobro</span> : null}
                    </p>
                    {item.notas && (
                      <p className="text-xs font-semibold text-[#D9A652] mt-0.5 break-words">✎ {item.notas}</p>
                    )}
                    {!puedeSel && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-semibold text-[#EA580C]">
                          {item.enviado_at ? 'Falta servir en la mesa' : 'Falta enviar a comanda'}
                        </span>
                        {item.enviado_at && (
                          <button onClick={() => marcarServido(item.id)}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md
                                       bg-[#EA580C]/15 text-[#EA580C] hover:bg-[#EA580C]/25 transition-colors">
                            <Check size={10}/> Marcar servido
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Unidades que paga esta persona */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button disabled={!puedeSel || sel <= 0} onClick={() => setSel(sel - 1)}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/12 active:scale-[0.92] disabled:opacity-30
                                 flex items-center justify-center text-gray-200 transition-all select-none">
                      <Minus size={14}/>
                    </button>
                    <span className={cn('min-w-[42px] text-center font-bold text-base tabular-nums',
                      sel > 0 ? 'text-brand-teal' : 'text-white')}>
                      {sel}/{cantN}
                    </span>
                    <button disabled={!puedeSel || sel >= cantN} onClick={() => setSel(sel + 1)}
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-brand-teal/20 active:scale-[0.92] disabled:opacity-30
                                 flex items-center justify-center text-gray-200 hover:text-brand-teal transition-all select-none">
                      <Plus size={14}/>
                    </button>
                  </div>
                  {/* Monto + toda la línea */}
                  <div className="w-[92px] text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <p className={cn('text-sm font-bold tabular-nums', sel > 0 ? 'text-brand-teal' : 'text-gray-400')}>
                      {fmt(sel > 0 ? montoSel : item.subtotal)}
                    </p>
                    {puedeSel && (
                      <button onClick={() => setSel(sel === cantN ? 0 : cantN)}
                        className={cn('text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors',
                          sel === cantN
                            ? 'bg-brand-teal text-brand-dark'
                            : 'bg-brand-teal/15 text-brand-teal hover:bg-brand-teal/25')}>
                        {sel === cantN ? 'Quitar' : 'Toda la línea'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {items.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-6">No queda nada pendiente de cobro.</p>
            )}

            {/* Cobros guardados sin conexión */}
            {colaCobros.length > 0 && (
              <div className={cn('rounded-xl border px-3 py-2 text-xs space-y-0.5',
                colaCobros.some(c => c.error)
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200')}>
                <p className="font-bold">
                  ⏳ {colaCobros.length} cobro{colaCobros.length !== 1 ? 's' : ''} guardado{colaCobros.length !== 1 ? 's' : ''} sin conexión
                  {totalCola > 0 ? ` · ${fmt(totalCola)}` : ''}
                </p>
                <p className="opacity-80">
                  {colaCobros.some(c => c.error)
                    ? 'Alguno fue rechazado al sincronizar — revisa el aviso rojo en el tablero de mesas.'
                    : 'Se registran solos al volver la conexión. Esas unidades ya no se pueden cobrar de nuevo.'}
                </p>
              </div>
            )}

            {/* Ya cobrado — solo lectura */}
            {itemsPagados.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-1">Ya cobrado</p>
                <div className="divide-y divide-white/5 opacity-70">
                  {itemsPagados.map(item => (
                    <div key={item.id} className="flex items-center gap-2 py-1.5">
                      <Check size={12} className="text-green-400 flex-shrink-0"/>
                      <p className="flex-1 min-w-0 text-xs text-gray-300 truncate">
                        {Number(item.cantidad)} × {item.producto?.nombre ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 tabular-nums flex-shrink-0">{fmt(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pie: atajos, total de la selección y cobrar */}
          <div className="border-t border-white/10 px-5 py-4 space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSeleccion(Object.fromEntries(
                    items.filter(i => i.enviado_at && i.servido_at).map(i => [i.id, Number(i.cantidad)])))}
                  className="text-brand-teal hover:underline font-semibold">
                  Elegir todo lo servido
                </button>
                <button onClick={() => setSeleccion({})}
                  disabled={selItems.length === 0}
                  className="text-gray-400 hover:text-white disabled:opacity-30 font-semibold">
                  Limpiar
                </button>
              </div>
              <span className="text-gray-500">
                {selItems.length === 0
                  ? 'Nada elegido todavía'
                  : `${selItems.length} línea${selItems.length !== 1 ? 's' : ''} · ${selItems.reduce((s, x) => s + x.cant, 0)} unidad${selItems.reduce((s, x) => s + x.cant, 0) !== 1 ? 'es' : ''}`}
              </span>
            </div>

            <div className="bg-brand-dark rounded-xl p-3 space-y-1 border border-white/5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Selección</span>
                <span className="tabular-nums text-gray-200">{fmt(subtotalSel)}</span>
              </div>
              {redond !== 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Redondeo</span>
                  <span className={cn('tabular-nums font-medium', redond > 0 ? 'text-orange-400' : 'text-green-400')}>
                    {redond > 0 ? '+' : ''}{fmt(redond)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1.5 border-t border-white/5">
                <span className="text-white font-bold text-sm">TOTAL A COBRAR</span>
                <span className="text-brand-teal font-bold text-xl tabular-nums">{fmt(totalFinal)}</span>
              </div>
            </div>

            {selItems.length === 0 ? (
              <p className="text-xs text-center text-[#EA580C]">👆 Elige las unidades que va a pagar esta persona</p>
            ) : !selListo ? (
              <p className="text-xs text-center text-[#EA580C]">
                {selFaltaEnviar ? '⏳ Hay productos elegidos sin enviar a comanda' : '⏳ Hay productos elegidos sin servir en la mesa'}
              </p>
            ) : null}

            <div className="flex gap-3">
              <button onClick={() => { setModoDividir(false); setSeleccion({}) }}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-semibold transition-colors">
                Cerrar
              </button>
              <button onClick={() => setShowCobrar(true)}
                disabled={!selListo || total <= 0}
                className={cn(
                  'flex-[2] py-3 rounded-xl font-bold text-sm transition-colors min-h-[48px] active:scale-[0.98] select-none',
                  !selListo || total <= 0
                    ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                    : 'bg-brand-teal hover:bg-[#00A882] text-brand-dark')}>
                Cobrar selección · {fmt(totalFinal)}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal cobrar — fuera del overflow-hidden para que los clicks lleguen ── */}
    {showCobrar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">
                {modoDividir ? `Cobrar selección — mesa ${mesa.numero}` : `Cobrar mesa ${mesa.numero}`}
              </h3>
              <button onClick={() => setShowCobrar(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              {modoDividir && (
                <div className="bg-brand-dark rounded-xl p-3 border border-white/5 space-y-1 max-h-32 overflow-y-auto">
                  {selItems.map(x => (
                    <div key={x.item.id} className="flex justify-between gap-2 text-xs">
                      <span className="text-gray-300 truncate">{x.cant} × {x.item.producto?.nombre ?? '—'}</span>
                      <span className="text-gray-400 tabular-nums flex-shrink-0">
                        {fmt(x.cant === Number(x.item.cantidad) ? Number(x.item.subtotal) : Number(x.item.precio_unitario) * x.cant)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-brand-dark rounded-xl p-3 flex justify-between border border-white/5">
                <span className="text-sm text-gray-400">Total a cobrar</span>
                <span className="text-lg font-bold text-brand-teal tabular-nums">{fmt(totalFinal)}</span>
              </div>

              {/* Método pago — mismo patrón que POS: Pago Completo destacado + grid 2 columnas */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Método de pago</label>
                <button type="button"
                  onClick={() => { setMetodoPago('exacto'); setEfectivoRecibido(''); setMixtoEfectivo(''); setMixtoTransferencia('') }}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 mb-2',
                    metodoPago === 'exacto'
                      ? 'bg-brand-teal text-brand-dark border border-brand-teal'
                      : 'bg-brand-dark border border-white/5 text-gray-400 hover:text-white hover:bg-white/5',
                  )}>
                  <Check size={14}/> Pago completo
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id:'efectivo',      label:'Efectivo',      icon: Banknote },
                    { id:'transferencia', label:'Pago Electrónico',  icon: Smartphone },
                    { id:'mixto',         label:'Mixto',         icon: Layers },
                    { id:'credito',       label:'Crédito',       icon: CreditCard },
                  ] as const).map(m => (
                    <button key={m.id} type="button"
                      onClick={() => { setMetodoPago(m.id); setEfectivoRecibido(''); setMixtoEfectivo(''); setMixtoTransferencia('') }}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                        metodoPago === m.id
                          ? 'bg-brand-teal/15 border-brand-teal/50 text-brand-teal'
                          : 'bg-brand-dark border-white/10 text-gray-400 hover:border-white/20',
                      )}>
                      <m.icon size={14}/> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Efectivo: display + teclado numérico (igual que POS) */}
              {metodoPago === 'efectivo' && (
                <div className="space-y-2">
                  <div className="bg-[#403A32] border border-white/8 rounded-xl px-4 py-3 text-center">
                    <label htmlFor="efectivo-input-mesa" className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">
                      Efectivo recibido
                    </label>
                    <div className="relative flex items-center justify-center">
                      <span className="text-2xl font-bold text-gray-600 mr-1">$</span>
                      <input
                        id="efectivo-input-mesa"
                        ref={efectivoInputRef}
                        type="text"
                        inputMode="numeric"
                        value={efectivoRecibido ? new Intl.NumberFormat('es-CO').format(parseInt(efectivoRecibido, 10)) : ''}
                        onChange={e => setEfectivoRecibido(e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="bg-transparent text-3xl font-bold text-white tabular-nums text-center
                                   placeholder:text-gray-700 focus:outline-none w-full max-w-[12rem]"
                      />
                    </div>
                  </div>
                  {efectivoNum >= totalFinal && totalFinal > 0 && (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2.5
                                    flex items-center justify-between">
                      <p className="text-xs text-gray-400">Cambio</p>
                      <p className="text-2xl font-bold text-green-400 tabular-nums">{fmt(cambio)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Crédito: selector cliente */}
              {metodoPago === 'credito' && (
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Cliente *</label>
                  <input value={buscandoCli} onChange={e => setBuscandoCli(e.target.value)}
                    placeholder="Buscar cliente…"
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white
                               focus:outline-none focus:border-blue-500/50 mb-2"/>
                  {clientes.length > 0 && !clienteId && (
                    <div className="bg-brand-dark rounded-xl border border-white/10 overflow-hidden max-h-36 overflow-y-auto">
                      {clientes.map(c => (
                        <button key={c.id} type="button" onClick={() => { setClienteId(c.id); setBuscandoCli(c.nombre) }}
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5">
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                  {clienteId && (
                    <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                      <p className="text-xs text-blue-400 font-semibold">{buscandoCli}</p>
                      <button onClick={() => { setClienteId(''); setBuscandoCli('') }}
                        className="text-gray-500 hover:text-red-400"><X size={12}/></button>
                    </div>
                  )}
                  {!clienteId && (
                    <CrearClienteRapidoMesas
                      nombreInicial={buscandoCli}
                      onCreado={(c) => { setClienteId(c.id); setBuscandoCli(c.nombre) }}
                    />
                  )}
                </div>
              )}

              {/* Mixto: divide el pago entre efectivo y transferencia (igual que POS) */}
              {metodoPago === 'mixto' && (
                <div className="space-y-2 rounded-xl border border-white/8 bg-[#403A32] p-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Dividir pago</p>
                  {[
                    { label: 'Efectivo',      val: mixtoEfectivo,      set: setMixtoEfectivo      },
                    { label: 'Pago Electrónico', val: mixtoTransferencia, set: setMixtoTransferencia },
                  ].map(({ label, val, set }) => (
                    <div key={label}>
                      <label className="text-[10px] text-gray-500 mb-0.5 block">{label}</label>
                      <input
                        type="text" inputMode="numeric"
                        value={val ? new Intl.NumberFormat('es-CO').format(parseInt(val, 10)) : ''}
                        onChange={e => set(e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="w-full bg-brand-dark text-white border border-white/10 rounded-lg px-3 py-1.5
                                   text-sm focus:outline-none focus:border-brand-teal/50"
                      />
                    </div>
                  ))}
                  <div className={cn('flex justify-between text-[11px] font-semibold px-0.5',
                    mixtoValido ? 'text-green-400' : 'text-red-400')}>
                    <span>Suma: {fmt(mixtoSuma)}</span>
                    <span>Total: {fmt(totalFinal)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowCobrar(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm">Cancelar</button>
              <button
                disabled={
                  cobrando
                  || (metodoPago === 'credito' && !clienteId)
                  || (metodoPago === 'efectivo' && efectivoNum > 0 && efectivoNum < totalFinal)
                  || (metodoPago === 'mixto' && !mixtoValido)
                }
                onClick={() => cobrar()}
                className="flex-1 py-3 rounded-xl bg-brand-teal hover:bg-[#00A882] text-brand-dark font-bold text-sm disabled:opacity-40">
                {cobrando ? 'Procesando…' : `✓ Cobrar ${fmt(totalFinal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Comida: ¿completo o modificar? ─────────────────── */}
    {modalComida && (
      <ModalModificarComida
        nombreProducto={modalComida.nombre}
        toppings={nombresToppings}
        salsas={nombresSalsas}
        onCerrar={() => setModalComida(null)}
        onCompleto={() => { agregarProd({ producto_id: modalComida.id, cantidad: 1 }); setModalComida(null) }}
        onModificado={nota => { agregarProd({ producto_id: modalComida.id, cantidad: 1, notas: nota }); setModalComida(null) }}
      />
    )}

    {/* ── Modal Venta Libre ─────────────────────────────────── */}
      {ventaLibreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-[#2C2925] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-1">Venta Libre</h3>
            <p className="text-gray-500 text-xs mb-5">Ingresa la descripción, precio y cantidad</p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 block">Descripción / Nombre</label>
                <input
                  autoFocus
                  className="w-full bg-[#1C1A18] border border-white/10 rounded-xl px-3 py-2.5
                             text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#EA580C]/60"
                  value={ventaLibreModal.nombre}
                  onChange={e => setVentaLibreModal(prev => prev ? { ...prev, nombre: e.target.value } : prev)}
                  onKeyDown={e => { if (e.key === 'Enter') document.getElementById('vl-mesa-precio')?.focus() }}
                  placeholder="Ej: Torta personalizada"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 block">Precio</label>
                <input
                  id="vl-mesa-precio"
                  type="text"
                  inputMode="numeric"
                  className="w-full bg-[#1C1A18] border border-white/10 rounded-xl px-3 py-2.5
                             text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#EA580C]/60"
                  value={fmtDinero(ventaLibreModal.precio)}
                  onChange={e => setVentaLibreModal(prev => prev ? { ...prev, precio: soloDigitos(e.target.value) } : prev)}
                  onKeyDown={e => { if (e.key === 'Enter') document.getElementById('vl-mesa-cantidad')?.focus() }}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 block">Cantidad</label>
                <input
                  id="vl-mesa-cantidad"
                  type="number"
                  min="1"
                  className="w-full bg-[#1C1A18] border border-white/10 rounded-xl px-3 py-2.5
                             text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#EA580C]/60"
                  value={ventaLibreModal.cantidad}
                  onChange={e => setVentaLibreModal(prev => prev ? { ...prev, cantidad: e.target.value } : prev)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarVentaLibre() }}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setVentaLibreModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={confirmarVentaLibre}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold"
                style={{ background: '#EA580C' }}>
                Agregar al pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Jugos/Limonadas/Aromáticas — Sabor + Base (Agua/Leche), igual que POS ── */}
      {modalVariante && (() => {
        const saborActual = modalVariante.grupo === 'jugo'
          ? saboresJugos.find(s => normalizar(s.sabor) === modalVariante.saborKey)
          : null
        const soloSaborList = modalVariante.grupo === 'aromatica' ? saboresAromaticas
          : modalVariante.grupo === 'limonada' ? saboresLimonada : []
        const soloSaborLabel = modalVariante.grupo === 'aromatica' ? 'aromáticas' : 'limonadas'
        const soloSaborActual = modalVariante.grupo !== 'jugo'
          ? soloSaborList.find(p => p.id === modalVariante.saborKey)
          : undefined
        const titulo = modalVariante.grupo === 'jugo' ? 'Jugos'
          : modalVariante.grupo === 'limonada' ? 'Limonadas' : 'Aromáticas'
        const pasoBase = modalVariante.grupo === 'jugo' && modalVariante.saborKey !== null
        const listo = modalVariante.grupo === 'jugo'
          ? !!saborActual && !!modalVariante.base
          : !!soloSaborActual

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
               style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="bg-[#2C2925] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-2 mb-1">
                <GlassWater size={18} className="text-[#EA580C]" />
                <h3 className="text-white font-bold text-lg">{titulo}</h3>
              </div>
              <p className="text-gray-500 text-xs mb-5">
                {!pasoBase && !soloSaborActual ? 'Elige el sabor' : 'Confirma la cantidad'}
              </p>

              {modalVariante.grupo === 'jugo' && !modalVariante.saborKey && (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {saboresJugos.map(s => (
                    <button key={normalizar(s.sabor)}
                      onClick={() => setModalVariante(prev => prev && ({ ...prev, saborKey: normalizar(s.sabor) }))}
                      className="bg-[#1C1A18] hover:bg-white/5 border border-white/10 rounded-xl px-3 py-3
                                 text-white text-sm font-medium text-left transition-colors">
                      {s.sabor}
                    </button>
                  ))}
                  {saboresJugos.length === 0 && (
                    <p className="col-span-2 text-gray-500 text-sm text-center py-4">
                      No hay jugos cargados en Inventario.
                    </p>
                  )}
                </div>
              )}
              {modalVariante.grupo !== 'jugo' && !modalVariante.saborKey && (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {soloSaborList.map(p => (
                    <button key={p.id}
                      onClick={() => setModalVariante(prev => prev && ({ ...prev, saborKey: p.id }))}
                      className="bg-[#1C1A18] hover:bg-white/5 border border-white/10 rounded-xl px-3 py-3
                                 text-white text-sm font-medium text-left transition-colors">
                      {p.nombre}
                    </button>
                  ))}
                  {soloSaborList.length === 0 && (
                    <p className="col-span-2 text-gray-500 text-sm text-center py-4">
                      No hay {soloSaborLabel} cargadas en Inventario.
                    </p>
                  )}
                </div>
              )}

              {(pasoBase || soloSaborActual) && (
                <div className="space-y-4">
                  <button
                    onClick={() => setModalVariante(prev => prev && ({ ...prev, saborKey: null, base: null }))}
                    className="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    ← Cambiar sabor
                  </button>

                  <p className="text-white text-sm font-semibold">
                    {saborActual?.sabor ?? soloSaborActual?.nombre}
                  </p>

                  {modalVariante.grupo === 'jugo' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={!saborActual?.agua}
                        onClick={() => setModalVariante(prev => prev && ({ ...prev, base: 'agua' }))}
                        className={cn(
                          'flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors',
                          !saborActual?.agua ? 'opacity-30 cursor-not-allowed border-white/5 text-gray-600'
                            : modalVariante.base === 'agua' ? 'bg-[#EA580C] border-[#EA580C] text-white'
                            : 'bg-[#1C1A18] border-white/10 text-gray-300 hover:bg-white/5',
                        )}>
                        <Droplet size={15} /> Agua
                      </button>
                      <button
                        disabled={!saborActual?.leche}
                        onClick={() => setModalVariante(prev => prev && ({ ...prev, base: 'leche' }))}
                        className={cn(
                          'flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors',
                          !saborActual?.leche ? 'opacity-30 cursor-not-allowed border-white/5 text-gray-600'
                            : modalVariante.base === 'leche' ? 'bg-[#EA580C] border-[#EA580C] text-white'
                            : 'bg-[#1C1A18] border-white/10 text-gray-300 hover:bg-white/5',
                        )}>
                        <Milk size={15} /> Leche
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] text-gray-400 uppercase tracking-wider mb-1 block">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min="1"
                      autoFocus={modalVariante.grupo !== 'jugo'}
                      className="w-full bg-[#1C1A18] border border-white/10 rounded-xl px-3 py-2.5
                                 text-white text-sm placeholder:text-gray-600 focus:outline-none
                                 focus:border-[#EA580C]/60"
                      value={modalVariante.cantidad}
                      onChange={e => setModalVariante(prev => prev && ({ ...prev, cantidad: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && listo) confirmarModalVariante() }}
                      placeholder="1"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setModalVariante(null)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                             hover:bg-white/5 text-sm font-medium transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={confirmarModalVariante}
                  disabled={!listo}
                  className="flex-1 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2460A]
                             text-white text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  Agregar al pedido
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

// ── Crear cliente rápido desde Mesas (modal cobrar) ──────────
function CrearClienteRapidoMesas({
  nombreInicial,
  onCreado,
}: {
  nombreInicial: string
  onCreado: (c: { id: string; nombre: string }) => void
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
      qc.invalidateQueries({ queryKey: ['clientes-mesa'] })
      onCreado(res.data)
      setOpen(false)
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

// ── Modal config mesas/meseros ────────────────────────────────
const COLORES_MESERO = ['#00C49A','#E91E8C','#F59E0B','#3B82F6','#A855F7','#F97316','#10B981','#EF4444']

function ModalConfigMesas({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab]           = useState<'meseros'|'mesas'>('mesas')
  const [showNew, setShowNew]   = useState(false)
  const [editId, setEditId]     = useState<string|null>(null)
  // Form mesero nuevo/editar
  const [fNombre, setFNombre]   = useState('')
  const [fPin,    setFPin]      = useState('')
  const [fColor,  setFColor]    = useState('#00C49A')
  // Form mesa nuevo/editar
  const [mNumero, setMNumero]   = useState('')
  const [mNombre, setMNombre]   = useState('')
  const [mCap,    setMCap]      = useState('4')
  const [mImagen, setMImagen]   = useState('')

  const { data: meseros = [], refetch: refMes } = useQuery<(Mesero & { activo?: boolean })[]>({
    queryKey: ['meseros'], queryFn: () => api.get('/berlin/meseros').then(r => r.data),
  })
  const { data: mesas = [], refetch: refMesas } = useQuery<Mesa[]>({
    queryKey: ['mesas'], queryFn: () => api.get('/berlin/mesas').then(r => r.data),
  })

  const resetMesero = () => { setFNombre(''); setFPin(''); setFColor('#00C49A'); setEditId(null); setShowNew(false) }
  const resetMesa   = () => { setMNumero(''); setMNombre(''); setMCap('4'); setMImagen(''); setEditId(null); setShowNew(false) }

  const iniciarEditMesero = (m: Mesero) => {
    setEditId(m.id); setFNombre(m.nombre); setFPin(''); setFColor(m.color); setShowNew(false)
  }
  const iniciarEditMesa = (m: Mesa) => {
    setEditId(m.id); setMNumero(String(m.numero)); setMNombre(m.nombre ?? ''); setMCap(String(m.capacidad))
    setMImagen(m.imagen_url ?? ''); setShowNew(false)
  }

  // Crear mesero
  const { mutate: crearMesero, isPending: pendMes } = useMutation({
    mutationFn: () => api.post('/berlin/meseros', { nombre: fNombre.trim(), pin: fPin, color: fColor }),
    onSuccess: () => { toast.success('Mesero creado ✅'); qc.invalidateQueries({ queryKey: ['meseros'] }); resetMesero() },
    onError: (e: unknown) => toast.error((e as any)?.response?.data?.error || 'Error'),
  })

  // Editar mesero
  const { mutate: editarMesero, isPending: pendEditMes } = useMutation({
    mutationFn: () => api.put(`/berlin/meseros/${editId}`, {
      nombre: fNombre.trim(), color: fColor, ...(fPin.length === 4 ? { pin: fPin } : {})
    }),
    onSuccess: () => { toast.success('Mesero actualizado'); qc.invalidateQueries({ queryKey: ['meseros'] }); resetMesero() },
    onError: (e: unknown) => toast.error((e as any)?.response?.data?.error || 'Error'),
  })

  // Eliminar mesero
  const { mutate: eliminarMesero } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/meseros/${id}`),
    onSuccess: () => { toast.success('Mesero eliminado'); qc.invalidateQueries({ queryKey: ['meseros'] }) },
  })

  // Crear mesa
  const { mutate: crearMesa, isPending: pendMesa } = useMutation({
    mutationFn: () => api.post('/berlin/mesas', { numero: mNumero, nombre: mNombre.trim() || undefined, capacidad: mCap, imagen_url: mImagen || undefined }),
    onSuccess: () => { toast.success('Mesa creada ✅'); qc.invalidateQueries({ queryKey: ['mesas'] }); resetMesa() },
    onError: (e: unknown) => toast.error((e as any)?.response?.data?.error || 'Error'),
  })

  // Editar mesa
  const { mutate: editarMesa, isPending: pendEditMesa } = useMutation({
    mutationFn: () => api.put(`/berlin/mesas/${editId}`, { numero: parseInt(mNumero), nombre: mNombre.trim() || null, capacidad: parseInt(mCap), activa: true, imagen_url: mImagen || null }),
    onSuccess: () => { toast.success('Mesa actualizada'); qc.invalidateQueries({ queryKey: ['mesas'] }); resetMesa() },
    onError: (e: unknown) => toast.error((e as any)?.response?.data?.error || 'Error'),
  })

  // Eliminar mesa
  const { mutate: eliminarMesa } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/mesas/${id}`),
    onSuccess: () => { toast.success('Mesa eliminada'); qc.invalidateQueries({ queryKey: ['mesas'] }) },
    onError: (e: unknown) => toast.error((e as any)?.response?.data?.error || 'Error'),
  })

  const formMesero = (
    <div className="bg-brand-dark rounded-xl p-4 border border-brand-teal/20 space-y-3">
      <p className="text-xs font-semibold text-brand-teal">{editId ? 'Editar mesero' : 'Nuevo mesero'}</p>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Nombre *</label>
        <input
          value={fNombre} onChange={e => setFNombre(e.target.value)}
          placeholder="Nombre del mesero"
          autoComplete="off" name="mesero-nombre"
          className="w-full bg-brand-navy border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          PIN (4 dígitos) {editId && <span className="text-gray-600">— dejar vacío para no cambiar</span>}
        </label>
        <input
          type="password" inputMode="numeric"
          value={fPin} onChange={e => setFPin(e.target.value.replace(/\D/g,'').slice(0,4))}
          placeholder={editId ? '(sin cambio)' : '••••'}
          autoComplete="new-password" name="mesero-pin"
          className="w-full bg-brand-navy border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORES_MESERO.map(c => (
            <button key={c} type="button" onClick={() => setFColor(c)}
              className={cn('w-7 h-7 rounded-full transition-transform', fColor === c && 'ring-2 ring-white ring-offset-2 ring-offset-brand-dark scale-110')}
              style={{ background: c }}/>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={editId ? resetMesero : resetMesero}
          className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 text-xs">Cancelar</button>
        <button
          disabled={!fNombre.trim() || (!editId && fPin.length !== 4) || (!!editId && fPin.length > 0 && fPin.length !== 4) || pendMes || pendEditMes}
          onClick={() => editId ? editarMesero() : crearMesero()}
          className="flex-1 py-2 rounded-xl bg-brand-teal text-brand-dark font-bold text-xs disabled:opacity-40">
          {(pendMes||pendEditMes) ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear mesero'}
        </button>
      </div>
    </div>
  )

  const formMesaUI = (
    <div className="bg-brand-dark rounded-xl p-4 border border-brand-teal/20 space-y-3">
      <p className="text-xs font-semibold text-brand-teal">{editId ? 'Editar mesa' : 'Nueva mesa'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Número *</label>
          <input type="number" value={mNumero} onChange={e => setMNumero(e.target.value)}
            placeholder="Ej: 9" autoComplete="off"
            className="w-full bg-brand-navy border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Capacidad</label>
          <input type="number" value={mCap} onChange={e => setMCap(e.target.value)}
            autoComplete="off"
            className="w-full bg-brand-navy border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Nombre (opcional)</label>
        <input value={mNombre} onChange={e => setMNombre(e.target.value)}
          placeholder="Ej: Terraza, VIP, Jardín…" autoComplete="off"
          className="w-full bg-brand-navy border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-teal"/>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Imagen (opcional)</label>
        <ProductImageInput value={mImagen} onChange={setMImagen} />
      </div>
      <div className="flex gap-2">
        <button onClick={resetMesa}
          className="flex-1 py-2 rounded-xl border border-white/10 text-gray-400 text-xs">Cancelar</button>
        <button disabled={!mNumero || pendMesa || pendEditMesa} onClick={() => editId ? editarMesa() : crearMesa()}
          className="flex-1 py-2 rounded-xl bg-brand-teal text-brand-dark font-bold text-xs disabled:opacity-40">
          {(pendMesa||pendEditMesa) ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear mesa'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <h3 className="text-white font-bold flex items-center gap-2"><Settings size={16} className="text-brand-teal"/> Configurar Mesas</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><X size={16}/></button>
        </div>

        {/* Solo pestaña Mesas — meseros ahora se gestionan en el módulo Usuarios */}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Botón nuevo */}
          {!showNew && !editId && (
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-white transition-colors font-semibold">
              <Plus size={12}/> Nueva mesa
            </button>
          )}

          {/* Forms */}
          {(showNew || editId) && tab === 'meseros' && formMesero}
          {(showNew || editId) && tab === 'mesas'   && formMesaUI}

          {/* Lista meseros */}
          {tab === 'meseros' && !showNew && !editId && (
            <div className="space-y-2">
              {meseros.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Sin meseros. Crea uno arriba.</p>}
              {meseros.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-brand-dark rounded-xl px-3 py-2.5 border border-white/5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: m.color + '33', color: m.color, border: `2px solid ${m.color}55` }}>
                    {m.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium">{m.nombre}</p>
                    <p className="text-[10px] text-gray-500">PIN ••••</p>
                  </div>
                  <button onClick={() => iniciarEditMesero(m)}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-brand-teal hover:bg-brand-teal/10 rounded-lg transition-colors">
                    <Edit2 size={12}/>
                  </button>
                  <button onClick={() => { if(confirm(`¿Eliminar a ${m.nombre}?`)) eliminarMesero(m.id) }}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Lista mesas */}
          {tab === 'mesas' && !showNew && !editId && (
            <div className="space-y-2">
              {mesas.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Sin mesas configuradas.</p>}
              {mesas.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-brand-dark rounded-xl px-3 py-2.5 border border-white/5">
                  <div className="w-9 h-9 rounded-xl bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                    <p className="text-sm font-black text-brand-teal">{m.numero}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{m.nombre ?? `Mesa ${m.numero}`}</p>
                    <p className="text-[10px] text-gray-500">{m.capacidad} personas · <span className={m.estado === 'libre' ? 'text-green-400' : 'text-orange-400'}>{m.estado}</span></p>
                  </div>
                  <button onClick={() => iniciarEditMesa(m)}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-brand-teal hover:bg-brand-teal/10 rounded-lg transition-colors">
                    <Edit2 size={12}/>
                  </button>
                  <button
                    disabled={m.estado === 'ocupada'}
                    onClick={() => { if(confirm(`¿Eliminar Mesa ${m.numero}?`)) eliminarMesa(m.id) }}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-30 transition-colors">
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Roles que pueden cobrar y ver config ─────────────────────
const ROLES_ADMIN_MESAS = ['cajero','admin_berlin','admin','super_admin','vendedor']

// ── Página principal ──────────────────────────────────────────
export default function MesasPage() {
  const qc   = useQueryClient()
  const user = useAuthStore(s => s.user)
  const rol  = user?.rol ?? ''
  const esMesero = rol === 'mesero'

  const [vistaOrden, setVistaOrden] = useState<Mesa | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  // ── Cola offline para cobros de mesa ─────────────────────────
  // Devuelve una promesa: la cola espera a que la orden se refresque antes de sacar el
  // cobro de la cola (ver useOfflineMesasCobro).
  const handleCobroSync = useCallback(async (mesaId: string, data: unknown, cobro: QueuedCobro) => {
    const d = data as { venta?: { numero_venta?: string; total?: number } }
    const num = d?.venta?.numero_venta ?? mesaId.slice(0, 8).toUpperCase()
    toast.success(cobro.provisional
      ? `☁️ Mesa ${cobro.mesa_numero} sincronizada: ${num} (era el comprobante provisional ${cobro.provisional})`
      : `☁️ Mesa sincronizada: ${num}`, { duration: 8000 })
    qc.invalidateQueries({ queryKey: ['ventas-resumen-hoy'] })
    await Promise.all([
      // Prefijo (todas las órdenes abiertas en pantalla): el pedido pudo haberse trasladado
      // de mesa, así que el id de mesa con que se guardó el cobro puede ya no ser el vigente.
      qc.refetchQueries({ queryKey: ['mesa-orden'] }),
      qc.refetchQueries({ queryKey: ['mesas'] }),
    ])
  }, [qc])

  const { pendingCount: cobrosPendientes, failedCobros, syncStatus: cobroSyncStatus,
          pendingCobros, enqueue: enqueueCobro, dequeue: quitarCobroCola,
          markInFlight: marcarCobroEnVuelo, patch: parchearCobro, syncNow: syncCobrosNow,
          retry: reintentarCobro, discard: descartarCobro, tagOrden: etiquetarCobrosConOrden,
        } = useOfflineMesasCobro(handleCobroSync)

  // ── Cola de operaciones de Mesas (tomar, agregar, quitar, enviar…) — funcionan sin conexión ──
  // Tras sincronizar se refresca cuenta y tablero ANTES de sacarlas de la cola (sin parpadeo).
  const refrescarTrasSync = useCallback(() => Promise.all([
    qc.refetchQueries({ queryKey: ['mesa-orden'] }),
    qc.refetchQueries({ queryKey: ['mesas'] }),
  ]), [qc])
  const { ops: opsMesas, pendientes: opsPendientes, fallidas: opsFallidas, sincronizando: opsSincronizando,
          syncNow: syncOpsNow, retry: reintentarOp, discard: descartarOp } = useOutboxMesas(refrescarTrasSync)

  // El tablero = lo que dice el servidor + las operaciones de este equipo aún sin sincronizar
  const superponerOps = useCallback((data: Mesa[]) => tableroConOps(data, opsMesas), [opsMesas])
  const { data: mesas = [], isLoading } = useQuery<Mesa[]>({
    queryKey: ['mesas'],
    queryFn:  () => api.get('/berlin/mesas').then(r => r.data),
    refetchInterval: 5_000,
    select: superponerOps,
  })

  // Caja activa del usuario logueado (para cobro en cajero/admin)
  const { data: turnoActivo } = useQuery<{ id: string } | null>({
    queryKey: ['turno-activo-mesas'],
    queryFn:  () => api.get('/berlin/caja/turno-activo').then(r => r.data).catch(fallbackSiNoRed(null)),
    refetchInterval: 10_000,
    refetchOnMount:  'always',
    staleTime: 0,
  })

  // Cualquier caja abierta en el negocio (para que mesero valide antes de tomar mesa)
  const { data: cajaDelNegocio } = useQuery<{ id: string } | null>({
    queryKey: ['turno-negocio-activo'],
    queryFn:  () => api.get('/berlin/caja/turno-negocio-activo').then(r => r.data).catch(fallbackSiNoRed(null)),
    refetchInterval: 10_000,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // Tomar mesa (sin PIN): se guarda como operación local y la mesa queda ocupada al instante; el
  // servidor la registra al sincronizar. Si otro equipo ya la tenía abierta, las cuentas se
  // fusionan y se avisa (nunca se pierde un pedido).
  const tomando = false
  const tomarMesa = (mesaId: string) => {
    const m = mesas.find(x => x.id === mesaId)
    if (!m) return
    const nombre = user?.apellido ? `${user.nombre} ${user.apellido}` : user?.nombre ?? ''
    encolarOp(nuevaOp('tomar',
      { mesa_id: m.id, mesa_numero: m.numero, orden_id: crypto.randomUUID() },
      { mesero: { id: `local-${user?.id ?? ''}`, nombre, color: '#00C49A', usuario_id: user?.id ?? null } }))
    toast.success(hayInternet() ? '✅ Mesa asignada' : '📶 Mesa asignada sin conexión — se registrará al reconectar')
    setVistaOrden(m)   // entrar directo a la orden
  }

  const libres   = mesas.filter(m => m.estado === 'libre')
  const ocupadas = mesas.filter(m => m.estado === 'ocupada')

  const ROLES_SIN_CAJA = ['admin_berlin', 'admin', 'super_admin']
  // Sin conexión y sin ningún dato guardado de la caja: no se puede SABER si hay turno abierto, así
  // que no se bloquea tomar mesas (las operaciones se guardan y se registran al volver).
  const hayNetMesas = useHayInternet()
  const cajaDesconocida = turnoActivo === undefined && cajaDelNegocio === undefined && !hayNetMesas
  const handleClickMesa = (mesa: Mesa) => {
    if (mesa.estado === 'libre') {
      // Validar caja abierta (admin/superadmin pueden entrar sin caja; cajero con turno propio también)
      if (!cajaDelNegocio && !turnoActivo && !cajaDesconocida && !ROLES_SIN_CAJA.includes(rol)) {
        toast.error('⚠️ No hay caja abierta. Un cajero debe abrir el turno antes de atender mesas.')
        return
      }
      tomarMesa(mesa.id)
    } else {
      // Mesa ocupada: verificar si puedes verla
      if (esMesero) {
        const meseroOrden = mesa.orden_activa?.mesero
        const nombrePropio = user?.apellido ? `${user.nombre} ${user.apellido}` : user?.nombre ?? ''
        const esmiMesa = meseroOrden?.usuario_id === user?.id
          || (!meseroOrden?.usuario_id && meseroOrden?.nombre === nombrePropio)
        if (!esmiMesa) {
          const quienLaTiene = meseroOrden?.nombre ?? 'otro mesero'
          toast.error(`Mesa ${mesa.numero} está asignada a ${quienLaTiene}`)
          return
        }
      }
      setVistaOrden(mesa)
    }
  }

  // Si estamos en vista de orden, renderizar eso
  if (vistaOrden) {
    const mesaActual = mesas.find(m => m.id === vistaOrden.id) ?? vistaOrden
    return (
      <div className="space-y-0">
        {/* key por mesa: al trasladar el pedido se abre la mesa nueva con un VistaOrden limpio */}
        <VistaOrden
          key={mesaActual.id}
          mesa={mesaActual}
          cajaId={turnoActivo?.id}
          onVolver={() => { setVistaOrden(null); qc.invalidateQueries({ queryKey: ['mesas'] }) }}
          onEnqueueCobro={enqueueCobro}
          onDequeueCobro={quitarCobroCola}
          onMarkInFlight={marcarCobroEnVuelo}
          onPatchCobro={parchearCobro}
          colaTodos={pendingCobros}
          mesasLibres={libres.filter(m => m.id !== mesaActual.id).sort((a, b) => a.numero - b.numero)}
          onTrasladada={(destino, ordenId, origenId) => {
            // Cobros guardados sin conexión de este pedido (versión anterior, sin orden_id) →
            // se etiquetan para que sincronicen contra el pedido y no contra la mesa vieja.
            etiquetarCobrosConOrden(origenId, ordenId)
            setVistaOrden(destino)
            qc.invalidateQueries({ queryKey: ['mesas'] })
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Cambios de mesas guardados en este equipo, pendientes de sincronizar */}
      {opsPendientes > 0 && (
        <div className={cn(
          'flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border',
          opsSincronizando
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        )}>
          <div className="flex items-center gap-2">
            <RefreshCw size={13} className={opsSincronizando ? 'animate-spin' : ''} />
            <span>
              {opsSincronizando
                ? `Sincronizando ${opsPendientes} cambio${opsPendientes > 1 ? 's' : ''} de mesas…`
                : `${opsPendientes} cambio${opsPendientes > 1 ? 's' : ''} de mesas pendiente${opsPendientes > 1 ? 's' : ''} de sincronizar · se guardan en este equipo`}
            </span>
          </div>
          {!opsSincronizando && (
            <button onClick={syncOpsNow}
              className="underline underline-offset-2 hover:text-amber-200 transition-colors">
              Sincronizar ahora
            </button>
          )}
        </div>
      )}

      {/* Cambios que el servidor rechazó al sincronizar — NUNCA se descartan solos */}
      {opsFallidas.map(o => (
        <div key={o.op_id}
          className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl text-xs border bg-red-500/10 border-red-500/40 text-red-200">
          <div className="space-y-0.5">
            <p className="font-bold">
              ⚠️ Cambio NO registrado — Mesa {o.mesa_numero} · {
                o.tipo === 'agregar'  ? `agregar ${o.producto?.nombre ?? 'producto'}`
                : o.tipo === 'cantidad' ? 'cambiar una cantidad'
                : o.tipo === 'quitar'   ? 'quitar un producto'
                : o.tipo === 'enviar'   ? 'enviar el pedido a cocina'
                : o.tipo === 'servido'  ? 'marcar un producto como servido'
                : o.tipo === 'cancelar' ? 'cancelar la cuenta'
                : o.tipo === 'trasladar' ? `pasar la cuenta a la Mesa ${o.destino_numero ?? ''}`
                : 'abrir la mesa'}
            </p>
            <p>{o.error}</p>
            <p className="text-red-300/80">
              Revisa la mesa. Puedes reintentar, o descartar este cambio (deja de verse en pantalla).
            </p>
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={() => reintentarOp(o.op_id)}
              className="px-3 py-1 rounded-lg border border-red-300/40 hover:bg-red-500/20 font-semibold">
              Reintentar
            </button>
            <button
              onClick={() => { if (confirm('¿Descartar este cambio? No se aplicará en la mesa.')) descartarOp(o.op_id) }}
              className="px-3 py-1 rounded-lg border border-red-300/20 text-red-300/80 hover:bg-red-500/10">
              Descartar
            </button>
          </div>
        </div>
      ))}

      {/* Banner cobros pendientes de sincronizar */}
      {cobrosPendientes > 0 && (
        <div className={cn(
          'flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-xs font-medium border',
          cobroSyncStatus === 'syncing'
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        )}>
          <div className="flex items-center gap-2">
            <RefreshCw size={13} className={cobroSyncStatus === 'syncing' ? 'animate-spin' : ''} />
            <span>
              {cobroSyncStatus === 'syncing'
                ? `Sincronizando ${cobrosPendientes} cobro${cobrosPendientes > 1 ? 's' : ''} de mesa…`
                : `${cobrosPendientes} cobro${cobrosPendientes > 1 ? 's' : ''} de mesa pendiente${cobrosPendientes > 1 ? 's' : ''} · ${pendingCobros.filter(c => !c.error).map(c => `Mesa ${c.mesa_numero}${c.total ? ` (${fmt(c.total)})` : ''}`).join(', ')}`
              }
            </span>
          </div>
          {cobroSyncStatus !== 'syncing' && (
            <button onClick={syncCobrosNow}
              className="underline underline-offset-2 hover:text-amber-200 transition-colors">
              Sincronizar ahora
            </button>
          )}
        </div>
      )}

      {/* Cobros que el servidor rechazó al sincronizar — NUNCA se descartan solos */}
      {failedCobros.map(c => (
        <div key={c.idempotency_key}
          className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl text-xs border bg-red-500/10 border-red-500/40 text-red-200">
          <div className="space-y-0.5">
            <p className="font-bold">
              ⚠️ Cobro NO registrado — Mesa {c.mesa_numero}{c.total ? ` · ${fmt(c.total)}` : ''}{c.provisional ? ` · comprobante ${c.provisional}` : ''}
            </p>
            <p>{c.error}</p>
            <p className="text-red-300/80">
              Ese dinero ya se recibió en la mesa: revisa la mesa y reintenta, o descarta este cobro si ya lo cobraste de otra forma.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={() => reintentarCobro(c.idempotency_key)}
              className="px-3 py-1 rounded-lg border border-red-300/40 hover:bg-red-500/20 font-semibold">
              Reintentar
            </button>
            <button
              onClick={() => { if (confirm(`¿Descartar este cobro de la Mesa ${c.mesa_numero}? No se registrará ninguna venta.`)) descartarCobro(c.idempotency_key) }}
              className="px-3 py-1 rounded-lg border border-red-300/20 text-red-300/80 hover:bg-red-500/10">
              Descartar
            </button>
          </div>
        </div>
      ))}

      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid size={20} className="text-brand-teal"/>
          <div>
            <h2 className="text-lg font-bold text-white">Mesas</h2>
            <p className="text-xs text-gray-500">
              {libres.length} libre{libres.length !== 1?'s':''} · {ocupadas.length} ocupada{ocupadas.length !== 1?'s':''}
            </p>
          </div>
        </div>
        {/* Solo admin/cajero ven el botón configurar */}
        {ROLES_ADMIN_MESAS.includes(rol) && (
          <button onClick={() => setShowConfig(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-white/10
                       hover:bg-white/5 px-3 py-2 rounded-xl transition-colors">
            <Settings size={13}/> Configurar
          </button>
        )}
      </div>

      {/* Aviso: sin caja abierta (no aplica a admin/superadmin) */}
      {!cajaDelNegocio && !turnoActivo && !cajaDesconocida && !ROLES_SIN_CAJA.includes(rol) && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0"/>
          <p className="text-xs text-amber-300">
            No hay caja abierta en este negocio. Las mesas no pueden tomarse hasta que un cajero abra el turno.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-brand-navy rounded-xl border border-white/5 p-3">
          <p className="text-[11px] text-gray-500">Total mesas</p>
          <p className="text-xl font-bold text-white">{mesas.length}</p>
        </div>
        <div className="bg-brand-navy rounded-xl border border-white/5 p-3">
          <p className="text-[11px] text-gray-500">Ocupadas</p>
          <p className="text-xl font-bold text-orange-400">{ocupadas.length}</p>
        </div>
        <div className="bg-brand-navy rounded-xl border border-white/5 p-3">
          <p className="text-[11px] text-gray-500">Ingreso mesas</p>
          <p className="text-lg font-bold text-brand-teal tabular-nums">
            {fmt(ocupadas.reduce((s, m) => s + (m.orden_activa?.total ?? 0), 0))}
          </p>
        </div>
      </div>

      {/* Grid mesas */}
      {isLoading ? (
        <p className="text-sm text-gray-600 text-center py-12">Cargando mesas…</p>
      ) : mesas.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-gray-600">
          <LayoutGrid size={40} className="opacity-20"/>
          <p className="text-sm">Sin mesas configuradas</p>
          {ROLES_ADMIN_MESAS.includes(rol) && (
            <button onClick={() => setShowConfig(true)}
              className="text-xs text-brand-teal hover:text-white flex items-center gap-1">
              <Plus size={11}/> Crear mesas
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {mesas.map(m => (
            <MesaCard
              key={m.id}
              mesa={m}
              currentUserId={user?.id}
              currentUserName={user?.apellido ? `${user.nombre} ${user.apellido}` : user?.nombre}
              tomando={tomando}
              onClick={() => handleClickMesa(m)}
            />
          ))}
        </div>
      )}

      {showConfig && <ModalConfigMesas onClose={() => { setShowConfig(false); qc.invalidateQueries({ queryKey: ['mesas'] }) }}/>}
    </div>
  )
}
