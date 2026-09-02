import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import toast from 'react-hot-toast'
import {
  Truck, Plus, X, Phone, FileText, Edit2, CheckCircle, Clock,
  Search, Package, Printer, Trash2, CreditCard, Banknote, Shield,
} from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'

function imprimirProveedor(p: Proveedor) {
  const origin = window.location.origin
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Proveedor ${p.nombre}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{margin:5mm;size:80mm auto}
  body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
  .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:4px 0}
  img.logo{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:18mm}
  table{width:100%;border-collapse:collapse;margin-top:4px}td{padding:2px 0;font-size:13px}.key{color:#000}.val{text-align:right;font-weight:bold}
  </style></head><body>
  <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
  <div class="c b" style="font-size:13px;margin:3px 0">*Café Bar Berlín*</div>
  <div class="sep"></div><div class="c b">FICHA PROVEEDOR</div>
  <div class="c" style="font-size:12px">${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>
  <div class="sep"></div>
  <table><tbody>
    <tr><td class="key">Nombre</td><td class="val">${p.nombre}</td></tr>
    ${p.nit ? `<tr><td class="key">NIT</td><td class="val">${p.nit}</td></tr>` : ''}
    ${p.contacto ? `<tr><td class="key">Contacto</td><td class="val">${p.contacto}</td></tr>` : ''}
    ${p.telefono ? `<tr><td class="key">Teléfono</td><td class="val">${p.telefono}</td></tr>` : ''}
    ${p.email ? `<tr><td class="key">Email</td><td class="val">${p.email}</td></tr>` : ''}
  </tbody></table>
  <div class="sep"></div><div class="c" style="font-size:12px;margin-top:4px">Sistema Kalreco v1.0</div>
  </body></html>`
  const w = window.open('','_blank','width=440,height=400')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),600)},400) }
}

function imprimirPedido(p: Pedido) {
  const origin = window.location.origin
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Pedido ${p.numero_pedido ?? p.id.slice(0,8)}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{margin:5mm;size:80mm auto}
  body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
  .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:4px 0}
  img.logo{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:18mm}
  table{width:100%;border-collapse:collapse;margin-top:4px}td{padding:2px 0;font-size:13px}.key{color:#000}.val{text-align:right;font-weight:bold}
  </style></head><body>
  <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
  <div class="c b" style="font-size:13px;margin:3px 0">*Café Bar Berlín*</div>
  <div class="sep"></div><div class="c b">PEDIDO PROVEEDOR</div>
  <div class="c" style="font-size:12px">${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>
  <div class="sep"></div>
  <table><tbody>
    <tr><td class="key">Proveedor</td><td class="val">${p.proveedor?.nombre ?? '—'}</td></tr>
    ${p.numero_pedido ? `<tr><td class="key">N° Pedido</td><td class="val">${p.numero_pedido}</td></tr>` : ''}
    <tr><td class="key">Estado</td><td class="val">${p.estado.toUpperCase()}</td></tr>
    <tr><td class="key">Fecha pedido</td><td class="val">${p.fecha_pedido}</td></tr>
    ${p.fecha_entrega_esperada ? `<tr><td class="key">Entrega esperada</td><td class="val">${p.fecha_entrega_esperada}</td></tr>` : ''}
    ${p.valor_total ? `<tr><td class="key b">Total</td><td class="val b">$${p.valor_total.toLocaleString('es-CO')}</td></tr>` : ''}
    ${p.descripcion ? `<tr><td class="key">Descripción</td><td class="val">${p.descripcion}</td></tr>` : ''}
  </tbody></table>
  <div class="sep"></div><div class="c" style="font-size:12px;margin-top:4px">Sistema Kalreco v1.0</div>
  </body></html>`
  const w = window.open('','_blank','width=440,height=450')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),600)},400) }
}

