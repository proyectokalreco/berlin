import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, X, Edit2, Trash2, CheckCircle,
  ChevronDown, ChevronUp, Package, Search, Lock, AlertTriangle, Printer,
} from 'lucide-react'
import { api } from '../../../lib/api'
import FormCrearProductoRapido from '../../../components/FormCrearProductoRapido'
import toast from 'react-hot-toast'
import type { Planilla, PlanillaItem, Producto, Receta } from '../../../types'
import { useAuthStore } from '../../../store/authStore'

interface DescuadreInsumo {
  insumo_id:    string
  nombre:       string
  stock_actual: number
  consumo:      number
  faltante:     number
  unidad:       string
}
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)

const fmtFecha = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

function isEmojiIcon(s?: string | null) {
  return !!s && !s.startsWith('http') && s.length <= 8
}

// ── Badge de estado ───────────────────────────────────────────
function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={cn(
      'text-[11px] font-bold px-2.5 py-1 rounded-full border',
      estado === 'abierta'
        ? 'bg-green-500/15 text-green-400 border-green-500/25'
        : 'bg-gray-500/15 text-gray-400 border-gray-500/25',
    )}>
      {estado === 'abierta' ? '● Abierta' : '✓ Cerrada'}
    </span>
  )
}

// ── Grupo de factura (agrupa items por numero_factura) ────────
type ItemExt = PlanillaItem & { numero_factura?: string; precio_venta_unitario?: number }

function FacturaGrupo({
  numFac, items, cerrada, isSuperAdmin,
  onEdit, onDelete, onImprimir,
}: {
  numFac:       string
  items:        ItemExt[]
  cerrada:      boolean
  isSuperAdmin: boolean
  onEdit:       (item: PlanillaItem) => void
  onDelete:     (item: PlanillaItem) => void
  onImprimir:   (numFac: string, items: ItemExt[]) => void
}) {
  const [open, setOpen] = useState(false)
  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n)
  const totalUnd  = items.reduce((s, i) => s + Number(i.cantidad_producida), 0)
  const totalVal  = items.reduce((s, i) => s + Number(i.cantidad_producida) * (i.precio_venta_unitario ?? 0), 0)
  const fecha     = items[0]?.created_at
    ? new Date(items[0].created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})
    : ''

  return (
    <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden mb-2">
      {/* Encabezado de factura */}
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-brand-teal font-bold">{numFac}</span>
            {fecha && <span className="text-[9px] text-gray-600">{fecha}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {items.length} producto{items.length !== 1 ? 's' : ''} · {fmt(totalUnd)} unid.
            {totalVal > 0 && <span className="text-[#EA580C] ml-2 font-semibold">{fmtCOP(totalVal)}</span>}
          </p>
        </div>
        <button onClick={e => { e.stopPropagation(); onImprimir(numFac, items) }}
          title="Imprimir factura"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500
                     hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
          <Printer size={12}/>
        </button>
        {open ? <ChevronUp size={13} className="text-gray-500 flex-shrink-0"/>
              : <ChevronDown size={13} className="text-gray-500 flex-shrink-0"/>}
      </button>

      {/* Detalle de líneas */}
      {open && (
        <div className="border-t border-white/5">
          {/* Tabla encabezado */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-white/2">
            <span className="text-[9px] uppercase text-gray-600 tracking-wide">Descripción</span>
            <span className="text-[9px] uppercase text-gray-600 tracking-wide text-right">Cant.</span>
            <span className="text-[9px] uppercase text-gray-600 tracking-wide text-right">V.Neto/u.</span>
            <span className="text-[9px] uppercase text-gray-600 tracking-wide text-right">V.Total</span>
          </div>
          <div className="divide-y divide-white/3">
            {items.map(item => {
              const p   = item.producto
              const pv  = item.precio_venta_unitario ?? 0
              const qty = Number(item.cantidad_producida)
              return (
                <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2.5 items-center
                                              hover:bg-white/2 transition-colors group">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden bg-brand-teal/10
                                    flex items-center justify-center border border-white/5">
                      {p?.imagen_url && !isEmojiIcon(p.imagen_url)
                        ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover"/>
                        : <span className="text-sm">{p?.imagen_url || '🍞'}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{p?.nombre ?? '—'}</p>
                      {item.receta && <p className="text-[9px] text-gray-600 truncate">{item.receta.nombre}</p>}
                      {item.notas  && <p className="text-[9px] text-gray-700 italic truncate">{item.notas}</p>}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-brand-teal tabular-nums text-right">{fmt(qty)}</span>
                  <span className="text-xs text-gray-400 text-right tabular-nums">
                    {pv > 0 ? fmtCOP(pv) : '—'}
                  </span>
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-xs font-semibold text-white tabular-nums">
                      {pv > 0 ? fmtCOP(pv * qty) : '—'}
                    </span>
                    {/* Acciones — solo superadmin y planilla abierta */}
                    {!cerrada && isSuperAdmin && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                        <button onClick={() => onEdit(item)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-500
                                     hover:text-brand-teal hover:bg-brand-teal/10 transition-colors">
                          <Edit2 size={11}/>
                        </button>
                        <button onClick={() => onDelete(item)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-500
                                     hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 size={11}/>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Total de la factura */}
          {totalVal > 0 && (
            <div className="flex justify-end px-4 py-2 border-t border-white/5 bg-white/1">
              <span className="text-xs text-gray-500 mr-3">TOTAL FACTURA</span>
              <span className="text-sm font-bold text-[#EA580C]">{fmtCOP(totalVal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ItemCard legacy (usado solo en historial) ─────────────────
function ItemCard({
  item, cerrada, isSuperAdmin,
  onEdit, onDelete,
}: {
  item:         PlanillaItem
  cerrada:      boolean
  isSuperAdmin: boolean
  onEdit:       (item: PlanillaItem) => void
  onDelete:     (item: PlanillaItem) => void
}) {
  const p = item.producto
  const ext = item as unknown as ItemExt
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/2 transition-colors group">
      <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden
                      bg-brand-teal/10 flex items-center justify-center border border-white/5">
        {p?.imagen_url && !isEmojiIcon(p.imagen_url)
          ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-xl">{p?.imagen_url || '🍞'}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{p?.nombre ?? '—'}</p>
        {ext.numero_factura && (
          <p className="text-[10px] text-brand-teal mt-0.5 truncate font-mono">#{ext.numero_factura}</p>
        )}
        {item.receta && <p className="text-[10px] text-gray-500 mt-0.5 truncate">Receta: {item.receta.nombre}</p>}
      </div>
      <div className="text-right flex-shrink-0 min-w-[70px]">
        <p className="text-lg font-bold text-brand-teal tabular-nums">{fmt(item.cantidad_producida)}</p>
        <p className="text-[10px] text-gray-600">{p?.unidad_venta ?? 'unid.'}</p>
      </div>
      {!cerrada && isSuperAdmin && (
        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(item)}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-gray-500 hover:text-brand-teal hover:bg-brand-teal/10 transition-colors">
            <Edit2 size={13} />
          </button>
          <button onClick={() => onDelete(item)}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Fila de producto dentro del modal factura ─────────────────
interface LineaProd {
  producto:    Producto | null
  recetaId:    string
  cantidad:    string
  precioVenta: string
  iva:         string
  notas:       string
  busqueda:    string
  mostrarRes:  boolean
  showCrear:   boolean
}
const LINEA_VACIA: LineaProd = {
  producto: null, recetaId: '', cantidad: '', precioVenta: '',
  iva: '0', notas: '', busqueda: '', mostrarRes: false, showCrear: false,
}

function FilaLinea({
  linea, index, canRemove,
  onPatch, onRemove,
}: {
  linea:    LineaProd
  index:    number
  canRemove: boolean
  onPatch:  (p: Partial<LineaProd>) => void
  onRemove: () => void
}) {
  const { data: resultados = [] } = useQuery<Producto[]>({
    queryKey: ['prod-busq-plan', linea.busqueda],
    queryFn:  () => api.get('/berlin/productos', { params: { q: linea.busqueda, limit: 6 } }).then(r => r.data),
    enabled:  linea.busqueda.length >= 1 && !linea.producto,
  })
  const { data: recetas = [] } = useQuery<Receta[]>({
    queryKey: ['recetas-prod-plan', linea.producto?.id],
    queryFn:  () => api.get('/berlin/recetas', { params: { producto_id: linea.producto?.id } }).then(r => r.data),
    enabled:  !!linea.producto?.id,
  })

  const seleccionar = (p: Producto) => {
    onPatch({ producto: p, busqueda: p.nombre, mostrarRes: false,
      precioVenta: linea.precioVenta || String(p.precio_venta ?? '') })
  }

  const qty = parseFloat(linea.cantidad) || 0
  const pv  = parseFloat(linea.precioVenta) || 0
  const iva = parseFloat(linea.iva) || 0
  const sub = qty * pv
  const total = sub + sub * iva / 100

  return (
    <div className="bg-brand-dark rounded-xl border border-white/8 p-3 space-y-2">
      {/* Fila encabezado */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600 font-mono">LÍNEA {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 size={13}/>
          </button>
        )}
      </div>

      {/* Producto */}
      {linea.producto ? (
        <div className="flex items-center gap-2 bg-[#1C1A18] rounded-lg px-3 py-2 border border-brand-teal/30">
          <span className="text-sm flex-shrink-0">
            {linea.producto.imagen_url && !isEmojiIcon(linea.producto.imagen_url)
              ? <img src={linea.producto.imagen_url} alt="" className="w-5 h-5 rounded object-cover"/>
              : (linea.producto.imagen_url || '🍞')}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{linea.producto.nombre}</p>
            <p className="text-[9px] text-gray-500">Stock: {fmt(linea.producto.stock_actual)}</p>
          </div>
          <button onClick={() => onPatch({ producto: null, busqueda: '', recetaId: '' })}
            className="text-gray-500 hover:text-red-400 flex-shrink-0"><X size={12}/></button>
        </div>
      ) : linea.showCrear ? (
        <FormCrearProductoRapido
          nombreInicial={linea.busqueda}
          onCreado={p => onPatch({ producto: p, busqueda: p.nombre, showCrear: false,
            precioVenta: linea.precioVenta || String(p.precio_venta ?? '') })}
          onCancelar={() => onPatch({ showCrear: false })}
        />
      ) : (
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
          <input value={linea.busqueda}
            onChange={e => onPatch({ busqueda: e.target.value, mostrarRes: true })}
            onFocus={() => onPatch({ mostrarRes: true })}
            placeholder="Descripción del producto…"
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg pl-8 pr-3 py-2
                       text-xs text-white focus:outline-none focus:border-brand-teal placeholder:text-gray-600"/>
          {linea.mostrarRes && linea.busqueda.length >= 1 && resultados.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#1C1A18] border border-white/15
                            rounded-xl shadow-2xl z-20 overflow-hidden max-h-48 overflow-y-auto">
              {resultados.map(p => (
                <button key={p.id} type="button" onClick={() => seleccionar(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
                  <span className="text-sm w-5 flex-shrink-0 text-center">
                    {p.imagen_url && !isEmojiIcon(p.imagen_url)
                      ? <img src={p.imagen_url} alt="" className="w-4 h-4 rounded object-cover"/>
                      : (p.imagen_url || '🍞')}
                  </span>
                  <p className="text-xs text-white truncate">{p.nombre}</p>
                  <p className="text-[9px] text-gray-500 flex-shrink-0">{fmt(p.stock_actual)}</p>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => onPatch({ showCrear: true, mostrarRes: false })}
            className="flex items-center gap-1 text-[10px] text-brand-teal hover:text-white mt-1 transition-colors">
            <Plus size={10}/> {linea.busqueda.trim() ? `Crear "${linea.busqueda}"` : 'Crear producto nuevo'}
          </button>
        </div>
      )}

      {/* Receta */}
      {recetas.length > 0 && (
        <select value={linea.recetaId} onChange={e => onPatch({ recetaId: e.target.value })}
          className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300
                     focus:outline-none focus:border-brand-teal">
          <option value="">Sin receta</option>
          {recetas.map(r => <option key={r.id} value={r.id}>{r.nombre} (rinde {r.rendimiento})</option>)}
        </select>
      )}

      {/* Cant | Precio | IVA | Total */}
      <div className="grid grid-cols-4 gap-1.5">
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">Cant.</p>
          <input type="number" min="1" value={linea.cantidad}
            onChange={e => onPatch({ cantidad: e.target.value })}
            placeholder="0"
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-2 py-2
                       text-xs text-white text-center focus:outline-none focus:border-brand-teal
                       placeholder:text-gray-600"/>
        </div>
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">V.Neto/u.</p>
          <div className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">$</span>
            <input type="number" min="0" value={linea.precioVenta}
              onChange={e => onPatch({ precioVenta: e.target.value })}
              placeholder="0"
              className="w-full bg-[#1C1A18] border border-white/10 rounded-lg pl-4 pr-1 py-2
                         text-xs text-white focus:outline-none focus:border-brand-teal
                         placeholder:text-gray-600"/>
          </div>
        </div>
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">IVA %</p>
          <select value={linea.iva} onChange={e => onPatch({ iva: e.target.value })}
            className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-1 py-2
                       text-xs text-white focus:outline-none focus:border-brand-teal">
            <option value="0">0%</option>
            <option value="5">5%</option>
            <option value="19">19%</option>
          </select>
        </div>
        <div>
          <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">V. Total</p>
          <div className="bg-[#1C1A18] border border-white/5 rounded-lg px-2 py-2 text-xs
                          text-brand-teal font-bold text-right">
            {total > 0
              ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(total)
              : '$0'}
          </div>
        </div>
      </div>

      {/* Descripción/Observaciones */}
      <input value={linea.notas} onChange={e => onPatch({ notas: e.target.value })}
        placeholder="Observaciones (opcional)"
        className="w-full bg-[#1C1A18] border border-white/10 rounded-lg px-3 py-1.5 text-xs
                   text-white focus:outline-none focus:border-brand-teal placeholder:text-gray-600"/>
    </div>
  )
}

// ── Modal agregar / editar ítem ───────────────────────────────
function ModalItem({
  planillaId,
  editItem,
  onClose,
}: {
  planillaId: string
  editItem:   PlanillaItem | null
  onClose:    () => void
}) {
  const qc = useQueryClient()
  const esEdicion = !!editItem
  const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Número de factura: en edición viene del item; en nuevo se pre-genera en frontend
  const numFactEdit = (editItem as unknown as { numero_factura?: string })?.numero_factura ?? ''
  const [numeroFactura, setNumeroFactura] = useState(() => {
    if (numFactEdit) return numFactEdit
    const d = new Date()
    const fecha = d.toISOString().split('T')[0].replace(/-/g, '')
    const hhmm  = String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0')
    return `PROD-${fecha}-${hhmm}`
  })

  // Líneas (multi-producto). En edición solo 1 línea.
  const [lineas, setLineas] = useState<LineaProd[]>(() => {
    if (editItem) {
      const ei = editItem as unknown as { numero_factura?: string; precio_venta_unitario?: number }
      return [{
        ...LINEA_VACIA,
        producto:    editItem.producto as unknown as Producto | null,
        recetaId:    editItem.receta?.id ?? '',
        cantidad:    String(editItem.cantidad_producida),
        precioVenta: String(ei.precio_venta_unitario ?? ''),
        notas:       editItem.notas ?? '',
        busqueda:    editItem.producto?.nombre ?? '',
      }]
    }
    return [{ ...LINEA_VACIA }]
  })

  const patchLinea = (i: number, p: Partial<LineaProd>) =>
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, ...p } : l))

  const addLinea = () => setLineas(prev => [...prev, { ...LINEA_VACIA }])

  const removeLinea = (i: number) => setLineas(prev => prev.filter((_, idx) => idx !== i))

  // Totales globales
  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n)
  const totalGeneral = lineas.reduce((s, l) => {
    const qty = parseFloat(l.cantidad) || 0
    const pv  = parseFloat(l.precioVenta) || 0
    const iva = parseFloat(l.iva) || 0
    const sub = qty * pv
    return s + sub + sub * iva / 100
  }, 0)

  const canSave = lineas.some(l => l.producto && parseFloat(l.cantidad) > 0)

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: async () => {
      const numFac = numeroFactura.trim() || undefined
      // En edición: actualizar solo la 1ra línea
      if (esEdicion) {
        const l = lineas[0]
        return api.put(`/berlin/planilla/${planillaId}/items/${editItem!.id}`, {
          producto_id:           l.producto?.id ?? editItem?.producto?.id,
          receta_id:             l.recetaId || null,
          cantidad_producida:    parseFloat(l.cantidad) || 0,
          notas:                 l.notas.trim() || null,
          numero_factura:        numFac ?? numFactEdit,
          precio_venta_unitario: parseFloat(l.precioVenta) || 0,
        })
      }
      // Nuevo: enviar todas las líneas válidas
      const lineasValidas = lineas.filter(l => l.producto && parseFloat(l.cantidad) > 0)
      for (const l of lineasValidas) {
        await api.post(`/berlin/planilla/${planillaId}/items`, {
          producto_id:           l.producto!.id,
          receta_id:             l.recetaId || null,
          cantidad_producida:    parseFloat(l.cantidad),
          notas:                 l.notas.trim() || null,
          numero_factura:        numFac,
          precio_venta_unitario: parseFloat(l.precioVenta) || 0,
        })
      }
    },
    onSuccess: () => {
      toast.success(esEdicion ? 'Producción actualizada ✅' : 'Producción registrada ✅')
      qc.invalidateQueries({ queryKey: ['planilla-hoy'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al guardar')
    },
  })

  // Imprimir factura de producción (tabla horizontal tipo imagen 3)
  const imprimir = () => {
    const origin = window.location.origin
    const numFac = numeroFactura.trim() || 'Auto'
    const lineasValidas = lineas.filter(l => l.producto && parseFloat(l.cantidad) > 0)
    if (!lineasValidas.length) return

    const rowsHTML = lineasValidas.map(l => {
      const qty = parseFloat(l.cantidad) || 0
      const pv  = parseFloat(l.precioVenta) || 0
      const iva = parseFloat(l.iva) || 0
      const sub = qty * pv
      const tot = sub + sub * iva / 100
      return `<tr>
        <td style="padding:3px 4px;font-size:10px;border-bottom:1px solid #eee">${l.producto!.nombre}</td>
        <td style="padding:3px 4px;text-align:center;font-size:10px;border-bottom:1px solid #eee">${qty}</td>
        <td style="padding:3px 4px;text-align:right;font-size:10px;border-bottom:1px solid #eee">${fmtCOP(pv)}</td>
        <td style="padding:3px 4px;text-align:center;font-size:10px;border-bottom:1px solid #eee">${iva}%</td>
        <td style="padding:3px 4px;text-align:right;font-size:10px;font-weight:bold;border-bottom:1px solid #eee">${fmtCOP(tot)}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Factura Producción ${numFac}</title>
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
      .sep2{border-top:1px solid #ddd;margin:6px 0}
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
    <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
    <div class="titulo">Café Bar Berlín</div>
    <div class="sub">REGISTRO DE FACTURA DE PRODUCCIÓN</div>
    <div class="sep"></div>
    <div class="header-grid">
      <div class="hbox"><label>N° Factura</label><span>${numFac}</span></div>
      <div class="hbox"><label>Fecha</label><span>${hoy}</span></div>
      <div class="hbox"><label>Tipo</label><span>Producción interna</span></div>
    </div>
    <div class="section-title">Detalle de Productos</div>
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Descripción del Producto</th>
          <th style="text-align:center">Cant.</th>
          <th style="text-align:right">V. Neto Unid.</th>
          <th style="text-align:center">IVA %</th>
          <th style="text-align:right">V. Total</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4" style="text-align:right;font-size:12px">TOTAL GENERAL</td>
          <td style="text-align:right;font-size:13px;color:#EA580C">${fmtCOP(totalGeneral)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="footer">Sistema Kalreco v1.0 · ${new Date().toLocaleString('es-CO')}</div>
    </body></html>`

    const w = window.open('', '_blank', 'width=800,height=650')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),800)},400) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4
                    bg-black/70 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl
                      max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-brand-teal"/>
            <h3 className="text-white font-bold text-sm">
              {esEdicion ? 'Editar producción' : 'Registrar producción'}
            </h3>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl
                       text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <X size={18}/>
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Encabezado factura — N° Factura | Fecha */}
          <div className="grid grid-cols-2 gap-3 bg-brand-dark/60 rounded-xl border border-white/8 p-3">
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">N° Factura</label>
              <input
                value={numeroFactura}
                onChange={e => setNumeroFactura(e.target.value)}
                placeholder="Auto-generado al guardar"
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2
                           text-sm text-white font-mono focus:outline-none focus:border-brand-teal
                           placeholder:text-gray-700"
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1.5">Fecha</label>
              <div className="bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                {hoy}
              </div>
            </div>
          </div>

          {/* Sección detalle de productos */}
          <div>
            <div className="flex items-center mb-2">
              <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">Detalle de Productos</p>
            </div>

            <div className="space-y-2">
              {lineas.map((linea, i) => (
                <FilaLinea
                  key={i}
                  linea={linea}
                  index={i}
                  canRemove={lineas.length > 1}
                  onPatch={p => patchLinea(i, p)}
                  onRemove={() => removeLinea(i)}
                />
              ))}
            </div>
          </div>

          {/* Total general */}
          {totalGeneral > 0 && (
            <div className="flex justify-end">
              <div className="bg-brand-dark/80 border border-white/10 rounded-xl px-4 py-2.5 text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total General</p>
                <p className="text-lg font-bold text-[#EA580C] tabular-nums">
                  {fmtCOP(totalGeneral)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-3 border-t border-white/8 flex-shrink-0 space-y-2">
          {/* Fila 1: Cancelar | Imprimir | Añadir Artículo */}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                         text-sm hover:bg-white/5 transition-colors min-h-[44px]">
              Cancelar
            </button>
            <button onClick={imprimir} disabled={!canSave} title="Imprimir factura"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10
                         text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30
                         transition-colors text-sm min-h-[44px] flex-shrink-0">
              <Printer size={14}/> Imprimir
            </button>
            {!esEdicion && (
              <button onClick={addLinea}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-brand-teal/40
                           text-brand-teal hover:bg-brand-teal/10 text-sm min-h-[44px] flex-shrink-0
                           transition-colors">
                <Plus size={14}/> Añadir Artículo
              </button>
            )}
          </div>
          {/* Fila 2: Registrar */}
          <button
            disabled={!canSave || isPending}
            onClick={() => guardar()}
            className="w-full py-3 rounded-xl bg-brand-teal hover:bg-[#00A882] text-brand-dark
                       font-bold text-sm disabled:opacity-40 transition-colors min-h-[48px]">
            {isPending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : '+ Registrar producción'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de planilla histórica ────────────────────────────────
function PlanillaHistCard({ planilla }: { planilla: Planilla }) {
  const [open, setOpen] = useState(false)
  const totalUnd = (planilla.items ?? []).reduce((s, i) => s + Number(i.cantidad_producida), 0)

  return (
    <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors"
      >
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-white capitalize">
            {fmtFecha(planilla.fecha)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {(planilla.items ?? []).length} producto{(planilla.items ?? []).length !== 1 ? 's' : ''} ·{' '}
            {fmt(totalUnd)} unidades
            {planilla.usuario && ` · ${planilla.usuario.nombre}`}
          </p>
        </div>
        <EstadoBadge estado={planilla.estado} />
        {open ? <ChevronUp size={14} className="text-gray-500 flex-shrink-0" />
               : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/5 divide-y divide-white/5">
          {(planilla.items ?? []).length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-600">Sin ítems registrados</p>
          ) : (
            (planilla.items ?? []).map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-base w-6 text-center flex-shrink-0">
                  {item.producto?.imagen_url && !isEmojiIcon(item.producto.imagen_url)
                    ? <img src={item.producto.imagen_url} alt="" className="w-5 h-5 rounded object-cover" />
                    : (item.producto?.imagen_url || '🍞')
                  }
                </span>
                <p className="flex-1 text-sm text-white">{item.producto?.nombre ?? '—'}</p>
                <p className="text-sm font-bold text-brand-teal tabular-nums">
                  {fmt(item.cantidad_producida)}
                </p>
              </div>
            ))
          )}
          {planilla.notas && (
            <p className="px-4 py-2 text-xs text-gray-500 italic">{planilla.notas}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function PlanillaPage() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.rol === 'super_admin'

  const [showModal,        setShowModal]        = useState(false)
  const [editItem,         setEditItem]         = useState<PlanillaItem | null>(null)
  const [confirmarCierre,  setConfirmarCierre]  = useState(false)
  const [showHistory,      setShowHistory]      = useState(false)
  const [notasCierre,      setNotasCierre]      = useState('')
  const [verificando,      setVerificando]      = useState(false)
  const [descuadres,       setDescuadres]       = useState<DescuadreInsumo[]>([])
  const [forzarCierre,     setForzarCierre]     = useState(false)

  // ── Planilla de hoy ──
  const { data: planilla, isLoading } = useQuery<Planilla>({
    queryKey: ['planilla-hoy'],
    queryFn:  () => api.get('/berlin/planilla/hoy').then(r => r.data),
    refetchInterval: 30_000,
  })

  // ── Historial ──
  const { data: historico = [] } = useQuery<Planilla[]>({
    queryKey: ['planilla-historial'],
    queryFn:  () => api.get('/berlin/planilla/historial').then(r => r.data),
    enabled:  showHistory,
  })

  // ── Eliminar ítem ──
  const { mutate: eliminarItem } = useMutation({
    mutationFn: (item: PlanillaItem) =>
      api.delete(`/berlin/planilla/${planilla!.id}/items/${item.id}`),
    onSuccess: () => {
      toast.success('Producción eliminada')
      qc.invalidateQueries({ queryKey: ['planilla-hoy'] })
    },
    onError: () => toast.error('Error al eliminar'),
  })

  // ── Verificar insumos antes de cerrar ──
  const verificarYConfirmar = async () => {
    if (!planilla) return
    setVerificando(true)
    try {
      const r = await api.get(`/berlin/planilla/${planilla.id}/verificar-insumos`)
      const { ok, descuadres: lista } = r.data
      if (ok || forzarCierre) {
        setDescuadres([])
        setConfirmarCierre(true)
      } else {
        setDescuadres(lista)
        // Mostrar panel de descuadres (no abrir confirmar aún)
      }
    } catch {
      toast.error('Error al verificar insumos')
    } finally {
      setVerificando(false)
    }
  }

  // ── Cerrar planilla ──
  const { mutate: cerrarPlanilla, isPending: cerrando } = useMutation({
    mutationFn: () =>
      api.patch(`/berlin/planilla/${planilla!.id}/cerrar`, { notas: notasCierre }),
    onSuccess: (res) => {
      const alertas = res.data?.alertas ?? []
      if (alertas.length > 0) {
        toast('Planilla cerrada con descuadre en insumos ⚠️', { icon: '⚠️' })
      } else {
        toast.success('Planilla cerrada ✅')
      }
      qc.invalidateQueries({ queryKey: ['planilla-hoy'] })
      qc.invalidateQueries({ queryKey: ['planilla-historial'] })
      qc.invalidateQueries({ queryKey: ['insumos'] })
      setConfirmarCierre(false)
      setDescuadres([])
      setForzarCierre(false)
    },
    onError: () => toast.error('Error al cerrar planilla'),
  })

  const items    = (planilla?.items ?? []) as ItemExt[]
  const cerrada  = planilla?.estado === 'cerrada'
  const totalProd = items.reduce((s, i) => s + Number(i.cantidad_producida), 0)
  const totalTipos = new Set(items.map(i => i.producto?.id)).size

  // Agrupar items por numero_factura
  const facturaGrupos = useMemo(() => {
    const map = new Map<string, ItemExt[]>()
    items.forEach(i => {
      const key = i.numero_factura ?? 'SIN-FACTURA'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    })
    return Array.from(map.entries())
  }, [items])

  const abrirEditar = (item: PlanillaItem) => {
    setEditItem(item)
    setShowModal(true)
  }

  // Imprimir una factura de planilla (grupo de items)
  const imprimirFacturaGrupo = (numFac: string, grupo: ItemExt[]) => {
    const origin  = window.location.origin
    const fmtCOP  = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n)
    const hoy     = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})
    const totalVal = grupo.reduce((s, i) => s + Number(i.cantidad_producida) * (i.precio_venta_unitario ?? 0), 0)

    const rowsHTML = grupo.map(i => {
      const qty = Number(i.cantidad_producida)
      const pv  = i.precio_venta_unitario ?? 0
      return `<tr>
        <td style="padding:3px 4px;font-size:10px;border-bottom:1px solid #eee">${i.producto?.nombre ?? '—'}</td>
        <td style="padding:3px 4px;text-align:center;font-size:10px;border-bottom:1px solid #eee">${qty}</td>
        <td style="padding:3px 4px;text-align:right;font-size:10px;border-bottom:1px solid #eee">${pv > 0 ? fmtCOP(pv) : '—'}</td>
        <td style="padding:3px 4px;text-align:right;font-size:10px;font-weight:bold;border-bottom:1px solid #eee">${pv > 0 ? fmtCOP(pv*qty) : '—'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Factura ${numFac}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}@page{margin:8mm;size:A4}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff}
    .logo{display:block;margin:0 auto 8px;max-height:55px}
    .titulo{text-align:center;font-size:15px;font-weight:bold;margin-bottom:2px}
    .sub{text-align:center;font-size:10px;color:#555;margin-bottom:10px}
    .header-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
    .hbox{border:1px solid #ddd;border-radius:6px;padding:8px 10px}
    .hbox label{display:block;font-size:8px;text-transform:uppercase;color:#888;letter-spacing:.5px;margin-bottom:3px}
    .hbox span{font-size:12px;font-weight:bold}
    .sep{border-top:2px solid #333;margin:10px 0}
    .section-title{font-size:9px;text-transform:uppercase;color:#555;font-weight:bold;margin-bottom:6px}
    table{width:100%;border-collapse:collapse}
    thead th{font-size:9px;text-transform:uppercase;color:#555;padding:5px 4px;border-bottom:2px solid #ddd;background:#f8f8f8;text-align:left}
    thead th:not(:first-child){text-align:right}
    tfoot td{padding:5px 4px;font-weight:bold;font-size:11px}
    .total-row td{border-top:2px solid #333}
    .footer{text-align:center;margin-top:20px;font-size:9px;color:#888}
    </style></head><body>
    <img class="logo" src="${origin}/logos/berlin.png" alt=""/>
    <div class="titulo">Café Bar Berlín</div>
    <div class="sub">REGISTRO DE FACTURA DE PRODUCCIÓN</div>
    <div class="sep"></div>
    <div class="header-grid">
      <div class="hbox"><label>N° Factura</label><span>${numFac}</span></div>
      <div class="hbox"><label>Fecha</label><span>${hoy}</span></div>
      <div class="hbox"><label>Tipo</label><span>Producción interna</span></div>
    </div>
    <div class="section-title">Detalle de Productos</div>
    <table><thead><tr>
      <th style="text-align:left">Descripción del Producto</th>
      <th style="text-align:center">Cant.</th>
      <th style="text-align:right">V. Neto Unid.</th>
      <th style="text-align:right">V. Total</th>
    </tr></thead>
    <tbody>${rowsHTML}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3" style="text-align:right;font-size:12px">TOTAL GENERAL</td>
      <td style="text-align:right;font-size:13px;color:#EA580C">${totalVal > 0 ? fmtCOP(totalVal) : '—'}</td>
    </tr></tfoot></table>
    <div class="footer">Sistema Kalreco v1.0 · ${new Date().toLocaleString('es-CO')}</div>
    </body></html>`

    const w = window.open('', '_blank', 'width=800,height=650')
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();setTimeout(()=>w.close(),800)},400) }
  }

  return (
    <div className="space-y-4">

      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-brand-teal" />
          <div>
            <h2 className="text-lg font-bold text-white">Planilla de Producción</h2>
            {planilla && (
              <p className="text-xs text-gray-500 capitalize">
                {fmtFecha(planilla.fecha)}
              </p>
            )}
          </div>
        </div>
        {planilla && <EstadoBadge estado={planilla.estado} />}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-gray-600 text-sm">Cargando…</div>
      ) : planilla && (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
              <p className="text-xs text-gray-500">Tipos producidos</p>
              <p className="text-2xl font-bold text-white mt-0.5">{totalTipos}</p>
            </div>
            <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
              <p className="text-xs text-gray-500">Total unidades</p>
              <p className="text-2xl font-bold text-brand-teal mt-0.5 tabular-nums">{fmt(totalProd)}</p>
            </div>
          </div>

          {/* ── Lista de ítems ── */}
          <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
            {/* Header lista */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Producción registrada
              </p>
              {!cerrada && (
                <button
                  onClick={() => { setEditItem(null); setShowModal(true) }}
                  className="flex items-center gap-1.5 text-xs font-bold text-brand-teal
                             hover:text-white bg-brand-teal/10 hover:bg-brand-teal/20
                             border border-brand-teal/30 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={13} /> Agregar
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
                <Package size={36} className="opacity-20" />
                <p className="text-sm">
                  {cerrada ? 'Planilla cerrada sin producción registrada'
                           : 'Toca "+ Agregar" para registrar la producción del día'}
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-0">
                {facturaGrupos.map(([numFac, grupo]) => (
                  <FacturaGrupo
                    key={numFac}
                    numFac={numFac}
                    items={grupo}
                    cerrada={cerrada}
                    isSuperAdmin={isSuperAdmin}
                    onEdit={abrirEditar}
                    onDelete={eliminarItem}
                    onImprimir={imprimirFacturaGrupo}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Descuadre de insumos (panel de advertencia) ── */}
          {!cerrada && descuadres.length > 0 && !confirmarCierre && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
              <p className="text-sm text-yellow-300 font-semibold flex items-center gap-2">
                <AlertTriangle size={14} /> Descuadre de insumos detectado
              </p>
              <p className="text-xs text-yellow-200/60">
                Los siguientes insumos no tienen stock suficiente para cubrir la producción registrada.
                Puede ser señal de pérdidas, robo o error en recetas.
              </p>
              <div className="space-y-1.5">
                {descuadres.map(d => (
                  <div key={d.insumo_id}
                       className="flex items-center justify-between text-xs px-3 py-2
                                  bg-yellow-500/5 rounded-lg border border-yellow-500/15">
                    <span className="text-yellow-200">{d.nombre}</span>
                    <span className="text-yellow-400 font-mono">
                      Stock: {fmt(d.stock_actual)} · Necesita: {fmt(d.consumo)} · Falta: {fmt(d.faltante)} {d.unidad}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDescuadres([])}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                             text-sm hover:bg-white/5 transition-colors"
                >
                  Revisar antes de cerrar
                </button>
                <button
                  onClick={() => { setForzarCierre(true); setConfirmarCierre(true) }}
                  className="flex-1 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-700
                             text-white text-sm font-bold transition-colors"
                >
                  Cerrar con descuadre ⚠️
                </button>
              </div>
            </div>
          )}

          {/* ── Cerrar planilla ── */}
          {!cerrada && items.length > 0 && descuadres.length === 0 && (
            confirmarCierre ? (
              <div className="bg-orange-500/10 border border-orange-500/25 rounded-xl p-4 space-y-3">
                <p className="text-sm text-orange-300 font-semibold flex items-center gap-2">
                  <Lock size={14} /> ¿Cerrar la planilla de hoy?
                </p>
                <p className="text-xs text-orange-200/60">
                  Al cerrar se descontarán los insumos del inventario según las recetas usadas.
                  No podrás agregar más registros.
                </p>
                <textarea
                  value={notasCierre}
                  onChange={e => setNotasCierre(e.target.value)}
                  placeholder="Observaciones del día (opcional)…"
                  rows={2}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2
                             text-sm text-white focus:outline-none focus:border-brand-teal
                             placeholder:text-gray-600 resize-none"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setConfirmarCierre(false); setForzarCierre(false) }}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                               text-sm hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => cerrarPlanilla()}
                    disabled={cerrando}
                    className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600
                               text-white text-sm font-bold transition-colors disabled:opacity-40"
                  >
                    {cerrando ? 'Cerrando…' : 'Sí, cerrar planilla'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={verificarYConfirmar}
                disabled={verificando}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                           border border-green-500/25 text-green-400/70 hover:text-green-400
                           hover:border-green-500/40 text-sm transition-colors disabled:opacity-50"
              >
                {verificando
                  ? <><span className="animate-spin">⏳</span> Verificando insumos…</>
                  : <><CheckCircle size={15} /> Cerrar planilla del día</>
                }
              </button>
            )
          )}

          {/* Botón cerrar cuando hay descuadre pero usuario eligió forzar */}
          {!cerrada && items.length > 0 && confirmarCierre && forzarCierre && (
            <div className="bg-orange-500/10 border border-orange-500/25 rounded-xl p-4 space-y-3">
              <p className="text-sm text-orange-300 font-semibold flex items-center gap-2">
                <Lock size={14} /> Cerrar planilla con descuadre registrado
              </p>
              <textarea
                value={notasCierre}
                onChange={e => setNotasCierre(e.target.value)}
                placeholder="Observaciones del día (recomendado explicar el descuadre)…"
                rows={2}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2
                           text-sm text-white focus:outline-none focus:border-brand-teal
                           placeholder:text-gray-600 resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setConfirmarCierre(false); setForzarCierre(false); setDescuadres([]) }}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                             text-sm hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => cerrarPlanilla()}
                  disabled={cerrando}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600
                             text-white text-sm font-bold transition-colors disabled:opacity-40"
                >
                  {cerrando ? 'Cerrando…' : 'Confirmar cierre ⚠️'}
                </button>
              </div>
            </div>
          )}

          {cerrada && (
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-500/10 rounded-xl
                            border border-gray-500/20">
              <Lock size={14} className="text-gray-400 flex-shrink-0" />
              <p className="text-sm text-gray-400">
                Esta planilla está cerrada. El inventario refleją lo producido.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Historial ── */}
      <div>
        <button
          onClick={() => setShowHistory(v => !v)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white
                     transition-colors py-1"
        >
          {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Historial de planillas anteriores
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {historico.length === 0 ? (
              <p className="text-sm text-gray-600 px-2">Sin planillas anteriores</p>
            ) : (
              historico
                .filter(p => p.id !== planilla?.id)
                .map(p => <PlanillaHistCard key={p.id} planilla={p} />)
            )}
          </div>
        )}
      </div>

      {/* ── Modal agregar / editar ── */}
      {showModal && planilla && (
        <ModalItem
          planillaId={planilla.id}
          editItem={editItem}
          onClose={() => { setShowModal(false); setEditItem(null) }}
        />
      )}
    </div>
  )
}