function imprimirFactura(f: Factura) {
  const origin = window.location.origin
  const estado = f.estado === 'pagada' ? 'PAGADA ✓' : 'POR PAGAR'
  const fmtN = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
  const itemsRows = (f.items ?? []).map(i =>
    `<tr>
      <td style="padding:2px 0;font-size:12px">${i.descripcion}</td>
      <td style="text-align:center;padding:2px 4px;font-size:12px">${i.cantidad}</td>
      <td style="text-align:right;padding:2px 0;font-size:12px">${fmtN(i.precio_unitario)}</td>
      <td style="text-align:right;padding:2px 0;font-size:12px;font-weight:bold">${fmtN(i.subtotal)}</td>
    </tr>`
  ).join('')
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Factura ${f.numero_factura || f.id.slice(0,8)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}@page{margin:5mm;size:80mm auto}
    body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
    .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:4px 0}
    img.logo{display:block;margin:4px auto;max-width:60mm;height:auto;max-height:18mm}
    .info-table{width:100%;border-collapse:collapse;margin-top:4px}
    .info-table td{padding:2px 0;font-size:13px}
    .key{color:#000}.val{text-align:right;font-weight:bold}
    .items-table{width:100%;border-collapse:collapse;margin-top:4px}
    .items-table th{font-size:11px;text-align:left;color:#000;padding:2px 0;border-bottom:1px solid #000}
    .items-table th:not(:first-child){text-align:right}
  </style></head><body>
  <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
  <div class="c b" style="font-size:13px;margin:3px 0">*Café Bar Berlín*</div>
  <div class="sep"></div>
  <div class="c b">FACTURA PROVEEDOR</div>
  <div class="c" style="font-size:12px">${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'})}</div>
  <div class="sep"></div>
  <table class="info-table"><tbody>
    <tr><td class="key">Proveedor</td><td class="val">${f.proveedor?.nombre ?? '—'}</td></tr>
    ${f.numero_factura ? `<tr><td class="key">N° Factura</td><td class="val">${f.numero_factura}</td></tr>` : ''}
    <tr><td class="key">Fecha</td><td class="val">${f.fecha}</td></tr>
    ${f.fecha_vencimiento ? `<tr><td class="key">Vence</td><td class="val">${f.fecha_vencimiento}</td></tr>` : ''}
    <tr><td class="key">Estado</td><td class="val">${estado}</td></tr>
  </tbody></table>
  ${(f.items ?? []).length > 0 ? `
  <div class="sep"></div>
  <table class="items-table">
    <thead><tr>
      <th>Descripción</th><th style="text-align:center">Cant</th><th style="text-align:right">P.Unit</th><th style="text-align:right">Total</th>
    </tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>` : ''}
  <div class="sep"></div>
  <table class="info-table"><tbody>
    ${(f.iva ?? 0) > 0 ? `
    <tr><td class="key">Subtotal</td><td class="val">${fmtN(f.subtotal ?? 0)}</td></tr>
    <tr><td class="key">IVA</td><td class="val">${fmtN(f.iva ?? 0)}</td></tr>` : ''}
    <tr><td class="key b" style="font-size:12px">TOTAL</td><td class="val b" style="font-size:12px">${fmtN(f.total)}</td></tr>
    ${f.notas ? `<tr><td class="key">Notas</td><td class="val">${f.notas}</td></tr>` : ''}
  </tbody></table>
  <div class="sep"></div>
  <div class="c" style="font-size:12px;margin-top:4px">Sistema Kalreco v1.0</div>
  </body></html>`
  const w = window.open('','_blank','width=440,height=600')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),600)},400) }
}
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const EMPTY_PROV = { nombre:'', nit:'', contacto:'', telefono:'', email:'', direccion:'', notas:'' }

// ── Types ─────────────────────────────────────────────────────
interface BusqItem {
  id: string; nombre: string; stock_actual: number; precio_ref: number
  _tipo: 'producto' | 'insumo'; unidad_medida?: string
}
interface ItemFac {
  producto_id: string; producto_nombre: string; descripcion: string
  cantidad: string; precio_unitario: string; precio_venta: string; insumo_id: string
  _itemSel: BusqItem | null; _busqueda: string; _mostrarRes: boolean
  _showCrear: boolean; _tipoCrear: 'terminado' | 'insumo'
}
interface ItemPedido {
  descripcion: string; cantidad: string; unidad: string; precio_unitario: string
  _itemSel: BusqItem | null; _busqueda: string; _mostrarRes: boolean
  _showCrear: boolean; _tipoCrear: 'terminado' | 'insumo'
}
interface Proveedor { id: string; nombre: string; nit?: string; contacto?: string; telefono?: string; email?: string }
interface FacItemDB {
  id: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number
  insumo_id?: string; producto_id?: string
}
interface Factura {
  id: string; numero_factura?: string; fecha: string; fecha_vencimiento?: string
  subtotal?: number; iva?: number; total: number; estado: string; tipo_cuenta?: string
  notas?: string; proveedor?: { id: string; nombre: string }
  items?: FacItemDB[]
}
interface Pedido {
  id: string; numero_pedido?: string; descripcion?: string; estado: string
  fecha_pedido: string; fecha_entrega_esperada?: string; fecha_recibido?: string
  items: ItemPedido[]; valor_total: number; notas?: string
  proveedor?: { id: string; nombre: string; telefono?: string }
}

const EMPTY_ITEM: ItemFac = {
  producto_id: '', producto_nombre: '', descripcion: '',
  cantidad: '1', precio_unitario: '', precio_venta: '', insumo_id: '',
  _itemSel: null, _busqueda: '', _mostrarRes: false, _showCrear: false, _tipoCrear: 'insumo',
}
const EMPTY_ITEM_PED: ItemPedido = {
  descripcion: '', cantidad: '1', unidad: 'unidad', precio_unitario: '',
  _itemSel: null, _busqueda: '', _mostrarRes: false, _showCrear: false, _tipoCrear: 'insumo',
}
const EMPTY_FAC = {
  proveedor_id: '', numero_factura: '', fecha: '', notas: '',
  fecha_vencimiento: '', tipo_cuenta: 'pagar' as 'pagar'|'pagada', iva_pct: '0',
  items: [{ ...EMPTY_ITEM }],
}
const EMPTY_PED = {
  proveedor_id: '', numero_pedido: '', descripcion: '', estado: 'pendiente' as string,
  fecha_pedido: '', fecha_entrega_esperada: '', notas: '',
  items: [{ ...EMPTY_ITEM_PED }],
}

const ESTADOS_PEDIDO: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  programado: { label: 'Programado', color: 'text-blue-400',   bg: 'bg-blue-500/10'  },
  enviado:    { label: 'Enviado',    color: 'text-purple-400', bg: 'bg-purple-500/10'},
  recibido:   { label: 'Recibido',   color: 'text-green-400',  bg: 'bg-green-500/10' },
  cancelado:  { label: 'Cancelado',  color: 'text-red-400',    bg: 'bg-red-500/10'   },
}

const UNIDADES_INSUMO = [
  'gramos','kilogramos','libras','litros','mililitros','unidad','docena',
  'paquete','botella','lata','bulto','arroba','cuarto','porción',
]

// ── Mini forms crear insumo/terminado rápido ──────────────────
function FormCrearInsumoRapido({ nombreInicial, onCreado, onCancelar }:
  { nombreInicial: string; onCreado: (i: BusqItem) => void; onCancelar: () => void }) {
  const [nombre, setNombre]   = useState(nombreInicial)
  const [unidad, setUnidad]   = useState('gramos')
  const [costo, setCosto]     = useState('')
  const [catId, setCatId]     = useState('')
  const [stockMin, setStockMin] = useState('5')
  const { data: categorias = [] } = useQuery<{id:string;nombre:string}[]>({
    queryKey: ['categorias-insumo'],
    queryFn:  () => api.get('/berlin/categorias').then(r => r.data),
    staleTime: 60_000,
  })
  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/insumos', {
      nombre: nombre.trim(),
      unidad_medida:  unidad,
      costo_unitario: parseFloat(costo) || 0,
      stock_actual:   0,
      stock_minimo:   parseFloat(stockMin) || 5,
      categoria_id:   catId || null,
      activo: true,
    }),
    onSuccess: (res) => {
      toast.success(`"${res.data.nombre}" creado en inventario ✅`)
      onCreado({ id: res.data.id, nombre: res.data.nombre, stock_actual: 0, precio_ref: res.data.costo_unitario, _tipo: 'insumo', unidad_medida: res.data.unidad_medida })
    },
    onError: () => toast.error('Error al crear insumo'),
  })
  return (
    <div className="space-y-2 bg-brand-dark border border-blue-400/30 rounded-xl p-3">
      <p className="text-xs text-blue-400 font-semibold flex items-center gap-1"><Plus size={11}/> Nuevo insumo</p>
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre *" autoFocus
        className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"/>
      <div className="grid grid-cols-2 gap-2">
        {/* Selector de unidad */}
        <select value={unidad} onChange={e => setUnidad(e.target.value)}
          className="bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
          {UNIDADES_INSUMO.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
          <input type="number" min="0" step="0.01" value={costo} onChange={e => setCosto(e.target.value)} placeholder="Costo/u"
            className="w-full bg-brand-navy border border-white/10 rounded-lg pl-6 pr-3 py-2 text-white text-sm focus:outline-none"/>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={catId} onChange={e => setCatId(e.target.value)}
          className="bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
          <option value="">Categoría…</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input type="number" min="0" value={stockMin} onChange={e => setStockMin(e.target.value)} placeholder="Stock mínimo"
          className="bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"/>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white">Cancelar</button>
        <button type="button" onClick={() => crear()} disabled={!nombre.trim() || isPending}
          className="flex-1 py-1.5 text-xs rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-bold disabled:opacity-40">
          {isPending ? 'Creando…' : '✓ Crear'}
        </button>
      </div>
    </div>
  )
}

function FormCrearTerminadoRapido({ nombreInicial, onCreado, onCancelar }:
  { nombreInicial: string; onCreado: (i: BusqItem) => void; onCancelar: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre]   = useState(nombreInicial)
  const [precio, setPrecio]   = useState('')
  const [catId, setCatId]     = useState('')
  const [stockMin, setStockMin] = useState('5')
  const { data: categorias = [] } = useQuery<{id:string;nombre:string}[]>({
    queryKey: ['categorias-terminado'],
    queryFn:  () => api.get('/berlin/categorias').then(r => r.data),
    staleTime: 60_000,
  })
  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/productos', {
      nombre: nombre.trim(),
      tipo_producto: 'compra_venta',
      precio_venta: parseFloat(precio) || 0,
      precio_compra: 0,
      porcentaje_utilidad: 0,
      porcentaje_iva: 0,
      unidad_venta: 'unidad',
      stock_actual: 0,
      stock_minimo: parseFloat(stockMin) || 5,
      categoria_id: catId || null,
      disponible: true,
      activo: true,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['productos-terminados'] })
      toast.success(`"${res.data.nombre}" creado en inventario ✅`)
      onCreado({ id: res.data.id, nombre: res.data.nombre, stock_actual: 0, precio_ref: res.data.precio_venta ?? 0, _tipo: 'producto' })
    },
    onError: () => toast.error('Error al crear producto'),
  })
  return (
    <div className="space-y-2 bg-brand-dark border border-brand-teal/30 rounded-xl p-3">
      <p className="text-xs text-brand-teal font-semibold flex items-center gap-1"><Plus size={11}/> Nuevo producto terminado</p>
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre *" autoFocus
        className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"/>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
          <input type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="Precio venta"
            className="w-full bg-brand-navy border border-white/10 rounded-lg pl-6 pr-3 py-2 text-white text-sm focus:outline-none"/>
        </div>
        <input type="number" min="0" value={stockMin} onChange={e => setStockMin(e.target.value)} placeholder="Stock mínimo"
          className="bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"/>
      </div>
      <select value={catId} onChange={e => setCatId(e.target.value)}
        className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
        <option value="">Categoría…</option>
        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white">Cancelar</button>
        <button type="button" onClick={() => crear()} disabled={!nombre.trim() || isPending}
          className="flex-1 py-1.5 text-xs rounded-lg bg-brand-teal hover:bg-[#00A882] text-brand-dark font-bold disabled:opacity-40">
          {isPending ? 'Creando…' : '✓ Crear'}
        </button>
      </div>
    </div>
  )
}

// ── Fila artículo compra (estilo Planilla FilaLinea) ─────────
function ItemCompraRow({ item, index, canRemove, onPatch, onRemove }:
  { item: ItemFac; index: number; canRemove: boolean; onPatch: (p: Partial<ItemFac>) => void; onRemove: () => void }) {
  const { data: resultados = [] } = useQuery<BusqItem[]>({
    queryKey: ['fac-busq', item._busqueda],
    queryFn:  () => api.get('/berlin/proveedores/buscar-items', { params: { q: item._busqueda, limit: 8 } }).then(r => r.data),
    enabled:  item._busqueda.length >= 1 && !item._itemSel,
  })

  const seleccionar = (p: BusqItem) => onPatch({
    _itemSel: p, _busqueda: p.nombre, _mostrarRes: false,
    producto_id:     p._tipo === 'producto' ? p.id : '',
    insumo_id:       p._tipo === 'insumo'   ? p.id : '',
    producto_nombre: p.nombre,
    precio_unitario: p._tipo === 'insumo' ? String(p.precio_ref ?? '') : '',
    precio_venta:    p._tipo === 'producto' ? String(p.precio_ref ?? '') : '',
  })

  const limpiar = () => onPatch({
    _itemSel: null, _busqueda: '', _mostrarRes: false,
    producto_id: '', insumo_id: '', producto_nombre: '', precio_unitario: '', precio_venta: '',
  })

  const qty   = parseFloat(item.cantidad)       || 0
  const pc    = parseFloat(item.precio_unitario) || 0
  const total = qty * pc

  return (
    <div className="bg-brand-dark rounded-xl border border-white/8 p-3 space-y-2">
      {/* Encabezado línea */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600 font-mono">LÍNEA {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 size={13}/>
          </button>
        )}
      </div>

      {/* Producto / insumo seleccionado o buscador */}
      {item._itemSel ? (
        <div className="flex items-center gap-2 bg-[#1C1A18] rounded-lg px-3 py-2 border border-brand-teal/30">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-white truncate">{item._itemSel.nombre}</p>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0',
                item._itemSel._tipo === 'insumo' ? 'bg-blue-500/15 text-blue-400' : 'bg-brand-teal/15 text-brand-teal')}>
                {item._itemSel._tipo === 'insumo' ? 'Insumo' : 'Terminado'}
              </span>
            </div>
            <p className="text-[9px] text-gray-500">Stock: {item._itemSel.stock_actual}</p>
          </div>
          <button onClick={limpiar} className="text-gray-500 hover:text-red-400 flex-shrink-0"><X size={12}/></button>
        </div>
      ) : item._showCrear ? (
        item._tipoCrear === 'insumo' ? (
          <FormCrearInsumoRapido nombreInicial={item._busqueda}
            onCreado={(i) => { seleccionar(i); onPatch({ _showCrear: false }) }}
            onCancelar={() => onPatch({ _showCrear: false })}/>
        ) : (
          <FormCrearTerminadoRapido nombreInicial={item._busqueda}
            onCreado={(p) => { seleccionar(p); onPatch({ _showCrear: false }) }}
            onCancelar={() => onPatch({ _showCrear: false })}/>
        )
      ) : (
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
          <input value={item._busqueda}
            onChange={e => onPatch({ _busqueda: e.target.value, _mostrarRes: true })}
            onFocus={() => onPatch({ _mostrarRes: true })}
            placeholder="Buscar producto o insumo…"
            autoComplete="off"
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg pl-8 pr-3 py-2
                       text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-teal"/>
          {item._mostrarRes && item._busqueda.length >= 1 && resultados.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#1C1A18] border border-white/15
                            rounded-xl shadow-2xl z-20 overflow-hidden max-h-48 overflow-y-auto">
              {resultados.map(p => (
                <button key={`${p._tipo}-${p.id}`} type="button" onClick={() => seleccionar(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-white truncate">{p.nombre}</p>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0',
                        p._tipo === 'insumo' ? 'bg-blue-500/15 text-blue-400' : 'bg-brand-teal/15 text-brand-teal')}>
                        {p._tipo === 'insumo' ? 'Ins' : 'Prod'}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-500">Stock: {p.stock_actual} · {fmt(p.precio_ref ?? 0)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <button type="button" onClick={() => onPatch({ _showCrear: true, _mostrarRes: false, _tipoCrear: 'insumo' })}
              className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-white transition-colors">
              <Plus size={10}/> {item._busqueda.trim() ? `Crear "${item._busqueda}"` : '+ Crear insumo'}
            </button>
            <span className="text-gray-600 text-[10px]">|</span>
            <button type="button" onClick={() => onPatch({ _showCrear: true, _mostrarRes: false, _tipoCrear: 'terminado' })}
              className="flex items-center gap-1 text-[10px] text-brand-teal hover:text-white transition-colors">
              <Plus size={10}/> producto terminado
            </button>
          </div>
        </div>
      )}

      {/* Cant. | P.Compra/u | P.Venta/u | V.Total */}
      <div className="grid grid-cols-4 gap-1.5">
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">Cant.</p>
          <input type="number" min="0.01" step="0.01" value={item.cantidad}
            onChange={e => onPatch({ cantidad: e.target.value })}
            placeholder="0"
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-2 py-2
                       text-xs text-white text-center focus:outline-none focus:border-brand-teal
                       placeholder:text-gray-600"/>
        </div>
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">P.Compra/u</p>
          <div className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">$</span>
            <input type="number" min="0" step="0.01" value={item.precio_unitario}
              onChange={e => onPatch({ precio_unitario: e.target.value })}
              placeholder="0"
              className="w-full bg-[#1C1A18] border border-white/10 rounded-lg pl-4 pr-1 py-2
                         text-xs text-white focus:outline-none focus:border-brand-teal
                         placeholder:text-gray-600"/>
          </div>
        </div>
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">P.Venta/u</p>
          <div className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">$</span>
            <input type="number" min="0" step="0.01" value={item.precio_venta}
              onChange={e => onPatch({ precio_venta: e.target.value })}
              placeholder="0"
              className="w-full bg-[#1C1A18] border border-white/10 rounded-lg pl-4 pr-1 py-2
                         text-xs text-white focus:outline-none focus:border-brand-teal
                         placeholder:text-gray-600"/>
          </div>
        </div>
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">V.Total</p>
          <div className="bg-[#1C1A18] border border-white/5 rounded-lg px-2 py-2 text-xs
                          text-brand-teal font-bold text-right">
            {total > 0
              ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(total)
              : '$0'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Fila artículo pedido (idéntica a Facturas: busca inventario + crear inline) ──
function ItemPedidoRow({ item, index, canRemove, onChange, onRemove }:
  { item: ItemPedido; index: number; canRemove: boolean
    onChange: (p: Partial<ItemPedido>) => void; onRemove: () => void }) {
  const { data: resultados = [] } = useQuery<BusqItem[]>({
    queryKey: ['ped-busq', item._busqueda],
    queryFn:  () => api.get('/berlin/proveedores/buscar-items', { params: { q: item._busqueda, limit: 8 } }).then(r => r.data),
    enabled:  item._busqueda.length >= 1 && !item._itemSel,
  })
  const seleccionar = (p: BusqItem) => onChange({
    _itemSel: p, _busqueda: p.nombre, _mostrarRes: false, _showCrear: false,
    descripcion: p.nombre,
    precio_unitario: String(p.precio_ref ?? ''),
    unidad: p.unidad_medida ?? 'unidad',
  })
  const limpiar = () => onChange({
    _itemSel: null, _busqueda: '', _mostrarRes: false,
    descripcion: '', precio_unitario: '',
  })
  return (
    <div className="bg-brand-dark rounded-xl p-3 space-y-3 border border-white/5">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Ítem {index + 1}</p>
      {item._itemSel ? (
        <div className="flex items-center gap-3 bg-[#1C1A18] rounded-xl px-3 py-2.5 border border-brand-teal/30">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white font-semibold truncate">{item._itemSel.nombre}</p>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase',
                item._itemSel._tipo === 'insumo' ? 'bg-blue-500/15 text-blue-400' : 'bg-brand-teal/15 text-brand-teal')}>
                {item._itemSel._tipo === 'insumo' ? 'Insumo' : 'Terminado'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500">Stock: {item._itemSel.stock_actual}</p>
          </div>
          <button onClick={limpiar} className="text-gray-500 hover:text-red-400 p-1"><X size={13}/></button>
        </div>
      ) : item._showCrear ? (
        item._tipoCrear === 'insumo' ? (
          <FormCrearInsumoRapido nombreInicial={item._busqueda}
            onCreado={(i) => { seleccionar(i); onChange({ _showCrear: false }) }}
            onCancelar={() => onChange({ _showCrear: false })}/>
        ) : (
          <FormCrearTerminadoRapido nombreInicial={item._busqueda}
            onCreado={(p) => { seleccionar(p); onChange({ _showCrear: false }) }}
            onCancelar={() => onChange({ _showCrear: false })}/>
        )
      ) : (
        <div className="space-y-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
            <input value={item._busqueda}
              onChange={e => onChange({ _busqueda: e.target.value, _mostrarRes: true, descripcion: e.target.value })}
              onFocus={() => onChange({ _mostrarRes: true })}
              placeholder="Buscar producto o insumo…"
              className="w-full bg-[#1C1A18] border border-white/10 rounded-xl pl-9 pr-3 py-2.5
                         text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-teal/50"/>
            {item._mostrarRes && item._busqueda.length >= 1 && resultados.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1C1A18] border border-white/15 rounded-xl shadow-2xl z-20 overflow-hidden">
                {resultados.map(p => (
                  <button key={`${p._tipo}-${p.id}`} type="button" onClick={() => seleccionar(p)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white truncate">{p.nombre}</p>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0',
                          p._tipo === 'insumo' ? 'bg-blue-500/15 text-blue-400' : 'bg-brand-teal/15 text-brand-teal')}>
                          {p._tipo === 'insumo' ? 'Ins' : 'Prod'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500">Stock: {p.stock_actual} · {fmt(p.precio_ref ?? 0)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => onChange({ _showCrear: true, _mostrarRes: false, _tipoCrear: 'insumo' })}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-white transition-colors">
              <Plus size={11}/> {item._busqueda.trim() ? `Crear "${item._busqueda}" como insumo` : '+ Crear insumo'}
            </button>
            <span className="text-gray-600 text-xs">|</span>
            <button type="button" onClick={() => onChange({ _showCrear: true, _mostrarRes: false, _tipoCrear: 'terminado' })}
              className="flex items-center gap-1 text-xs text-brand-teal hover:text-white transition-colors">
              <Plus size={11}/> producto terminado
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Cantidad</label>
          <input type="number" min="0.01" step="0.01" value={item.cantidad}
            onChange={e => onChange({ cantidad: e.target.value })} placeholder="1"
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-teal/50"/>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Unidad</label>
          <input value={item.unidad} onChange={e => onChange({ unidad: e.target.value })} placeholder="unidad"
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-teal/50"/>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 mb-1 block">Precio unit.</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
            <input type="number" min="0" value={item.precio_unitario}
              onChange={e => onChange({ precio_unitario: e.target.value })} placeholder="0"
              className="w-full bg-[#1C1A18] border border-white/10 rounded-lg pl-5 pr-2 py-2 text-sm text-white focus:outline-none focus:border-brand-teal/50"/>
          </div>
          {item.cantidad && item.precio_unitario && (
            <p className="text-[10px] text-brand-teal mt-0.5">
              = {fmt((parseFloat(item.cantidad)||0)*(parseFloat(item.precio_unitario)||0))}
            </p>
          )}
        </div>
      </div>
      {canRemove && (
        <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">— Eliminar ítem</button>
      )}
    </div>
  )
}

// ── Modal de pago de factura proveedor ────────────────────────
function ModalPagarFactura({ factura, onClose, onPagada }: {
  factura:  Factura
  onClose:  () => void
  onPagada: () => void
}) {
  const [metodoPago, setMetodoPago] = useState<'efectivo'|'transferencia'>('efectivo')
  const [referencia, setReferencia] = useState('')
  const { mutate: pagar, isPending } = useMutation({
    mutationFn: () => api.patch(`/berlin/proveedores/facturas/${factura.id}/pagar`, {
      metodo_pago: metodoPago,
      referencia:  referencia.trim() || null,
    }),
    onSuccess: () => { toast.success('Factura marcada como pagada ✅'); onPagada() },
    onError:   () => toast.error('Error al registrar pago'),
  })

  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n)
  const origin = window.location.origin

  const imprimir = () => {
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Pago ${factura.numero_factura || factura.id}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}@page{margin:5mm;size:80mm auto}
    body{font-family:Arial,sans-serif;font-weight:600;font-size:13px;color:#000}
    .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #000;margin:4px 0}
    img.logo{display:block;margin:4px auto;max-width:60mm;max-height:18mm}
    table{width:100%;border-collapse:collapse}td{padding:2px 0;font-size:13px}
    .key{color:#000}.val{text-align:right;font-weight:bold}
    </style></head><body>
    <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
    <div class="c b" style="font-size:13px;margin:3px 0">Café Bar Berlín</div>
    <div class="c" style="font-size:12px">COMPROBANTE DE PAGO</div>
    <div class="sep"></div>
    <table><tbody>
      <tr><td class="key">Proveedor</td><td class="val">${factura.proveedor?.nombre ?? '—'}</td></tr>
      ${factura.numero_factura ? `<tr><td class="key">N° Factura</td><td class="val">${factura.numero_factura}</td></tr>` : ''}
      <tr><td class="key">Total pagado</td><td class="val b" style="font-size:13px">${fmtCOP(factura.total)}</td></tr>
      <tr><td class="key">Método de pago</td><td class="val">${metodoPago === 'efectivo' ? 'Efectivo' : 'Pago Electrónico'}</td></tr>
      ${referencia ? `<tr><td class="key">Referencia</td><td class="val">${referencia}</td></tr>` : ''}
      <tr><td class="key">Fecha de pago</td><td class="val">${new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td></tr>
    </tbody></table>
    <div class="sep"></div><div class="c" style="font-size:12px;margin-top:4px">Sistema Kalreco v1.0</div>
    </body></html>`
    const w = window.open('', '_blank', 'width=440,height=500')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),600)},400) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-green-400"/>
            <h3 className="text-white font-bold text-sm">Registrar Pago</h3>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/10">
            <X size={18}/>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Detalle de la factura */}
          <div className="bg-brand-dark rounded-xl border border-white/8 p-4 space-y-2">
            <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Detalle de Factura</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <p className="text-[9px] text-gray-600">Proveedor</p>
                <p className="text-sm font-semibold text-white">{factura.proveedor?.nombre ?? '—'}</p>
              </div>
              {factura.numero_factura && (
                <div>
                  <p className="text-[9px] text-gray-600">N° Factura</p>
                  <p className="text-sm font-mono text-brand-teal">{factura.numero_factura}</p>
                </div>
              )}
              <div>
                <p className="text-[9px] text-gray-600">Fecha compra</p>
                <p className="text-sm text-gray-300">{new Date(factura.fecha + 'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-600">Total a pagar</p>
                <p className="text-lg font-bold text-green-400">{fmtCOP(factura.total)}</p>
              </div>
            </div>
            {factura.notas && <p className="text-[10px] text-gray-500 italic">{factura.notas}</p>}
          </div>

          {/* Método de pago */}
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Forma de pago</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMetodoPago('efectivo')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors min-h-[48px] ${
                  metodoPago === 'efectivo'
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-brand-dark border-white/10 text-gray-500 hover:text-gray-300'}`}>
                <Banknote size={16}/> Efectivo
              </button>
              <button type="button" onClick={() => setMetodoPago('transferencia')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors min-h-[48px] ${
                  metodoPago === 'transferencia'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-brand-dark border-white/10 text-gray-500 hover:text-gray-300'}`}>
                <CreditCard size={16}/> Pago Electrónico
              </button>
            </div>
          </div>

          {/* Referencia (solo transferencia) */}
          {metodoPago === 'transferencia' && (
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">N° Referencia / Comprobante</label>
              <input value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej: TRF-20260613-001"
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           focus:outline-none focus:border-blue-500 placeholder:text-gray-600"/>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm hover:bg-white/5 min-h-[48px]">
            Cancelar
          </button>
          <button onClick={imprimir} title="Imprimir comprobante"
            className="w-11 h-11 flex items-center justify-center rounded-xl border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 min-h-[48px]">
            <Printer size={16}/>
          </button>
          <button disabled={isPending} onClick={() => pagar()}
            className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm
                       disabled:opacity-40 transition-colors min-h-[48px]">
            {isPending ? 'Guardando…' : '✓ Confirmar Pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function ProveedoresPage() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.rol === 'super_admin'

  const [tab, setTab]       = useState<'proveedores'|'pedidos'|'compras'|'facturas'>('proveedores')
  const [showProv, setShowProv] = useState(false)
  const [showFac, setShowFac]   = useState(false)
  const [showPed, setShowPed]   = useState(false)
  const [showCompra, setShowCompra] = useState(false)
  const [editProv, setEditProv] = useState<Proveedor | null>(null)
  const [editPedido, setEditPedido] = useState<Pedido | null>(null)
  const [editFactura, setEditFactura] = useState<Factura | null>(null)
  const [pagarFac, setPagarFac] = useState<Factura | null>(null)
  const [formEditFull, setFormEditFull] = useState({
    proveedor_id: '', numero_factura: '', fecha: '', fecha_vencimiento: '',
    estado: 'pendiente', iva_pct: '0', notas: '',
    items: [{ ...EMPTY_ITEM }] as ItemFac[],
  })
  const [busq, setBusq] = useState('')
  const [formProv, setFormProv] = useState(EMPTY_PROV)
  const [formFac, setFormFac]   = useState(EMPTY_FAC)
  const [formPed, setFormPed]   = useState(EMPTY_PED)
  const [formCompra, setFormCompra] = useState({
    proveedor_id: '', descripcion: '', monto: '', fecha: '',
    metodo_pago: 'efectivo' as string, notas: '',
  })

  const { data: proveedores = [], isLoading: loadProv } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn:  () => api.get('/berlin/proveedores').then(r => r.data),
  })
  const { data: facturas = [], isLoading: loadFac } = useQuery<Factura[]>({
    queryKey: ['facturas-proveedor'],
    queryFn:  () => api.get('/berlin/proveedores/facturas').then(r => r.data),
  })
  const { data: pedidos = [], isLoading: loadPed } = useQuery<Pedido[]>({
    queryKey: ['pedidos-proveedor'],
    queryFn:  () => api.get('/berlin/pedidos-proveedor').then(r => r.data),
  })

  const { mutate: guardarProv, isPending: pendProv } = useMutation({
    mutationFn: () => editProv
      ? api.put(`/berlin/proveedores/${editProv.id}`, formProv)
      : api.post('/berlin/proveedores', formProv),
    onSuccess: () => {
      toast.success(editProv ? 'Proveedor actualizado' : 'Proveedor creado')
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      setShowProv(false); setEditProv(null); setFormProv(EMPTY_PROV)
    },
    onError: () => toast.error('Error al guardar proveedor'),
  })

  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n)

  const imprimirFacturaProv = () => {
    const provNombre = proveedores.find(p => p.id === formFac.proveedor_id)?.nombre ?? '—'
    const numFac = formFac.numero_factura.trim() || 'Sin número'
    const fecha  = formFac.fecha || new Date().toLocaleDateString('es-CO')
    const subtotal = formFac.items.reduce((s, i) => s + (parseFloat(i.cantidad)||0)*(parseFloat(i.precio_unitario)||0), 0)
    const ivaVal   = subtotal * (parseFloat(formFac.iva_pct)||0) / 100
    const total    = subtotal + ivaVal

    const rowsHTML = formFac.items
      .filter(i => i._itemSel && parseFloat(i.cantidad) > 0)
      .map(i => {
        const qty = parseFloat(i.cantidad)||0
        const pc  = parseFloat(i.precio_unitario)||0
        const pv  = parseFloat(i.precio_venta)||0
        return `<tr>
          <td style="padding:3px 4px;font-size:10px;border-bottom:1px solid #eee">${i._itemSel!.nombre}</td>
          <td style="padding:3px 4px;text-align:center;font-size:10px;border-bottom:1px solid #eee">${qty}</td>
          <td style="padding:3px 4px;text-align:right;font-size:10px;border-bottom:1px solid #eee">${fmtCOP(pc)}</td>
          <td style="padding:3px 4px;text-align:right;font-size:10px;border-bottom:1px solid #eee">${pv > 0 ? fmtCOP(pv) : '—'}</td>
          <td style="padding:3px 4px;text-align:right;font-size:10px;font-weight:bold;border-bottom:1px solid #eee">${fmtCOP(qty*pc)}</td>
        </tr>`
      }).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Factura Proveedor ${numFac}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      @page{margin:8mm;size:A4}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
      .logo{display:block;margin:0 auto 8px;max-height:55px}
      .titulo{text-align:center;font-size:15px;font-weight:bold;margin-bottom:2px}
      .sub{text-align:center;font-size:10px;color:#555;margin-bottom:10px}
      .header-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
      .hbox{border:1px solid #ddd;border-radius:6px;padding:8px 10px}
      .hbox label{display:block;font-size:8px;text-transform:uppercase;color:#888;letter-spacing:.5px;margin-bottom:3px}
      .hbox span{font-size:12px;font-weight:bold;color:#000}
      .sep{border-top:2px solid #333;margin:10px 0}
      .section-title{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#555;font-weight:bold;margin-bottom:6px}
      table{width:100%;border-collapse:collapse}
      thead th{font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#555;
               padding:5px 4px;text-align:left;border-bottom:2px solid #ddd;background:#f8f8f8}
      thead th:not(:first-child){text-align:right}
      thead th:nth-child(3){text-align:center}
      tfoot td{padding:5px 4px;font-weight:bold;font-size:11px}
      .total-row td{border-top:2px solid #333}
      .footer{text-align:center;margin-top:20px;font-size:9px;color:#888}
    </style></head><body>
    <img class="logo" src="${window.location.origin}/logos/berlin.png" alt=""/>
    <div class="titulo">Café Bar Berlín</div>
    <div class="sub">FACTURA DE COMPRA A PROVEEDOR</div>
    <div class="sep"></div>
    <div class="header-grid">
      <div class="hbox"><label>N° Factura</label><span>${numFac}</span></div>
      <div class="hbox"><label>Fecha</label><span>${fecha}</span></div>
      <div class="hbox"><label>Proveedor</label><span>${provNombre}</span></div>
    </div>
    <div class="section-title">Detalle de Artículos</div>
    <table>
      <thead><tr>
        <th style="text-align:left">Descripción</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">P. Compra/u</th>
        <th style="text-align:right">P. Venta/u</th>
        <th style="text-align:right">V. Total</th>
      </tr></thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot>
        ${ivaVal > 0 ? `<tr><td colspan="4" style="text-align:right">Subtotal</td><td style="text-align:right">${fmtCOP(subtotal)}</td></tr>
        <tr><td colspan="4" style="text-align:right">IVA (${formFac.iva_pct}%)</td><td style="text-align:right">${fmtCOP(ivaVal)}</td></tr>` : ''}
        <tr class="total-row">
          <td colspan="4" style="text-align:right;font-size:12px">TOTAL</td>
          <td style="text-align:right;font-size:13px;color:#EA580C">${fmtCOP(total)}</td>
        </tr>
      </tfoot>
    </table>
    ${formFac.notas ? `<div style="margin-top:10px;font-size:9px;color:#555">Notas: ${formFac.notas}</div>` : ''}
    <div class="footer">Sistema Kalreco v1.0 · ${new Date().toLocaleString('es-CO')}</div>
    </body></html>`

    const w = window.open('', '_blank', 'width=800,height=650')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{ w.print(); setTimeout(()=>w.close(),800) },400) }
  }

  const { mutate: guardarFac, isPending: pendFac } = useMutation({
    mutationFn: () => api.post('/berlin/proveedores/facturas', {
      proveedor_id: formFac.proveedor_id, numero_factura: formFac.numero_factura,
      fecha: formFac.fecha, fecha_vencimiento: formFac.fecha_vencimiento || null,
      tipo_cuenta: formFac.tipo_cuenta, iva_pct: parseFloat(formFac.iva_pct) || 0,
      notas: formFac.notas,
      items: formFac.items.map(i => ({
        descripcion:     (i._itemSel?.nombre ?? i.descripcion) || i.producto_nombre || '—',
        cantidad:        parseFloat(i.cantidad) || 1,
        precio_unitario: parseFloat(i.precio_unitario) || 0,
        precio_venta:    parseFloat(i.precio_venta) || 0,
        producto_id:     i.producto_id || null,
        insumo_id:       i.insumo_id   || null,
      })),
    }),
    onSuccess: () => {
      toast.success('Compra registrada ✅')
      qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
      qc.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
      setShowFac(false); setFormFac(EMPTY_FAC)
    },
    onError: () => toast.error('Error al registrar compra'),
  })

  const { mutate: guardarPed, isPending: pendPed } = useMutation({
    mutationFn: (): Promise<unknown> => {
      const valorTotal = formPed.items.reduce((s, i) =>
        s + (parseFloat(i.cantidad)||0)*(parseFloat(i.precio_unitario)||0), 0)
      if (editPedido) {
        return api.patch(`/berlin/pedidos-proveedor/${editPedido.id}`, {
          ...formPed, valor_total: valorTotal, items: formPed.items,
        })
      }
      return api.post('/berlin/pedidos-proveedor', {
        proveedor_id: formPed.proveedor_id, numero_pedido: formPed.numero_pedido,
        descripcion: formPed.descripcion, estado: formPed.estado,
        fecha_pedido: formPed.fecha_pedido || undefined,
        fecha_entrega_esperada: formPed.fecha_entrega_esperada || null,
        notas: formPed.notas, valor_total: valorTotal, items: formPed.items,
      })
    },
    onSuccess: () => {
      toast.success(editPedido ? 'Pedido actualizado' : 'Pedido creado ✅')
      qc.invalidateQueries({ queryKey: ['pedidos-proveedor'] })
      setShowPed(false); setEditPedido(null); setFormPed(EMPTY_PED)
    },
    onError: () => toast.error('Error al guardar pedido'),
  })

  const { mutate: cambiarEstado } = useMutation({
    mutationFn: ({ id, estado, fecha_recibido }: { id: string; estado: string; fecha_recibido?: string }) =>
      api.patch(`/berlin/pedidos-proveedor/${id}`, { estado, fecha_recibido }),
    onSuccess: () => { toast.success('Estado actualizado'); qc.invalidateQueries({ queryKey: ['pedidos-proveedor'] }) },
    onError:   () => toast.error('Error al actualizar estado'),
  })

  const { mutate: editarFacturaMut, isPending: pendEditFac } = useMutation({
    mutationFn: () => api.put(`/berlin/proveedores/facturas/${editFactura!.id}`, {
      proveedor_id:    formEditFull.proveedor_id,
      numero_factura:  formEditFull.numero_factura,
      fecha:           formEditFull.fecha,
      fecha_vencimiento: formEditFull.fecha_vencimiento || null,
      estado:          formEditFull.estado,
      iva_pct:         parseFloat(formEditFull.iva_pct) || 0,
      notas:           formEditFull.notas,
      items:           formEditFull.items.map(i => ({
        descripcion:     (i._itemSel?.nombre ?? i.descripcion) || i.producto_nombre || '—',
        cantidad:        parseFloat(i.cantidad) || 1,
        precio_unitario: parseFloat(i.precio_unitario) || 0,
        producto_id:     i.producto_id || null,
        insumo_id:       i.insumo_id   || null,
      })),
    }),
    onSuccess: () => {
      toast.success('Factura actualizada ✅')
      qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
      qc.invalidateQueries({ queryKey: ['compras-proveedor'] })
      setEditFactura(null)
    },
    onError: () => toast.error('Error al actualizar'),
  })

  const { mutate: eliminarFac } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/proveedores/facturas/${id}`),
    onSuccess: () => {
      toast.success('Factura eliminada')
      qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
      qc.invalidateQueries({ queryKey: ['compras-proveedor'] })
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const { mutate: eliminarPed } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/pedidos-proveedor/${id}`),
    onSuccess: () => {
      toast.success('Pedido eliminado')
      qc.invalidateQueries({ queryKey: ['pedidos-proveedor'] })
    },
    onError: () => toast.error('Error al eliminar pedido'),
  })

  const { mutate: desactivarProv } = useMutation({
    mutationFn: (id: string) => api.put(`/berlin/proveedores/${id}`, { activo: false }),
    onSuccess: () => {
      toast.success('Proveedor eliminado')
      qc.invalidateQueries({ queryKey: ['proveedores'] })
    },
    onError: () => toast.error('Error al eliminar proveedor'),
  })

  const { mutate: pagar } = useMutation({
    mutationFn: (id: string) => api.patch(`/berlin/proveedores/facturas/${id}/pagar`, {}),
    onSuccess: () => {
      toast.success('Compra marcada como pagada')
      qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
      qc.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
    },
  })

  const { data: compras = [], isLoading: loadCompras } = useQuery<Factura[]>({
    queryKey: ['compras-proveedor'],
    queryFn:  () => api.get('/berlin/proveedores/facturas', { params: { tipo: 'compra' } }).then(r => r.data),
  })

  const { mutate: guardarCompra, isPending: pendCompra } = useMutation({
    mutationFn: () => api.post('/berlin/proveedores/facturas', {
      proveedor_id: formCompra.proveedor_id,
      fecha: formCompra.fecha || new Date().toISOString().split('T')[0],
      tipo_cuenta: 'pagar',
      iva_pct: 0,
      notas: formCompra.notas,
      items: [{
        descripcion: formCompra.descripcion || 'Compra',
        cantidad: 1,
        precio_unitario: parseFloat(formCompra.monto) || 0,
        producto_id: null, insumo_id: null,
      }],
    }),
    onSuccess: () => {
      toast.success('Compra registrada ✅')
      qc.invalidateQueries({ queryKey: ['compras-proveedor'] })
      qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
      qc.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
      setShowCompra(false)
      setFormCompra({ proveedor_id: '', descripcion: '', monto: '', fecha: '', metodo_pago: 'efectivo', notas: '' })
    },
    onError: () => toast.error('Error al registrar compra'),
  })

  // Compras form helpers
  const addItem  = () => setFormFac(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }))
  const remItem  = (i: number) => setFormFac(f => ({ ...f, items: f.items.filter((_,j) => j !== i) }))
  const setItem  = (i: number, patch: Partial<ItemFac>) =>
    setFormFac(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, ...patch } : it) }))

  // Pedidos form helpers
  const addItemPed  = () => setFormPed(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM_PED }] }))
  const remItemPed  = (i: number) => setFormPed(f => ({ ...f, items: f.items.filter((_,j) => j !== i) }))
  const setItemPed  = (i: number, patch: Partial<ItemPedido>) =>
    setFormPed(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, ...patch } : it) }))

  const subtotalFac = formFac.items.reduce((s, i) => s + (parseFloat(i.cantidad)||0)*(parseFloat(i.precio_unitario)||0), 0)
  const ivaFac      = subtotalFac * (parseFloat(formFac.iva_pct)||0) / 100
  const totalFac    = subtotalFac + ivaFac
  const totalPed    = formPed.items.reduce((s, i) => s + (parseFloat(i.cantidad)||0)*(parseFloat(i.precio_unitario)||0), 0)

  const canSaveFac = !!formFac.proveedor_id &&
    formFac.items.every(i => (i.producto_id || i.insumo_id) && parseFloat(i.cantidad) > 0 && parseFloat(i.precio_unitario) > 0)
  const canSavePed = !!formPed.proveedor_id && formPed.items.some(i => i.descripcion.trim())

  const dbItemToFormItem = (i: FacItemDB): ItemFac => ({
    producto_id: i.producto_id ?? '',
    insumo_id:   i.insumo_id   ?? '',
    producto_nombre: i.descripcion,
    descripcion:     i.descripcion,
    cantidad:        String(i.cantidad),
    precio_unitario: String(i.precio_unitario),
    precio_venta:    String((i as { precio_venta?: number }).precio_venta ?? ''),
    _itemSel: {
      id: i.producto_id || i.insumo_id || i.id,
      nombre: i.descripcion,
      stock_actual: 0,
      precio_ref: i.precio_unitario,
      _tipo: i.producto_id ? 'producto' : 'insumo',
    },
    _busqueda: i.descripcion, _mostrarRes: false, _showCrear: false, _tipoCrear: 'insumo',
  })

  const abrirEditarFactura = (f: Factura) => {
    setEditFactura(f)
    setFormEditFull({
      proveedor_id:    f.proveedor?.id ?? '',
      numero_factura:  f.numero_factura ?? '',
      fecha:           f.fecha,
      fecha_vencimiento: f.fecha_vencimiento ?? '',
      estado:          f.estado,
      iva_pct:         f.iva && f.subtotal && f.subtotal > 0
        ? String(Math.round((f.iva / f.subtotal) * 100))
        : '0',
      notas: f.notas ?? '',
      items: f.items?.length ? f.items.map(dbItemToFormItem) : [{ ...EMPTY_ITEM }],
    })
  }

  const editItemsEndRef = useRef<HTMLDivElement>(null)
  const addItemEdit = () => {
    setFormEditFull(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM, _itemSel: null }] }))
    setTimeout(() => editItemsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 80)
  }
  const remItemEdit  = (i: number) => setFormEditFull(f => ({ ...f, items: f.items.filter((_,j) => j !== i) }))
  const setItemEdit  = (i: number, patch: Partial<ItemFac>) =>
    setFormEditFull(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, ...patch } : it) }))

  const subtotalEdit = formEditFull.items.reduce((s, i) => s + (parseFloat(i.cantidad)||0)*(parseFloat(i.precio_unitario)||0), 0)
  const ivaEdit      = subtotalEdit * (parseFloat(formEditFull.iva_pct)||0) / 100
  const totalEdit    = subtotalEdit + ivaEdit

  const abrirEditarPedido = (p: Pedido) => {
    setEditPedido(p)
    setFormPed({
      proveedor_id: p.proveedor?.id ?? '', numero_pedido: p.numero_pedido ?? '',
      descripcion: p.descripcion ?? '', estado: p.estado,
      fecha_pedido: p.fecha_pedido, fecha_entrega_esperada: p.fecha_entrega_esperada ?? '',
      notas: p.notas ?? '',
      items: p.items?.length ? p.items : [{ ...EMPTY_ITEM_PED }],
    })
    setShowPed(true)
  }

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Truck size={20} className="text-blue-400"/>
          <h2 className="text-lg font-bold text-white">Proveedores</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowProv(true)}
            className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px]">
            <Plus size={15}/> Proveedor
          </button>
          <button onClick={() => setShowFac(true)}
            className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px]">
            <FileText size={15}/> Factura
          </button>
        </div>
      </div>

      {/* Tabs + búsqueda global */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex gap-1 bg-brand-navy rounded-xl p-1 border border-white/5 flex-1 min-w-[280px]">
          {([
            { key: 'proveedores', label: `Proveedores (${proveedores.length})` },
            { key: 'pedidos',     label: `Pedidos (${pedidos.length})` },
            { key: 'compras',     label: `Compras (${compras.length})` },
            { key: 'facturas',    label: `Facturas (${facturas.length})` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors min-w-[70px]',
                tab === t.key ? 'bg-[#1A3A5C] text-white' : 'text-gray-500 hover:text-gray-300')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
          <input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar en este tab…"
            className="w-full bg-brand-navy border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white
                       placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 min-h-[42px]"/>
          {busq && (
            <button onClick={() => setBusq('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={13}/>
            </button>
          )}
        </div>
      </div>

      {/* Tab: Proveedores */}
      {tab === 'proveedores' && (
        <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
          {loadProv ? <div className="py-12 text-center text-sm text-gray-600">Cargando…</div>
          : proveedores.filter(p => {
              if (!busq) return true
              const q = busq.toLowerCase()
              return p.nombre.toLowerCase().includes(q)
                || (p.nit ?? '').toLowerCase().includes(q)
                || (p.contacto ?? '').toLowerCase().includes(q)
                || (p.telefono ?? '').toLowerCase().includes(q)
            }).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
              <Truck size={36} className="opacity-20"/>
              <p className="text-sm">{busq ? 'Sin resultados' : 'No hay proveedores registrados'}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {proveedores.filter(p => {
                if (!busq) return true
                const q = busq.toLowerCase()
                return p.nombre.toLowerCase().includes(q)
                  || (p.nit ?? '').toLowerCase().includes(q)
                  || (p.contacto ?? '').toLowerCase().includes(q)
                  || (p.telefono ?? '').toLowerCase().includes(q)
              }).map(p => (
                <div key={p.id} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Truck size={16} className="text-blue-400"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{p.nombre}</p>
                    <div className="flex gap-3 mt-0.5 flex-wrap">
                      {p.nit && <p className="text-[10px] text-gray-500">NIT: {p.nit}</p>}
                      {p.telefono && <p className="text-[10px] text-gray-500 flex items-center gap-1"><Phone size={9}/>{p.telefono}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => {
                      setEditProv(p)
                      setFormProv({ nombre:p.nombre, nit:p.nit??'', contacto:p.contacto??'', telefono:p.telefono??'', email:p.email??'', direccion:'', notas:'' })
                      setShowProv(true)
                    }} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg border border-white/10 transition-colors">
                      <Edit2 size={12}/>
                    </button>
                    <button onClick={() => imprimirProveedor(p)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10 border border-white/10 transition-colors">
                      <Printer size={12}/>
                    </button>
                    <button onClick={() => { if(confirm(`¿Eliminar proveedor "${p.nombre}"?`)) desactivarProv(p.id) }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 transition-colors">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Pedidos */}
      {tab === 'pedidos' && (
        <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
          {loadPed ? <div className="py-12 text-center text-sm text-gray-600">Cargando…</div>
          : pedidos.filter(p => {
              if (!busq) return true
              const q = busq.toLowerCase()
              return (p.proveedor?.nombre ?? '').toLowerCase().includes(q)
                || (p.numero_pedido ?? '').toLowerCase().includes(q)
                || (p.descripcion ?? '').toLowerCase().includes(q)
                || p.estado.toLowerCase().includes(q)
            }).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
              <Package size={36} className="opacity-20"/>
              <p className="text-sm">{busq ? 'Sin resultados' : 'No hay pedidos registrados'}</p>
              {!busq && (
                <button onClick={() => { setEditPedido(null); setFormPed(EMPTY_PED); setShowPed(true) }}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                  <Plus size={11}/> Crear primer pedido
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {pedidos.filter(p => {
                if (!busq) return true
                const q = busq.toLowerCase()
                return (p.proveedor?.nombre ?? '').toLowerCase().includes(q)
                  || (p.numero_pedido ?? '').toLowerCase().includes(q)
                  || (p.descripcion ?? '').toLowerCase().includes(q)
                  || p.estado.toLowerCase().includes(q)
              }).map(p => {
                const est = ESTADOS_PEDIDO[p.estado] ?? ESTADOS_PEDIDO.pendiente
                return (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', est.bg)}>
                        <Package size={15} className={est.color}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white truncate">{p.proveedor?.nombre ?? '—'}</p>
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase', est.bg, est.color)}>
                            {est.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {p.numero_pedido ? `#${p.numero_pedido} · ` : ''}
                          Pedido: {new Date(p.fecha_pedido + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                          {p.fecha_entrega_esperada && ` · Entrega: ${new Date(p.fecha_entrega_esperada + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short' })}`}
                          {p.fecha_recibido && ` · Recibido: ${new Date(p.fecha_recibido + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short' })}`}
                        </p>
                        {p.descripcion && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{p.descripcion}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {p.valor_total > 0 && <p className="text-sm font-bold text-white tabular-nums">{fmt(p.valor_total)}</p>}
                        <div className="flex gap-1">
                          <button onClick={() => abrirEditarPedido(p)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 border border-white/10 transition-colors">
                            <Edit2 size={12}/>
                          </button>
                          <button onClick={() => imprimirPedido(p)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10 border border-white/10 transition-colors">
                            <Printer size={12}/>
                          </button>
                          <button onClick={() => { if(confirm('¿Eliminar este pedido?')) eliminarPed(p.id) }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 transition-colors">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Cambio rápido de estado */}
                    {p.estado !== 'recibido' && p.estado !== 'cancelado' && (
                      <div className="flex gap-2 pl-12 flex-wrap">
                        {Object.entries(ESTADOS_PEDIDO)
                          .filter(([k]) => k !== p.estado && k !== 'recibido')
                          .map(([k, v]) => (
                          <button key={k} onClick={() => cambiarEstado({ id: p.id, estado: k })}
                            className={cn('text-[10px] px-2 py-1 rounded border transition-colors', v.bg, v.color, 'border-transparent hover:border-current')}>
                            → {v.label}
                          </button>
                        ))}
                        <button
                          onClick={() => cambiarEstado({ id: p.id, estado: 'recibido', fecha_recibido: new Date().toISOString().split('T')[0] })}
                          className="text-[10px] px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20">
                          ✓ Marcar recibido
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Compras (registro rápido de gastos de compra) */}
      {tab === 'compras' && (
        <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
          {loadCompras ? <div className="py-12 text-center text-sm text-gray-600">Cargando…</div>
          : compras.filter(f => {
              if (!busq) return true
              const q = busq.toLowerCase()
              return (f.proveedor?.nombre ?? '').toLowerCase().includes(q)
                || (f.notas ?? '').toLowerCase().includes(q)
                || String(f.total).includes(q)
                || f.estado.toLowerCase().includes(q)
            }).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
              <FileText size={36} className="opacity-20"/>
              <p className="text-sm">{busq ? 'Sin resultados' : 'No hay compras registradas'}</p>
              {!busq && (
                <button onClick={() => setShowCompra(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                  <Plus size={11}/> Registrar primera compra
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {compras.filter(f => {
                if (!busq) return true
                const q = busq.toLowerCase()
                return (f.proveedor?.nombre ?? '').toLowerCase().includes(q)
                  || (f.notas ?? '').toLowerCase().includes(q)
                  || String(f.total).includes(q)
                  || f.estado.toLowerCase().includes(q)
              }).map(f => (
                <div key={f.id} className="flex items-start gap-3 p-4">
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    f.estado === 'pagada' ? 'bg-green-500/10' : 'bg-amber-500/10')}>
                    {f.estado === 'pagada' ? <CheckCircle size={15} className="text-green-400"/> : <Clock size={15} className="text-amber-400"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{f.proveedor?.nombre ?? '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                      {f.notas ? ` · ${f.notas}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="text-sm font-bold text-white tabular-nums">{fmt(f.total)}</p>
                    <div className="flex gap-1">
                      {f.estado === 'pendiente' && (
                        <button onClick={() => setPagarFac(f)}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 min-h-[30px] flex items-center gap-1">
                          <CreditCard size={11}/> Pagar
                        </button>
                      )}
                      <button onClick={() => imprimirFactura(f)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10 border border-white/10 transition-colors">
                        <Printer size={12}/>
                      </button>
                      {isSuperAdmin && (
                        <>
                          <button onClick={() => abrirEditarFactura(f)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 border border-white/10 transition-colors"
                            title="Solo superadmin">
                            <Edit2 size={12}/>
                          </button>
                          <button onClick={() => { if(confirm('¿Eliminar esta compra? Esta acción no se puede deshacer.')) eliminarFac(f.id) }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 transition-colors"
                            title="Solo superadmin">
                            <Trash2 size={12}/>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Facturas */}
      {tab === 'facturas' && (
        <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
            {loadFac ? <div className="py-12 text-center text-sm text-gray-600">Cargando…</div>
            : facturas.filter(f => {
                if (!busq) return true
                const q = busq.toLowerCase()
                return (f.numero_factura ?? '').toLowerCase().includes(q)
                  || (f.proveedor?.nombre ?? '').toLowerCase().includes(q)
                  || String(f.total).includes(q)
                  || (f.estado).toLowerCase().includes(q)
                  || (f.notas ?? '').toLowerCase().includes(q)
                  || (f.items ?? []).some(i => i.descripcion.toLowerCase().includes(q))
              }).length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
                <FileText size={36} className="opacity-20"/>
                <p className="text-sm">{busq ? 'Sin resultados' : 'No hay facturas registradas'}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {facturas.filter(f => {
                  if (!busq) return true
                  const q = busq.toLowerCase()
                  return (f.numero_factura ?? '').toLowerCase().includes(q)
                    || (f.proveedor?.nombre ?? '').toLowerCase().includes(q)
                    || String(f.total).includes(q)
                    || (f.estado).toLowerCase().includes(q)
                    || (f.notas ?? '').toLowerCase().includes(q)
                    || (f.items ?? []).some(i => i.descripcion.toLowerCase().includes(q))
                }).map(f => (
                  <div key={f.id} className="flex items-start gap-3 p-4">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                      f.estado === 'pagada' ? 'bg-green-500/10' : 'bg-amber-500/10')}>
                      {f.estado === 'pagada' ? <CheckCircle size={15} className="text-green-400"/> : <Clock size={15} className="text-amber-400"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{f.proveedor?.nombre ?? '—'}</p>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-bold uppercase flex-shrink-0',
                          f.estado === 'pagada' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400')}>
                          {f.estado === 'pagada' ? 'Pagada' : 'Por pagar'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {f.numero_factura ? `#${f.numero_factura} · ` : ''}
                        {new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                        {f.fecha_vencimiento && ` · Vence: ${new Date(f.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short' })}`}
                      </p>
                      {(f.iva ?? 0) > 0 && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Subtotal: {fmt(f.subtotal ?? 0)} + IVA: {fmt(f.iva ?? 0)}
                        </p>
                      )}
                      {f.notas && <p className="text-[10px] text-gray-600 mt-0.5 truncate">{f.notas}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <p className="text-sm font-bold text-white tabular-nums">{fmt(f.total)}</p>
                      <div className="flex gap-1">
                        {f.estado === 'pendiente' && (
                          <button onClick={() => setPagarFac(f)}
                            className="text-[10px] px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 min-h-[30px] flex items-center gap-1">
                            <CreditCard size={11}/> Pagar
                          </button>
                        )}
                        <button onClick={() => imprimirFactura(f)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10 border border-white/10 transition-colors">
                          <Printer size={12}/>
                        </button>
                        {isSuperAdmin && (
                          <>
                            <button onClick={() => abrirEditarFactura(f)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 border border-white/10 transition-colors"
                              title="Solo superadmin">
                              <Edit2 size={12}/>
                            </button>
                            <button onClick={() => { if(confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) eliminarFac(f.id) }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 transition-colors"
                              title="Solo superadmin">
                              <Trash2 size={12}/>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Modal Compra rápida */}
      {showCompra && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">Nueva compra</h3>
              <button onClick={() => setShowCompra(false)}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Proveedor *</label>
                <select value={formCompra.proveedor_id} onChange={e => setFormCompra(f => ({ ...f, proveedor_id: e.target.value }))}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none min-h-[48px]">
                  <option value="">Seleccionar…</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Descripción de la compra *</label>
                <input value={formCompra.descripcion} onChange={e => setFormCompra(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="¿Qué se compró?"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Monto total *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                    <input type="number" min="0" value={formCompra.monto}
                      onChange={e => setFormCompra(f => ({ ...f, monto: e.target.value }))} placeholder="0"
                      className="w-full bg-brand-dark border border-white/10 rounded-xl pl-6 pr-3 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Fecha</label>
                  <input type="date" value={formCompra.fecha} onChange={e => setFormCompra(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Método de pago</label>
                <div className="flex gap-2 flex-wrap">
                  {['efectivo','transferencia','crédito'].map(m => (
                    <button key={m} type="button" onClick={() => setFormCompra(f => ({ ...f, metodo_pago: m }))}
                      className={cn('px-3 py-2 rounded-lg text-xs border transition-colors capitalize min-h-[36px]',
                        formCompra.metodo_pago === m
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                          : 'bg-brand-dark border-white/10 text-gray-500 hover:text-gray-300')}>
                      {m === 'transferencia' ? 'Pago Electrónico' : m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Notas</label>
                <input value={formCompra.notas} onChange={e => setFormCompra(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Observaciones adicionales…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowCompra(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">Cancelar</button>
              <button disabled={!formCompra.proveedor_id || !formCompra.descripcion || !formCompra.monto || pendCompra}
                onClick={() => guardarCompra()}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-brand-dark font-bold text-sm disabled:opacity-40 min-h-[48px]">
                {pendCompra ? 'Guardando…' : 'Registrar compra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal proveedor */}
      {showProv && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">{editProv ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
              <button onClick={() => { setShowProv(false); setEditProv(null); setFormProv(EMPTY_PROV) }}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-3">
              {([['nombre','Nombre *'],['nit','NIT'],['contacto','Persona de contacto'],['telefono','Teléfono'],['email','Email']] as [string,string][]).map(([k,label]) => (
                <div key={k}>
                  <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
                  <input value={(formProv as any)[k]} onChange={e => setFormProv(f => ({ ...f, [k]: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 min-h-[48px]"/>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setShowProv(false); setEditProv(null); setFormProv(EMPTY_PROV) }}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">Cancelar</button>
              <button disabled={!formProv.nombre || pendProv} onClick={() => guardarProv()}
                className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm disabled:opacity-40 min-h-[48px]">
                {pendProv ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pedido */}
      {showPed && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#2C2925] rounded-t-2xl z-10">
              <h3 className="text-white font-bold">{editPedido ? 'Editar pedido' : 'Nuevo pedido'}</h3>
              <button onClick={() => { setShowPed(false); setEditPedido(null); setFormPed(EMPTY_PED) }}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Proveedor *</label>
                  <select value={formPed.proveedor_id} onChange={e => setFormPed(f => ({ ...f, proveedor_id: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none min-h-[48px]">
                    <option value="">Seleccionar…</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">N° Pedido</label>
                  <input value={formPed.numero_pedido} onChange={e => setFormPed(f => ({ ...f, numero_pedido: e.target.value }))}
                    placeholder="PED-001"
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Descripción del pedido</label>
                <textarea value={formPed.descripcion} onChange={e => setFormPed(f => ({ ...f, descripcion: e.target.value }))}
                  rows={2} placeholder="Descripción general del pedido…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none resize-none"/>
              </div>
              {/* Estado */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Estado</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setFormPed(f => ({ ...f, estado: k }))}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        formPed.estado === k ? cn(v.bg, v.color, 'border-current') : 'bg-brand-dark border-white/10 text-gray-500 hover:text-gray-300')}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Fecha del pedido</label>
                  <input type="date" value={formPed.fecha_pedido} onChange={e => setFormPed(f => ({ ...f, fecha_pedido: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Fecha de entrega esperada</label>
                  <input type="date" value={formPed.fecha_entrega_esperada} onChange={e => setFormPed(f => ({ ...f, fecha_entrega_esperada: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
              </div>
              {/* Ítems */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Ítems del pedido</label>
                  <button onClick={addItemPed} className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 min-h-[32px] px-2">
                    <Plus size={11}/> Agregar ítem
                  </button>
                </div>
                <div className="space-y-3">
                  {formPed.items.map((item, i) => (
                    <ItemPedidoRow key={i} item={item} index={i} canRemove={formPed.items.length > 1}
                      onChange={patch => setItemPed(i, patch)} onRemove={() => remItemPed(i)}/>
                  ))}
                </div>
              </div>
              {totalPed > 0 && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 flex justify-between">
                  <p className="text-sm text-gray-300">Total estimado</p>
                  <p className="text-sm font-bold text-purple-400">{fmt(totalPed)}</p>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Notas</label>
                <textarea value={formPed.notas} onChange={e => setFormPed(f => ({ ...f, notas: e.target.value }))}
                  rows={2} placeholder="Observaciones adicionales…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none resize-none"/>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setShowPed(false); setEditPedido(null); setFormPed(EMPTY_PED) }}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">Cancelar</button>
              <button disabled={!canSavePed || pendPed} onClick={() => guardarPed()}
                className="flex-1 py-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-bold text-sm disabled:opacity-40 min-h-[48px]">
                {pendPed ? 'Guardando…' : editPedido ? 'Actualizar pedido' : 'Crear pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar factura/compra — detalle completo */}
      {editFactura && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#2C2925] rounded-t-2xl z-10">
              <h3 className="text-white font-bold">Editar factura</h3>
              <button onClick={() => setEditFactura(null)}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Proveedor + N° */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Proveedor *</label>
                  <select value={formEditFull.proveedor_id} onChange={e => setFormEditFull(f => ({ ...f, proveedor_id: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-sm text-white focus:outline-none min-h-[48px]">
                    <option value="">Seleccionar…</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">N° Factura</label>
                  <input value={formEditFull.numero_factura} onChange={e => setFormEditFull(f => ({ ...f, numero_factura: e.target.value }))}
                    placeholder="001-2025"
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
              </div>
              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Fecha factura</label>
                  <input type="date" value={formEditFull.fecha} onChange={e => setFormEditFull(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Fecha límite pago</label>
                  <input type="date" value={formEditFull.fecha_vencimiento} onChange={e => setFormEditFull(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
                </div>
              </div>
              {/* Estado */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Estado</label>
                <div className="flex gap-2">
                  {[['pendiente','Por pagar','text-amber-400','bg-amber-500/20 border-amber-500/50'],
                    ['pagada','Pagada','text-green-400','bg-green-500/20 border-green-500/50']].map(([v,label,tc,active]) => (
                    <button key={v} type="button" onClick={() => setFormEditFull(f => ({ ...f, estado: v }))}
                      className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors min-h-[44px]',
                        formEditFull.estado === v ? `${active} ${tc}` : 'bg-brand-dark border-white/10 text-gray-500')}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* IVA */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">IVA %</label>
                <div className="flex gap-2">
                  {['0','5','19'].map(v => (
                    <button key={v} type="button" onClick={() => setFormEditFull(f => ({ ...f, iva_pct: v }))}
                      className={cn('px-4 py-2.5 rounded-xl text-sm border transition-colors min-h-[44px]',
                        formEditFull.iva_pct === v ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-brand-dark border-white/10 text-gray-500 hover:text-gray-300')}>
                      {v}%
                    </button>
                  ))}
                  <input type="number" min="0" max="100" value={formEditFull.iva_pct}
                    onChange={e => setFormEditFull(f => ({ ...f, iva_pct: e.target.value }))}
                    placeholder="Otro"
                    className="flex-1 bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none min-h-[44px]"/>
                </div>
              </div>
              {/* Ítems */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Productos / insumos</label>
                <div className="space-y-3">
                  {formEditFull.items.map((item, i) => (
                    <ItemCompraRow key={i} item={item} index={i} canRemove={formEditFull.items.length > 1}
                      onPatch={patch => setItemEdit(i, patch)} onRemove={() => remItemEdit(i)}/>
                  ))}
                  <button onClick={addItemEdit} className="w-full py-2.5 text-[11px] text-green-400 hover:text-green-300
                    border border-dashed border-green-500/30 hover:border-green-500/60 rounded-xl
                    flex items-center justify-center gap-1.5 transition-colors">
                    <Plus size={12}/> Agregar artículo
                  </button>
                  <div ref={editItemsEndRef}/>
                </div>
              </div>
              {/* Totales */}
              <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 space-y-1">
                {ivaEdit > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Subtotal</span><span>{fmt(subtotalEdit)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>IVA {formEditFull.iva_pct}%</span><span>{fmt(ivaEdit)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-bold text-white text-sm">
                  <span>TOTAL</span><span className="text-green-400">{fmt(totalEdit)}</span>
                </div>
              </div>
              {/* Notas */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Notas</label>
                <input value={formEditFull.notas} onChange={e => setFormEditFull(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Observaciones…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none min-h-[48px]"/>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2 sticky bottom-0 bg-[#2C2925] pt-3 border-t border-white/5">
              <button onClick={() => setEditFactura(null)}
                className="py-3 px-4 rounded-xl border border-white/10 text-gray-400 text-sm min-h-[48px]">Cancelar</button>
              <button onClick={() => imprimirFactura(editFactura!)}
                className="w-11 h-11 flex items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 flex-shrink-0 min-h-[48px]">
                <Printer size={16}/>
              </button>
              <button disabled={!formEditFull.proveedor_id || pendEditFac} onClick={() => editarFacturaMut()}
                className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm disabled:opacity-40 min-h-[48px]">
                {pendEditFac ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFac && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4
                        bg-black/70 backdrop-blur-sm">
          <div className="bg-[#2C2925] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl
                          max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-brand-teal"/>
                <h3 className="text-white font-bold text-sm">Registrar factura proveedor</h3>
              </div>
              <button onClick={() => { setShowFac(false); setFormFac(EMPTY_FAC) }}
                className="w-9 h-9 flex items-center justify-center rounded-xl
                           text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                <X size={18}/>
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Encabezado factura — N° Factura | Fecha | Proveedor */}
              <div className="grid grid-cols-3 gap-3 bg-brand-dark/60 rounded-xl border border-white/8 p-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">N° Factura</label>
                  <input value={formFac.numero_factura}
                    onChange={e => setFormFac(f => ({ ...f, numero_factura: e.target.value }))}
                    placeholder="001-2025"
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                               text-sm text-white font-mono focus:outline-none focus:border-brand-teal
                               placeholder:text-gray-700"/>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Fecha de compra</label>
                  <input type="date" value={formFac.fecha}
                    onChange={e => setFormFac(f => ({ ...f, fecha: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                               text-sm text-white focus:outline-none focus:border-brand-teal [color-scheme:dark]"/>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Proveedor *</label>
                  <select value={formFac.proveedor_id}
                    onChange={e => setFormFac(f => ({ ...f, proveedor_id: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                               text-sm text-white focus:outline-none focus:border-brand-teal">
                    <option value="">Seleccionar…</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowProv(true)}
                    className="flex items-center gap-1 text-[10px] text-brand-teal hover:text-white mt-1 transition-colors">
                    <Plus size={9}/> Crear proveedor nuevo
                  </button>
                </div>
              </div>

              {/* Tipo de cuenta + fecha límite */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Tipo de cuenta</label>
                  <div className="flex gap-2">
                    {(['pagar','pagada'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setFormFac(f => ({ ...f, tipo_cuenta: t }))}
                        className={cn('flex-1 py-2 rounded-xl text-xs font-medium border transition-colors',
                          formFac.tipo_cuenta === t
                            ? t === 'pagar' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-green-500/20 border-green-500/50 text-green-400'
                            : 'bg-brand-dark border-white/10 text-gray-500 hover:text-gray-300')}>
                        {t === 'pagar' ? '📤 Por pagar' : '✅ Pagada'}
                      </button>
                    ))}
                  </div>
                </div>
                {formFac.tipo_cuenta === 'pagar' && (
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Fecha límite de pago</label>
                    <input type="date" value={formFac.fecha_vencimiento}
                      onChange={e => setFormFac(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                      className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                                 text-sm text-white focus:outline-none focus:border-brand-teal [color-scheme:dark]"/>
                  </div>
                )}
              </div>

              {/* Sección detalle artículos */}
              <div>
                <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                  Detalle de Artículos
                </p>
                <div className="space-y-2">
                  {formFac.items.map((item, i) => (
                    <ItemCompraRow key={i} item={item} index={i} canRemove={formFac.items.length > 1}
                      onPatch={patch => setItem(i, patch)} onRemove={() => remItem(i)}/>
                  ))}
                </div>
              </div>

              {/* IVA + Notas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">IVA %</label>
                  <select value={formFac.iva_pct}
                    onChange={e => setFormFac(f => ({ ...f, iva_pct: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                               text-sm text-white focus:outline-none focus:border-brand-teal">
                    <option value="0">Sin IVA (0%)</option>
                    <option value="5">5%</option>
                    <option value="19">19%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Notas</label>
                  <input value={formFac.notas}
                    onChange={e => setFormFac(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Observaciones…"
                    className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                               text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-teal"/>
                </div>
              </div>

              {/* Total general */}
              {totalFac > 0 && (
                <div className="flex justify-end">
                  <div className="bg-brand-dark/80 border border-white/10 rounded-xl px-4 py-2.5 text-right space-y-0.5">
                    {ivaFac > 0 && (
                      <div className="flex gap-6 text-xs text-gray-400 justify-between">
                        <span>Subtotal</span><span>{fmtCOP(subtotalFac)}</span>
                      </div>
                    )}
                    {ivaFac > 0 && (
                      <div className="flex gap-6 text-xs text-amber-400 justify-between">
                        <span>IVA ({formFac.iva_pct}%)</span><span>{fmtCOP(ivaFac)}</span>
                      </div>
                    )}
                    <div className="flex gap-6 justify-between">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total General</p>
                      <p className="text-lg font-bold text-[#EA580C] tabular-nums">{fmtCOP(totalFac)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer — mismo patrón que Planilla */}
            <div className="px-4 pb-4 pt-3 border-t border-white/8 flex-shrink-0 space-y-2">
              {/* Fila 1: Cancelar | Imprimir | Añadir Artículo */}
              <div className="flex gap-2">
                <button onClick={() => { setShowFac(false); setFormFac(EMPTY_FAC) }}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                             text-sm hover:bg-white/5 transition-colors min-h-[44px]">
                  Cancelar
                </button>
                <button onClick={imprimirFacturaProv} disabled={!canSaveFac} title="Imprimir factura"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10
                             text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30
                             transition-colors text-sm min-h-[44px] flex-shrink-0">
                  <Printer size={14}/> Imprimir
                </button>
                <button onClick={addItem}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-brand-teal/40
                             text-brand-teal hover:bg-brand-teal/10 text-sm min-h-[44px] flex-shrink-0
                             transition-colors">
                  <Plus size={14}/> Añadir Artículo
                </button>
              </div>
              {/* Fila 2: Registrar */}
              <button disabled={!canSaveFac || pendFac} onClick={() => guardarFac()}
                className="w-full py-3 rounded-xl bg-brand-teal hover:bg-[#00A882] text-brand-dark
                           font-bold text-sm disabled:opacity-40 transition-colors min-h-[48px]">
                {pendFac ? 'Guardando…' : '+ Registrar factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pagar factura */}
      {pagarFac && (
        <ModalPagarFactura
          factura={pagarFac}
          onClose={() => setPagarFac(null)}
          onPagada={() => {
            qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
            setPagarFac(null)
          }}
        />
      )}
    </div>
  )
}
