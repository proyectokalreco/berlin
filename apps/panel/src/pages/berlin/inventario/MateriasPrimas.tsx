import { useState, useRef, useCallback, ChangeEvent } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { Insumo, Producto, Categoria } from '../../../types'
import Button from '../../../components/ui/Button'
import toast from 'react-hot-toast'
import {
  Package, Package2, AlertTriangle, CheckCircle, Plus, Search,
  X, Upload, Download, FileSpreadsheet, ChevronDown, ChevronUp,
  Pencil, Trash2, Barcode, ShoppingCart, FlaskConical,
  Settings2, Tag, Camera, Smile, ChevronLeft, Globe,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import * as XLSX from 'xlsx'

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

type UnidadMedida = 'kg' | 'g' | 'l' | 'ml' | 'unidad' | 'bolsa' | 'bulto'
const UNIDADES: UnidadMedida[] = ['g', 'kg', 'l', 'ml', 'unidad', 'bolsa', 'bulto']

// ── Precio sugerido: PrecioCompra / (1 - utilidad/100) * (1 + iva/100)
function calcPrecioVenta(compra: number, utilidad: number, iva: number): number {
  if (compra <= 0 || utilidad >= 100) return 0
  const base = compra / (1 - utilidad / 100)
  return iva > 0 ? base * (1 + iva / 100) : base
}

// ═════════════════════════════════════════════════════════════
// TAB INSUMOS
// ═════════════════════════════════════════════════════════════

interface InsumoForm {
  nombre: string; unidad_medida: UnidadMedida
  stock_actual: string; stock_minimo: string
  costo_unitario: string; proveedor: string; telefono_prov: string
}
const INSUMO_EMPTY: InsumoForm = {
  nombre: '', unidad_medida: 'g', stock_actual: '0',
  stock_minimo: '0', costo_unitario: '0', proveedor: '', telefono_prov: '',
}
const PLANTILLA_COLS = ['nombre','unidad_medida','stock_actual','stock_minimo','costo_unitario','proveedor','telefono_prov']
const PLANTILLA_ROWS = [
  ['Harina el Lobo','kg',50,10,2500,'Proveedor Harinero S.A.','3001234567'],
  ['Mantequilla','kg',10,2,12000,'Lácteos del Valle','3109876543'],
  ['Azúcar','kg',20,5,2200,'',''],
  ['Levadura','g',500,100,35,'',''],
]

function descargarPlantilla() {
  const ws = XLSX.utils.aoa_to_sheet([PLANTILLA_COLS, ...PLANTILLA_ROWS])
  ws['!cols'] = [{wch:25},{wch:14},{wch:14},{wch:14},{wch:16},{wch:25},{wch:14}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Insumos')
  XLSX.writeFile(wb, 'plantilla_insumos_kalreco.xlsx')
}

async function importarExcel(file: File, onCreate: (d: Partial<Insumo>) => Promise<void>, onDone: () => void) {
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data, { type: 'array' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
  if (!rows.length) { toast.error('El archivo está vacío'); return }
  const tid = toast.loading(`Importando ${rows.length} insumos…`)
  let ok = 0, err = 0
  for (const row of rows) {
    try {
      await onCreate({
        nombre:         String(row['nombre'] ?? '').trim(),
        unidad_medida:  String(row['unidad_medida'] ?? 'g').trim() as Insumo['unidad_medida'],
        stock_actual:   parseFloat(String(row['stock_actual']   ?? '0')) || 0,
        stock_minimo:   parseFloat(String(row['stock_minimo']   ?? '0')) || 0,
        costo_unitario: parseFloat(String(row['costo_unitario'] ?? '0')) || 0,
        proveedor:      String(row['proveedor'] ?? '').trim() || undefined,
      })
      ok++
    } catch { err++ }
  }
  toast.dismiss(tid)
  if (ok  > 0) toast.success(`${ok} insumos importados`)
  if (err > 0) toast.error(`${err} filas con error`)
  onDone()
}

// ── Modal Crear Insumo ────────────────────────────────────────
function ModalCrearInsumo({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<InsumoForm>(INSUMO_EMPTY)
  const queryClient     = useQueryClient()
  const set = (k: keyof InsumoForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/insumos', {
      nombre:         form.nombre.trim(),
      unidad_medida:  form.unidad_medida,
      stock_actual:   parseFloat(form.stock_actual)   || 0,
      stock_minimo:   parseFloat(form.stock_minimo)   || 0,
      costo_unitario: parseFloat(form.costo_unitario) || 0,
      proveedor:      form.proveedor.trim()    || null,
      telefono_prov:  form.telefono_prov.trim() || null,
    }),
    onSuccess: () => {
      toast.success(`Insumo "${form.nombre}" creado`)
      queryClient.invalidateQueries({ queryKey: ['insumos'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al crear el insumo')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-navy rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 sticky top-0 bg-brand-navy">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Inventario — Materias Primas</p>
            <h3 className="text-lg font-bold text-white">Nuevo Insumo</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nombre del insumo <span className="text-red-400">*</span></label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="Ej: Harina el Lobo, Mantequilla, Azúcar…"
              className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm
                         focus:outline-none focus:border-brand-teal placeholder-gray-600" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Unidad de medida <span className="text-red-400">*</span></label>
              <div className="relative">
                <select value={form.unidad_medida} onChange={e => set('unidad_medida', e.target.value as UnidadMedida)}
                  className="w-full appearance-none bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal">
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Stock inicial ({form.unidad_medida})</label>
              <input type="number" min="0" step="0.01" value={form.stock_actual} onChange={e => set('stock_actual', e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Stock mínimo ({form.unidad_medida})</label>
              <input type="number" min="0" step="0.01" value={form.stock_minimo} onChange={e => set('stock_minimo', e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Costo por {form.unidad_medida} ($)</label>
              <input type="number" min="0" step="0.01" value={form.costo_unitario} onChange={e => set('costo_unitario', e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal" />
            </div>
          </div>
          {parseFloat(form.costo_unitario) > 0 && (
            <div className="bg-brand-dark rounded-lg px-4 py-2 text-xs text-gray-400 flex gap-4">
              <span>Costo/{form.unidad_medida}: <strong className="text-white">{fmt(parseFloat(form.costo_unitario))}</strong></span>
              {form.unidad_medida === 'kg' && <span>Por g: <strong className="text-gray-300">{fmt(parseFloat(form.costo_unitario)/1000)}</strong></span>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Proveedor (opcional)</label>
              <input value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Nombre del proveedor"
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal placeholder-gray-600" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Teléfono proveedor</label>
              <input value={form.telefono_prov} onChange={e => set('telefono_prov', e.target.value)} placeholder="3001234567"
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal placeholder-gray-600" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-white/5 sticky bottom-0 bg-brand-navy">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={isPending} disabled={!form.nombre.trim()} onClick={() => mutate()}>
            Guardar insumo
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Editar Insumo (con stock + eliminar) ────────────────
function ModalEditarInsumo({ insumo, onClose }: { insumo: Insumo; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [nombre,    setNombre]   = useState(insumo.nombre)
  const [unidad,    setUnidad]   = useState(insumo.unidad_medida as UnidadMedida)
  const [stockMin,  setStockMin] = useState(String(insumo.stock_minimo))
  const [costo,     setCosto]    = useState(String(insumo.costo_unitario))
  const [proveedor, setProveedor]= useState(insumo.proveedor ?? '')
  // Entrada / salida de stock
  const [entCant,   setEntCant]  = useState('')
  const [entMotivo, setEntMotivo]= useState('Compra')
  const [showEnt,   setShowEnt]  = useState(false)
  const [modoStock, setModoStock]= useState<'entrada' | 'salida'>('entrada')
  // Confirmar eliminar
  const [confirmDel, setConfirmDel] = useState(false)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['insumos'] })
    queryClient.invalidateQueries({ queryKey: ['insumos-criticos'] })
  }

  const { mutate: guardar, isPending: saving } = useMutation({
    mutationFn: async () => {
      await api.put(`/berlin/insumos/${insumo.id}`, {
        nombre: nombre.trim(), unidad_medida: unidad,
        stock_minimo: parseFloat(stockMin) || 0,
        costo_unitario: parseFloat(costo) || 0,
        proveedor: proveedor.trim() || null,
      })
      // Si hay ajuste de stock pendiente (campo abierto con cantidad), aplicarlo
      if (showEnt && entCant && parseFloat(entCant) > 0) {
        if (modoStock === 'entrada') {
          await api.post(`/berlin/insumos/${insumo.id}/entrada`, {
            cantidad: parseFloat(entCant),
            costo_unitario: parseFloat(costo) || undefined,
            motivo: entMotivo,
          })
        } else {
          await api.post(`/berlin/insumos/${insumo.id}/ajuste`, {
            stock_real: Math.max(0, insumo.stock_actual - Math.abs(parseFloat(entCant))),
            motivo: entMotivo,
          })
        }
      }
    },
    onSuccess: () => { toast.success('Insumo actualizado ✅'); invalidate(); onClose() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al guardar')
    },
  })

  const { mutate: registrarEntrada, isPending: savingEnt } = useMutation({
    mutationFn: () => api.post(`/berlin/insumos/${insumo.id}/entrada`, {
      cantidad: parseFloat(entCant),
      costo_unitario: parseFloat(costo) || undefined,
      motivo: entMotivo,
    }),
    onSuccess: () => {
      toast.success(`+${entCant} ${insumo.unidad_medida} registrado`)
      invalidate(); onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al registrar entrada')
    },
  })

  const { mutate: registrarSalida, isPending: savingSalida } = useMutation({
    mutationFn: () => api.post(`/berlin/insumos/${insumo.id}/ajuste`, {
      stock_real: Math.max(0, insumo.stock_actual - Math.abs(parseFloat(entCant))),
      motivo: entMotivo,
    }),
    onSuccess: () => {
      toast.success(`-${entCant} ${insumo.unidad_medida} descontado`)
      invalidate(); onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al registrar salida')
    },
  })

  const { mutate: eliminar, isPending: deleting } = useMutation({
    mutationFn: () => api.put(`/berlin/insumos/${insumo.id}`, { activo: false }),
    onSuccess: () => { toast.success('Insumo eliminado'); invalidate(); onClose() },
    onError:   () => toast.error('Error al eliminar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-brand-navy rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-brand-navy z-10">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-brand-teal" />
            <div>
              <p className="text-xs text-gray-500">Editar insumo</p>
              <h3 className="text-base font-bold text-white">{insumo.nombre}</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Stock actual */}
          <div className="bg-brand-dark rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Stock actual</p>
              <p className="text-2xl font-bold text-white mt-0.5">
                {insumo.stock_actual.toFixed(1)}{' '}
                <span className="text-sm text-gray-500">{insumo.unidad_medida}</span>
              </p>
            </div>
            <span className={cn(
              'text-xs px-3 py-1.5 rounded-full border font-medium',
              insumo.stock_actual <= insumo.stock_minimo
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-green-500/15 text-green-400 border-green-500/30'
            )}>
              {insumo.stock_actual <= insumo.stock_minimo ? 'Crítico' : 'Ok'}
            </span>
          </div>

          {/* Campos editables */}
          <div className="space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Datos del insumo</p>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Unidad de medida</label>
                <div className="relative">
                  <select value={unidad} onChange={e => setUnidad(e.target.value as UnidadMedida)}
                    className="w-full appearance-none bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Stock mínimo</label>
                <input type="number" min="0" value={stockMin} onChange={e => setStockMin(e.target.value)}
                  className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Costo por {unidad} ($)</label>
              <input type="number" min="0" value={costo} onChange={e => setCosto(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Proveedor</label>
              <input value={proveedor} onChange={e => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full bg-brand-dark border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand-teal placeholder-gray-600" />
            </div>
          </div>

          {/* Registrar entrada / salida */}
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowEnt(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-brand-teal hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2 font-medium">
                <Plus size={15} /> Ajustar stock
              </span>
              <ChevronDown size={14} className={cn('transition-transform', showEnt && 'rotate-180')} />
            </button>
            {showEnt && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                {/* Toggle entrada/salida */}
                <div className="flex gap-1 bg-brand-dark rounded-lg p-1">
                  <button type="button"
                    onClick={() => { setModoStock('entrada'); setEntMotivo('Compra') }}
                    className={cn('flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                      modoStock === 'entrada' ? 'bg-brand-teal text-brand-dark' : 'text-gray-400 hover:text-white')}>
                    + Entrada
                  </button>
                  <button type="button"
                    onClick={() => { setModoStock('salida'); setEntMotivo('Ajuste de inventario') }}
                    className={cn('flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                      modoStock === 'salida' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white')}>
                    − Salida
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Cantidad ({unidad})</label>
                    <input type="number" min="0.01" step="0.01" value={entCant} onChange={e => setEntCant(e.target.value)}
                      placeholder="0"
                      className={cn('w-full bg-brand-dark border rounded-lg px-4 py-3 text-white text-xl font-bold text-center focus:outline-none',
                        modoStock === 'salida' ? 'border-red-500/40 focus:border-red-500' : 'border-white/10 focus:border-brand-teal')} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Motivo</label>
                    <select value={entMotivo} onChange={e => setEntMotivo(e.target.value)}
                      className="w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-brand-teal">
                      {modoStock === 'entrada' ? (
                        <>
                          <option>Compra</option>
                          <option>Donación</option>
                          <option>Devolución</option>
                          <option>Ajuste de inventario</option>
                        </>
                      ) : (
                        <>
                          <option>Ajuste de inventario</option>
                          <option>Merma / pérdida</option>
                          <option>Uso interno</option>
                          <option>Devolución a proveedor</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
                {modoStock === 'salida' && entCant && parseFloat(entCant) > insumo.stock_actual && (
                  <p className="text-xs text-red-400">⚠️ La cantidad supera el stock actual ({insumo.stock_actual.toFixed(1)} {unidad})</p>
                )}
                <Button
                  className={cn('w-full', modoStock === 'salida' && '!bg-red-500 hover:!bg-red-600')}
                  loading={modoStock === 'entrada' ? savingEnt : savingSalida}
                  disabled={!entCant || parseFloat(entCant) <= 0
                    || (modoStock === 'salida' && parseFloat(entCant) > insumo.stock_actual)}
                  onClick={() => modoStock === 'entrada' ? registrarEntrada() : registrarSalida()}>
                  {modoStock === 'entrada'
                    ? `Registrar +${entCant || 0} ${unidad}`
                    : `Descontar −${entCant || 0} ${unidad}`}
                </Button>
              </div>
            )}
          </div>

          {/* Zona de peligro */}
          {confirmDel ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
              <p className="text-sm text-red-300 font-medium">¿Eliminar "{insumo.nombre}"?</p>
              <p className="text-xs text-gray-400">Esta acción desactiva el insumo. No se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDel(false)}
                  className="flex-1 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
                  Cancelar
                </button>
                <button onClick={() => eliminar()} disabled={deleting}
                  className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors">
                  {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/20
                         text-red-400/70 hover:text-red-400 hover:border-red-500/40 text-sm transition-colors">
              <Trash2 size={14} /> Eliminar insumo
            </button>
          )}
        </div>

        {/* Acciones guardar */}
        <div className="flex gap-3 px-6 py-4 border-t border-white/5 sticky bottom-0 bg-brand-navy">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={saving} disabled={!nombre.trim()} onClick={() => guardar()}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Tab Insumos ───────────────────────────────────────────────
function TabInsumos() {
  const user = useAuthStore(s => s.user)
  const esPanadero = user?.rol === 'panadero'
  const [busqueda, setBusqueda]   = useState('')
  const [filtro, setFiltro]       = useState<'todos' | 'criticos' | 'bajos'>('todos')
  const [modalCrear, setModalCrear]    = useState(false)
  const [insumoEditar, setInsumoEditar]= useState<Insumo | null>(null)
  const [importando, setImportando]    = useState(false)
  const fileRef    = useRef<HTMLInputElement>(null)
  const queryClient= useQueryClient()

  const { data: insumos = [], isLoading } = useQuery<Insumo[]>({
    queryKey: ['insumos'],
    queryFn:  () => api.get('/berlin/insumos').then(r => r.data),
  })

  const crearInsumo = useCallback(async (data: Partial<Insumo>) => {
    await api.post('/berlin/insumos', data)
  }, [])

  const criticos = insumos.filter(i => i.stock_actual <= i.stock_minimo)
  const bajos    = insumos.filter(i => i.stock_actual > i.stock_minimo && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo * 2)
  const filtrados = insumos.filter(ins => {
    const match = ins.nombre.toLowerCase().includes(busqueda.toLowerCase())
    if (filtro === 'criticos') return match && ins.stock_actual <= ins.stock_minimo
    if (filtro === 'bajos')    return match && ins.stock_actual > ins.stock_minimo && ins.stock_minimo > 0 && ins.stock_actual <= ins.stock_minimo * 2
    return match
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FlaskConical size={17} className="text-brand-teal" />
          <span className="text-sm font-bold text-white">Materias Primas</span>
          <span className="text-xs bg-brand-dark border border-white/10 px-2 py-0.5 rounded-full text-gray-400">
            {insumos.length} insumos
          </span>
          {criticos.length > 0 && (
            <button onClick={() => setFiltro(f => f === 'criticos' ? 'todos' : 'criticos')}
              className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors',
                filtro === 'criticos'
                  ? 'bg-red-500/30 border-red-500/60 text-red-300'
                  : 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25')}>
              {criticos.length} críticos
            </button>
          )}
          {bajos.length > 0 && (
            <button onClick={() => setFiltro(f => f === 'bajos' ? 'todos' : 'bajos')}
              className={cn('text-xs px-2 py-0.5 rounded-full border transition-colors',
                filtro === 'bajos'
                  ? 'bg-amber-500/30 border-amber-500/60 text-amber-300'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25')}>
              {bajos.length} bajos
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={async e => {
              const f = e.target.files?.[0]
              if (!f) return
              setImportando(true)
              await importarExcel(f, crearInsumo, () => {
                queryClient.invalidateQueries({ queryKey: ['insumos'] })
                setImportando(false)
              })
              if (fileRef.current) fileRef.current.value = ''
            }} />
          <button onClick={() => fileRef.current?.click()} disabled={importando}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50">
            <Upload size={13} />{importando ? 'Importando…' : 'Importar Excel'}
          </button>
          <button onClick={descargarPlantilla}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
            <FileSpreadsheet size={13} /> Plantilla
          </button>
          <button onClick={() => {
            const rows = insumos.map(i => ({
              nombre: i.nombre, unidad_medida: i.unidad_medida, stock_actual: i.stock_actual,
              stock_minimo: i.stock_minimo, costo_unitario: i.costo_unitario,
              proveedor: i.proveedor ?? '', estado: i.stock_actual <= i.stock_minimo ? 'CRÍTICO' : 'OK',
            }))
            const ws = XLSX.utils.json_to_sheet(rows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Insumos')
            XLSX.writeFile(wb, `insumos_${new Date().toISOString().split('T')[0]}.xlsx`)
            toast.success('Exportado como Excel')
          }} disabled={!insumos.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40">
            <Download size={13} /> Exportar
          </button>
          <Button size="sm" onClick={() => setModalCrear(true)}>
            <Plus size={14} /> Nuevo Insumo
          </Button>
        </div>
      </div>

      {/* Ayuda */}
      <div className="bg-brand-navy/50 rounded-lg border border-white/5 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <FileSpreadsheet size={12} className="text-green-400" />
          Para importar en lote: descarga la{' '}
          <button onClick={descargarPlantilla} className="text-brand-teal hover:underline">plantilla Excel</button>,
          rellénala y súbela.
        </span>
        <span>Columnas: nombre · unidad_medida · stock_actual · stock_minimo · costo_unitario · proveedor</span>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar insumo…"
            className="w-full bg-brand-navy border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white
                       focus:outline-none focus:border-brand-teal" />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={() => setFiltro('todos')}
            className={cn('px-3 py-2 text-xs transition-colors',
              filtro === 'todos' ? 'bg-brand-teal text-brand-dark font-semibold' : 'bg-brand-navy text-gray-400 hover:text-white')}>
            Todos
          </button>
          <button onClick={() => setFiltro(filtro === 'criticos' ? 'todos' : 'criticos')}
            className={cn('px-3 py-2 text-xs transition-colors border-l border-white/10',
              filtro === 'criticos' ? 'bg-red-500/20 text-red-300 font-semibold' : 'bg-brand-navy text-gray-400 hover:text-red-400')}>
            Críticos ({criticos.length})
          </button>
          <button onClick={() => setFiltro(filtro === 'bajos' ? 'todos' : 'bajos')}
            className={cn('px-3 py-2 text-xs transition-colors border-l border-white/10',
              filtro === 'bajos' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-brand-navy text-gray-400 hover:text-amber-400')}>
            Bajos ({bajos.length})
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12 text-gray-500 text-sm">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-500">
            <Package size={32} className="opacity-30" />
            <p className="text-sm">{insumos.length === 0 ? 'No hay insumos — crea el primero' : 'Sin resultados'}</p>
            {insumos.length === 0 && <Button size="sm" onClick={() => setModalCrear(true)}><Plus size={14} /> Crear primer insumo</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-white/5 bg-brand-dark/30">
                  <th className="text-left px-5 py-3">Insumo</th>
                  <th className="text-right px-4 py-3">Stock actual</th>
                  <th className="text-right px-4 py-3">Stock mínimo</th>
                  <th className="text-right px-4 py-3">Costo / und</th>
                  <th className="text-left px-4 py-3">Proveedor</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map(ins => {
                  const isCritical = ins.stock_actual <= ins.stock_minimo
                  const pct = ins.stock_minimo > 0 ? Math.min(100, (ins.stock_actual / ins.stock_minimo) * 100) : 100
                  return (
                    <tr key={ins.id} className={cn('hover:bg-white/2 transition-colors', isCritical && !ins.es_gratis && 'bg-red-500/3')}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {ins.es_gratis
                            ? <span className="w-3.5 h-3.5 flex-shrink-0" />
                            : isCritical
                              ? <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                              : <CheckCircle   size={14} className="text-green-500/60 flex-shrink-0" />}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-white">{ins.nombre}</p>
                              {ins.es_gratis && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold uppercase tracking-wide">
                                  Gratuito
                                </span>
                              )}
                            </div>
                            <div className="mt-1 h-1 bg-white/5 rounded-full max-w-[100px]">
                              <div className={cn('h-1 rounded-full', isCritical ? 'bg-red-400' : 'bg-green-500')}
                                style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ins.es_gratis ? (
                          <span className="text-gray-700 font-mono">—</span>
                        ) : (
                          <>
                            <span className={cn('font-mono', isCritical ? 'text-red-400' : 'text-white')}>
                              {ins.stock_actual.toFixed(1)}
                            </span>{' '}
                            <span className="text-gray-600 text-xs">{ins.unidad_medida}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 font-mono">
                        {ins.es_gratis ? <span className="text-gray-700">—</span> : <>{ins.stock_minimo.toFixed(1)} <span className="text-gray-700 text-xs">{ins.unidad_medida}</span></>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300 font-mono text-xs">
                        {ins.es_gratis ? <span className="text-gray-700">Gratis</span> : <>{fmt(ins.costo_unitario)}<span className="text-gray-600">/{ins.unidad_medida}</span></>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                        {ins.proveedor ?? <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ins.es_gratis ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/30">
                            Gratis
                          </span>
                        ) : (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full border',
                            isCritical ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-green-500/15 text-green-400 border-green-500/30'
                          )}>
                            {isCritical ? 'Crítico' : 'Ok'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!esPanadero && (
                          <button onClick={() => setInsumoEditar(ins)}
                            className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-white
                                       bg-brand-teal/10 hover:bg-brand-teal/20 px-3 py-1.5 rounded-lg
                                       transition-colors border border-brand-teal/20 whitespace-nowrap">
                            <Pencil size={11} /> Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalCrear    && <ModalCrearInsumo onClose={() => setModalCrear(false)} />}
      {insumoEditar  && <ModalEditarInsumo insumo={insumoEditar} onClose={() => setInsumoEditar(null)} />}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// TAB PRODUCTOS TERMINADOS
// ═════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════
// EMOJI PICKER — selector visual para campos de emoji
// ═════════════════════════════════════════════════════════════

const EMOJIS_BAKERY = [
  // Panes y masas
  '🍞','🥐','🥖','🥨','🥯','🫓','🧆','🥙',
  // Dulces y postres
  '🎂','🍰','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🥮','🍡','🍧','🍨','🍦',
  // Fritos y salados
  '🥟','🌭','🍕','🧀','🥘','🍖','🥚','🫔',
  // Bebidas
  '☕','🍵','🥤','🧃','🥛','🫗','🧋','💧','🫧','🍺','🧉','🍊',
  // Frutas / ingredientes
  '🍋','🍓','🍇','🍑','🍊','🍎','🧈','🌾','🫙',
  // Símbolos de categoría
  '⭐','🔥','✨','💛','🧡','❤️','🎁','🛒','📦','🏷️',
]

function EmojiPickerInput({
  value,
  onChange,
  size = 'md',
}: {
  value:    string
  onChange: (v: string) => void
  size?:    'sm' | 'md'
}) {
  const [open,    setOpen]   = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const btnCls = size === 'sm' ? 'w-12 h-10 text-base' : 'w-14 h-[42px] text-xl'

  const limpioValue = (!value || value === '??' || value === '?')

  const toggle = () => {
    if (!open && btnRef.current) {
      const r    = btnRef.current.getBoundingClientRect()
      // Ajustar para que no salga por la derecha de la pantalla (ancho panel = 224px)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 240))
      setPanelPos({ top: r.bottom + 6, left })
    }
    setOpen(v => !v)
  }

  const panel = open ? createPortal(
    <>
      {/* Capa de cierre */}
      <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />

      {/* Panel flotante — renderizado en document.body, no recortado por el modal */}
      <div
        className="fixed z-[9999] bg-[#0D1B2A] border border-white/20 rounded-2xl p-3 shadow-2xl w-56"
        style={{ top: panelPos.top, left: panelPos.left }}
      >
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-1">
          Toca para seleccionar
        </p>

        {/* Grid 7 columnas × 6 filas */}
        <div className="grid grid-cols-7 gap-0.5">
          {EMOJIS_BAKERY.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => { onChange(e); setOpen(false) }}
              className={cn(
                'w-8 h-8 text-xl rounded-lg flex items-center justify-center',
                'hover:bg-white/10 active:scale-90 transition-all select-none',
                value === e && 'bg-brand-teal/20 ring-1 ring-brand-teal/50',
              )}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Input para emoji personalizado */}
        <div className="mt-3 pt-2 border-t border-white/10">
          <p className="text-[10px] text-gray-600 mb-1.5">O escribe / pega uno:</p>
          <div className="flex items-center gap-2">
            <input
              value={limpioValue ? '' : value}
              onChange={e => onChange(e.target.value)}
              placeholder="🍞"
              autoFocus
              className="flex-1 bg-[#112240] border border-white/10 rounded-lg px-3 py-1.5
                         text-lg text-center focus:outline-none focus:border-brand-teal
                         placeholder:text-gray-700"
            />
            {!limpioValue && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                title="Quitar emoji"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  ) : null

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        title="Seleccionar emoji"
        onClick={toggle}
        className={cn(
          btnCls,
          'rounded-lg border flex items-center justify-center transition-colors select-none',
          open
            ? 'bg-brand-teal/10 border-brand-teal'
            : 'bg-brand-navy border-white/10 hover:border-brand-teal/60',
        )}
      >
        {limpioValue
          ? <span className="text-gray-500 text-sm">😀</span>
          : <span>{value}</span>
        }
      </button>
      {panel}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// PRODUCT IMAGE INPUT — sube foto real o elige emoji
// ═════════════════════════════════════════════════════════════
function ProductImageInput({
  value,
  onChange,
}: {
  value:    string
  onChange: (v: string) => void
}) {
  const [open,       setOpen]      = useState(false)
  const [mode,       setMode]      = useState<'menu' | 'emoji' | 'url'>('menu')
  const [uploading,  setUploading] = useState(false)
  const [urlInput,   setUrlInput]  = useState('')
  const [loadingUrl, setLoadingUrl]= useState(false)
  const [panelPos,   setPanelPos]  = useState({ top: 0, left: 0 })
  const btnRef  = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isUrl   = value.startsWith('http')
  const isEmpty = !value || value === '??' || value === '?'

  const toggle = () => {
    if (!open && btnRef.current) {
      const r    = btnRef.current.getBoundingClientRect()
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 240))
      setPanelPos({ top: r.bottom + 6, left })
    }
    setOpen(v => !v)
    if (open) { setMode('menu'); setUrlInput('') }
  }

  const handleUrlImport = async () => {
    if (!urlInput.startsWith('http')) return
    setLoadingUrl(true)
    try {
      const { data } = await api.post<{ url: string }>('/berlin/upload/imagen-url', { url: urlInput })
      onChange(data.url)
      setUrlInput('')
      setOpen(false)
      setMode('menu')
      toast.success('Imagen guardada ✅')
    } catch {
      toast.error('No se pudo guardar la imagen. Verifica que la URL sea directa a un archivo de imagen.')
    } finally {
      setLoadingUrl(false)
    }
  }

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setOpen(false)
    setMode('menu')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('imagen', file)
      const { data } = await api.post<{ url: string }>('/berlin/upload/imagen', fd)
      onChange(data.url)
      toast.success('Imagen subida ✅')
    } catch {
      toast.error('Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  const panel = open ? createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={() => { setOpen(false); setMode('menu') }} />
      <div
        className="fixed z-[9999] bg-[#0D1B2A] border border-white/20 rounded-2xl p-3 shadow-2xl w-56"
        style={{ top: panelPos.top, left: panelPos.left }}
      >
        {mode === 'menu' ? (
          <div className="space-y-0.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-1">Imagen del producto</p>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                         text-sm text-white hover:bg-white/10 transition-colors text-left"
            >
              <Camera size={14} className="text-brand-teal flex-shrink-0" />
              Subir foto del dispositivo
            </button>

            <button
              type="button"
              onClick={() => setMode('url')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                         text-sm text-white hover:bg-white/10 transition-colors text-left"
            >
              <Globe size={14} className="text-purple-400 flex-shrink-0" />
              Pegar URL de internet
            </button>

            <button
              type="button"
              onClick={() => setMode('emoji')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                         text-sm text-white hover:bg-white/10 transition-colors text-left"
            >
              <Smile size={14} className="text-yellow-400 flex-shrink-0" />
              Usar emoji / ícono
            </button>

            {!isEmpty && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                           text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
              >
                <X size={14} className="flex-shrink-0" />
                Quitar imagen
              </button>
            )}
          </div>
        ) : mode === 'url' ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => { setMode('menu'); setUrlInput('') }}
                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Imagen desde internet</p>
            </div>

            <p className="text-[11px] text-gray-500 mb-2">
              En Google Imágenes: clic derecho sobre la foto → <strong className="text-gray-300">Copiar dirección de imagen</strong> → pégala aquí
            </p>

            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlImport()}
              placeholder="https://..."
              autoFocus
              className="w-full bg-[#112240] border border-white/10 rounded-lg px-3 py-2 text-xs text-white
                         focus:outline-none focus:border-brand-teal placeholder:text-gray-600"
            />

            {urlInput.startsWith('http') && (
              <div className="mt-2 rounded-lg overflow-hidden bg-white/5 h-20 flex items-center justify-center">
                <img
                  src={urlInput}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  onError={e => { e.currentTarget.style.opacity = '0.3' }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleUrlImport}
              disabled={!urlInput.startsWith('http') || loadingUrl}
              className="w-full mt-2 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30
                         text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingUrl ? 'Descargando y guardando…' : 'Guardar imagen ✓'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setMode('menu')}
                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Toca para seleccionar</p>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {EMOJIS_BAKERY.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { onChange(e); setOpen(false); setMode('menu') }}
                  className={cn(
                    'w-8 h-8 text-xl rounded-lg flex items-center justify-center',
                    'hover:bg-white/10 active:scale-90 transition-all select-none',
                    value === e && 'bg-brand-teal/20 ring-1 ring-brand-teal/50',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="mt-3 pt-2 border-t border-white/10">
              <p className="text-[10px] text-gray-600 mb-1.5">O escribe / pega uno:</p>
              <div className="flex items-center gap-2">
                <input
                  value={(!isEmpty && !isUrl) ? value : ''}
                  onChange={e => onChange(e.target.value)}
                  placeholder="🍞"
                  autoFocus
                  className="flex-1 bg-[#112240] border border-white/10 rounded-lg px-3 py-1.5
                             text-lg text-center focus:outline-none focus:border-brand-teal
                             placeholder:text-gray-700"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  ) : null

  return (
    <div className="flex-shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
      <button
        ref={btnRef}
        type="button"
        title={isUrl ? 'Cambiar imagen' : isEmpty ? 'Agregar imagen o emoji' : 'Cambiar ícono'}
        onClick={toggle}
        disabled={uploading}
        className={cn(
          'w-12 h-10 rounded-lg border flex items-center justify-center transition-colors select-none overflow-hidden',
          open
            ? 'bg-brand-teal/10 border-brand-teal'
            : 'bg-brand-navy border-white/10 hover:border-brand-teal/60',
        )}
      >
        {uploading ? (
          <div className="w-4 h-4 border-2 border-brand-teal/30 border-t-brand-teal rounded-full animate-spin" />
        ) : isUrl ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : isEmpty ? (
          <Camera size={15} className="text-gray-500" />
        ) : (
          <span className="text-base">{value}</span>
        )}
      </button>
      {panel}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// MODAL GESTIÓN DE CATEGORÍAS
// ═════════════════════════════════════════════════════════════
function ModalGestionCategorias({ onClose }: { onClose: () => void }) {
  const queryClient     = useQueryClient()
  const [nombre,  setNombre]  = useState('')
  const [emoji,   setEmoji]   = useState('')
  const [editId,  setEditId]  = useState<string | null>(null)
  const [editNom, setEditNom] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null)
  const [agregarProdId, setAgregarProdId] = useState('')

  const { data: categorias = [], isLoading } = useQuery<Categoria[]>({
    queryKey: ['categorias-pan'],
    queryFn:  () => api.get('/berlin/categorias').then(r => r.data),
  })

  const { data: productos = [] } = useQuery<Producto[]>({
    queryKey: ['productos'],
    queryFn:  () => api.get('/berlin/productos').then(r => r.data),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['categorias-pan'] })
    queryClient.invalidateQueries({ queryKey: ['productos'] })
  }

  const { mutate: moverProducto } = useMutation({
    mutationFn: ({ id, categoria_id }: { id: string; categoria_id: string | null }) =>
      api.put(`/berlin/productos/${id}`, { categoria_id }),
    onSuccess: invalidate,
    onError: () => toast.error('Error al actualizar producto'),
  })

  const { mutate: crear, isPending: creando } = useMutation({
    mutationFn: () => api.post('/berlin/categorias', {
      nombre: nombre.trim(), emoji: emoji.trim() || null,
    }),
    onSuccess: () => {
      toast.success(`Categoría "${nombre}" creada ✅`)
      invalidate()
      setNombre(''); setEmoji('')
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al crear categoría')
    },
  })

  const startEdit = (cat: Categoria) => {
    setEditId(cat.id)
    setEditNom(cat.nombre)
    setEditEmoji(cat.emoji ?? '')
  }

  const { mutate: actualizar, isPending: actualizando } = useMutation({
    mutationFn: () => api.put(`/berlin/categorias/${editId}`, {
      nombre: editNom.trim(), emoji: editEmoji.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Categoría actualizada')
      invalidate()
      setEditId(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al actualizar')
    },
  })

  const { mutate: eliminar } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/categorias/${id}`),
    onSuccess: () => {
      toast.success('Categoría eliminada')
      invalidate()
      setConfirmDelId(null)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al eliminar')
    },
  })

  const prodCount = (cat: Categoria) =>
    cat.productos?.[0]?.count ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-brand-navy border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[88vh]">

        {/* Header */}
        <div className="sticky top-0 bg-brand-navy border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-brand-teal" />
            <h3 className="text-base font-bold text-white">Categorías de Productos</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Crear nueva categoría */}
          <div className="bg-brand-dark rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Nueva categoría</p>
            <div className="flex gap-2">
              <EmojiPickerInput value={emoji} onChange={setEmoji} />
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && nombre.trim() && crear()}
                placeholder="Nombre de la categoría"
                className="flex-1 bg-brand-navy border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm
                           focus:outline-none focus:border-brand-teal placeholder:text-gray-600"
              />
              <button
                onClick={() => crear()}
                disabled={!nombre.trim() || creando}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold transition-all',
                  nombre.trim() && !creando
                    ? 'bg-brand-teal text-brand-dark hover:bg-[#00A882]'
                    : 'bg-white/5 text-gray-600 cursor-not-allowed'
                )}
              >
                <Plus size={14} /> Crear
              </button>
            </div>
          </div>

          {/* Lista de categorías */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
              {categorias.length} {categorias.length === 1 ? 'categoría' : 'categorías'}
            </p>

            {isLoading ? (
              <p className="text-sm text-gray-500 text-center py-4">Cargando…</p>
            ) : categorias.length === 0 ? (
              <div className="bg-brand-dark rounded-xl p-6 text-center text-gray-500 text-sm">
                No hay categorías todavía. Crea la primera arriba.
              </div>
            ) : (
              categorias.map(cat => {
                const count = prodCount(cat)
                const isEditing = editId === cat.id
                const isConfirmDel = confirmDelId === cat.id

                return (
                  <div key={cat.id} className="bg-brand-dark rounded-xl border border-white/5 overflow-hidden">
                    {isEditing ? (
                      /* ── Modo edición ── */
                      <div className="p-3 space-y-2">
                        <div className="flex gap-2 items-center">
                          <EmojiPickerInput value={editEmoji} onChange={setEditEmoji} />
                          <input
                            value={editNom}
                            onChange={e => setEditNom(e.target.value)}
                            autoFocus
                            className="flex-1 bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm
                                       focus:outline-none focus:border-brand-teal"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditId(null)}
                            className="flex-1 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
                            Cancelar
                          </button>
                          <button onClick={() => actualizar()} disabled={!editNom.trim() || actualizando}
                            className="flex-1 py-1.5 text-xs rounded-lg bg-brand-teal text-brand-dark font-bold hover:bg-[#00A882] transition-colors disabled:opacity-40">
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : isConfirmDel ? (
                      /* ── Confirmar eliminar ── */
                      <div className="p-3 bg-red-500/10 space-y-2">
                        <p className="text-xs text-red-300">
                          ¿Eliminar "{cat.emoji} {cat.nombre}"?
                          {count > 0 && <span className="text-red-400 font-bold"> Tiene {count} producto(s).</span>}
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmDelId(null)}
                            className="flex-1 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
                            Cancelar
                          </button>
                          <button onClick={() => eliminar(cat.id)}
                            className="flex-1 py-1.5 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors">
                            Sí, eliminar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                      {/* ── Vista normal ── */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button
                          onClick={() => setExpandedCatId(v => v === cat.id ? null : cat.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <span className="text-xl w-7 text-center flex-shrink-0">{cat.emoji ?? '📦'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{cat.nombre}</p>
                            <p className="text-xs text-gray-500">{count} producto{count !== 1 ? 's' : ''}</p>
                          </div>
                          {expandedCatId === cat.id
                            ? <ChevronUp size={14} className="text-gray-500 flex-shrink-0" />
                            : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />}
                        </button>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => startEdit(cat)}
                            className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center
                                       text-gray-500 hover:text-white transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setConfirmDelId(cat.id)}
                            className="w-7 h-7 rounded-lg hover:bg-red-500/15 flex items-center justify-center
                                       text-gray-500 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* ── Productos de la categoría (expandido) ── */}
                      {expandedCatId === cat.id && (
                        <div className="border-t border-white/5 px-4 py-3 space-y-2 bg-black/10">
                          {productos.filter(p => p.categoria_id === cat.id).length === 0 ? (
                            <p className="text-xs text-gray-600 py-1">Sin productos en esta categoría.</p>
                          ) : (
                            productos.filter(p => p.categoria_id === cat.id).map(p => (
                              <div key={p.id} className="flex items-center justify-between gap-2 bg-brand-navy rounded-lg px-3 py-2">
                                <span className="text-sm text-white truncate">{p.nombre}</span>
                                <button
                                  onClick={() => moverProducto({ id: p.id, categoria_id: null })}
                                  title="Quitar de esta categoría"
                                  className="text-gray-500 hover:text-red-400 flex-shrink-0 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))
                          )}

                          {/* Agregar producto a la categoría */}
                          <div className="flex gap-2 pt-1">
                            <select
                              value={agregarProdId}
                              onChange={e => setAgregarProdId(e.target.value)}
                              className="flex-1 bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-xs text-white
                                         focus:outline-none focus:border-brand-teal"
                            >
                              <option value="">— Agregar producto —</option>
                              {productos.filter(p => p.categoria_id !== cat.id).map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => { if (agregarProdId) { moverProducto({ id: agregarProdId, categoria_id: cat.id }); setAgregarProdId('') } }}
                              disabled={!agregarProdId}
                              className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-brand-teal text-brand-dark
                                         hover:bg-[#00A882] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus size={12} /> Agregar
                            </button>
                          </div>
                        </div>
                      )}
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/5 sticky bottom-0 bg-brand-navy">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-white/10 text-sm text-gray-400 hover:text-white transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// TIPOS PARA PRODUCTO FORM
// ═════════════════════════════════════════════════════════════

interface ProductoForm {
  nombre:               string
  imagen_url:           string   // emoji (ej: "🥤") o URL real de imagen
  codigo_barras:        string
  categoria_id:         string
  unidad_venta:         string
  tipo_producto:        'compra_venta' | 'receta'
  reportar_a_dian:      boolean
  precio_compra:        string
  porcentaje_utilidad:  string
  porcentaje_iva:       string
  precio_venta:         string
  stock_actual:         string
  stock_minimo:         string
}
const PROD_EMPTY: ProductoForm = {
  nombre: '', imagen_url: '', codigo_barras: '', categoria_id: '', unidad_venta: 'unidad',
  tipo_producto: 'compra_venta', reportar_a_dian: false,
  precio_compra: '0', porcentaje_utilidad: '30', porcentaje_iva: '0',
  precio_venta: '0', stock_actual: '0', stock_minimo: '5',
}

// ── Modal Producto ────────────────────────────────────────────
function ModalProducto({
  producto, categorias, categoriaPreseleccionada, onClose,
}: {
  producto?:                 Producto
  categorias:                Categoria[]
  categoriaPreseleccionada?: string
  onClose:                   () => void
}) {
  const queryClient = useQueryClient()
  const isEdit      = !!producto

  const [form, setForm] = useState<ProductoForm>(producto ? {
    nombre:              producto.nombre,
    imagen_url:          producto.imagen_url          ?? '',
    codigo_barras:       producto.codigo_barras        ?? '',
    categoria_id:        producto.categoria_id         ?? '',
    unidad_venta:        producto.unidad_venta,
    tipo_producto:       (producto.tipo_producto       ?? 'compra_venta') as 'compra_venta' | 'receta',
    reportar_a_dian:     producto.reportar_a_dian      ?? false,
    precio_compra:       String(producto.precio_compra       ?? 0),
    porcentaje_utilidad: String(producto.porcentaje_utilidad ?? 30),
    porcentaje_iva:      String(producto.porcentaje_iva      ?? 0),
    precio_venta:        String(producto.precio_venta        ?? 0),
    stock_actual:        String(producto.stock_actual        ?? 0),
    stock_minimo:        String(producto.stock_minimo        ?? 0),
  } : {
    ...PROD_EMPTY,
    categoria_id: categoriaPreseleccionada ?? '',
  })

  const [confirmDel,   setConfirmDel]   = useState(false)
  const [showNewCat,   setShowNewCat]   = useState(false)
  const [newCatNombre, setNewCatNombre] = useState('')
  const [newCatEmoji,  setNewCatEmoji]  = useState('')
  const set = (k: keyof ProductoForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Auto-calcular precio venta cuando cambian precio_compra, utilidad o IVA
  const compra   = parseFloat(form.precio_compra)       || 0
  const utilidad = parseFloat(form.porcentaje_utilidad) || 0
  const iva      = parseFloat(form.porcentaje_iva)      || 0
  const sugerido = calcPrecioVenta(compra, utilidad, iva)

  const applyPrecioSugerido = () => {
    if (sugerido > 0) set('precio_venta', Math.ceil(sugerido).toString())
  }

  const { mutate: guardar, isPending: saving } = useMutation({
    mutationFn: () => {
      const body = {
        nombre:               form.nombre.trim(),
        imagen_url:           form.imagen_url.trim() || null,
        codigo_barras:        form.codigo_barras.trim() || null,
        categoria_id:         form.categoria_id         || null,
        unidad_venta:         form.unidad_venta,
        tipo_producto:        form.tipo_producto,
        reportar_a_dian:      form.reportar_a_dian,
        precio_compra:        parseFloat(form.precio_compra)       || 0,
        porcentaje_utilidad:  parseFloat(form.porcentaje_utilidad) || 0,
        porcentaje_iva:       parseFloat(form.porcentaje_iva)      || 0,
        precio_venta:         parseFloat(form.precio_venta)        || 0,
        stock_actual:         parseFloat(form.stock_actual)        || 0,
        stock_minimo:         parseFloat(form.stock_minimo)        || 0,
        disponible:           true,
        activo:               true,
        origen:               'externo',
      }
      return isEdit
        ? api.put(`/berlin/productos/${producto!.id}`, body)
        : api.post('/berlin/productos', body)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Producto actualizado ✅' : 'Producto creado ✅')
      queryClient.invalidateQueries({ queryKey: ['productos-terminados'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al guardar producto')
    },
  })

  const { mutate: eliminar, isPending: deleting } = useMutation({
    mutationFn: () => api.delete(`/berlin/productos/${producto!.id}`),
    onSuccess: () => {
      toast.success('Producto eliminado')
      queryClient.invalidateQueries({ queryKey: ['productos-terminados'] })
      onClose()
    },
    onError: () => toast.error('Error al eliminar'),
  })

  // Creación rápida de categoría dentro del modal
  const { mutate: crearCat, isPending: creandoCat } = useMutation({
    mutationFn: () => api.post('/berlin/categorias', {
      nombre: newCatNombre.trim(),
      emoji:  newCatEmoji.trim() || null,
    }),
    onSuccess: (res) => {
      const cat = res.data as Categoria
      queryClient.invalidateQueries({ queryKey: ['categorias-pan'] })
      set('categoria_id', cat.id)
      setShowNewCat(false)
      setNewCatNombre('')
      setNewCatEmoji('')
      toast.success(`Categoría "${cat.nombre}" creada ✅`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg || 'Error al crear categoría')
    },
  })

  const valid = form.nombre.trim() && parseFloat(form.precio_venta) > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-brand-navy border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[92vh]">

        {/* Header */}
        <div className="sticky top-0 bg-brand-navy border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-brand-teal" />
            <div>
              <p className="text-xs text-gray-500">{isEdit ? 'Editar producto' : 'Nuevo producto terminado'}</p>
              <h3 className="text-base font-bold text-white">
                {isEdit ? producto!.nombre : 'Crear Nuevo Producto'}
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isEdit && producto?.origen === 'receta' ? (
            <div className="bg-orange-500/10 border border-orange-500/25 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <span className="text-lg flex-shrink-0">🥐</span>
              <div>
                <p className="text-xs font-semibold text-orange-300">Producto de receta</p>
                <p className="text-xs text-orange-200/70 mt-0.5">
                  El costo se calcula automáticamente desde la receta. Aquí puedes cambiar el
                  <strong className="text-orange-200"> precio de venta, categoría y unidad</strong>.
                  El stock se actualiza con los Mojes de producción.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Ingresa el código, costos y el sistema calculará tu utilidad.</p>
          )}

          {/* Nombre + Imagen / Emoji icon */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Nombre del Producto <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <ProductImageInput value={form.imagen_url} onChange={v => set('imagen_url', v)} />
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder="Ej: Coca Cola 600ml"
                className="flex-1 bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-brand-teal placeholder:text-gray-600" />
            </div>
            <p className="text-[10px] text-gray-600 mt-1 ml-1">
              Toca el cuadro de la izquierda para subir una foto real o elegir un emoji (se verá en el POS)
            </p>
          </div>

          {/* Código de barras */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
              <Barcode size={12} /> Código de Barras
              <span className="text-gray-600 font-normal">(Pistolea aquí o deja en blanco)</span>
            </label>
            <input value={form.codigo_barras} onChange={e => set('codigo_barras', e.target.value)}
              placeholder="Pistolea aquí o deja en blanco"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                         font-mono focus:outline-none focus:border-brand-teal placeholder:text-gray-600" />
          </div>

          {/* Categoría + Unidad de venta */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Categoría</label>
                <select value={form.categoria_id} onChange={e => set('categoria_id', e.target.value)}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-white text-sm
                             focus:outline-none focus:border-brand-teal">
                  <option value="">Sin Categoría</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Unidad de venta</label>
                <select value={form.unidad_venta} onChange={e => set('unidad_venta', e.target.value)}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-white text-sm
                             focus:outline-none focus:border-brand-teal">
                  <option value="unidad">Unidad</option>
                  <option value="docena">Docena</option>
                  <option value="media_docena">Media docena</option>
                  <option value="paquete">Paquete</option>
                  <option value="caja">Caja</option>
                  <option value="bolsa">Bolsa</option>
                  <option value="bandeja">Bandeja</option>
                  <option value="canastilla">Canastilla</option>
                  <option value="kg">Kilogramo</option>
                  <option value="500g">500 gramos</option>
                  <option value="250g">250 gramos</option>
                  <option value="100g">100 gramos</option>
                  <option value="gramo">Gramo</option>
                  <option value="libra">Libra</option>
                  <option value="litro">Litro</option>
                </select>
              </div>
            </div>
            {/* Crear categoría rápida */}
            <button
              type="button"
              onClick={() => setShowNewCat(v => !v)}
              className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-white transition-colors"
            >
              <Plus size={11} />
              {showNewCat ? 'Cancelar nueva categoría' : '+ Crear nueva categoría'}
            </button>
            {showNewCat && (
              <div className="bg-brand-dark rounded-xl p-3 space-y-2 border border-white/5">
                <p className="text-xs text-gray-500">Añade una categoría sin salir del formulario</p>
                <div className="flex gap-2 items-center">
                  <EmojiPickerInput value={newCatEmoji} onChange={setNewCatEmoji} size="sm" />
                  <input
                    value={newCatNombre}
                    onChange={e => setNewCatNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && newCatNombre.trim() && crearCat()}
                    placeholder="Nombre de la categoría"
                    className="flex-1 bg-brand-navy border border-white/10 rounded-lg px-3 py-2 text-white text-sm
                               focus:outline-none focus:border-brand-teal placeholder:text-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => crearCat()}
                    disabled={!newCatNombre.trim() || creandoCat}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-bold transition-all',
                      newCatNombre.trim() && !creandoCat
                        ? 'bg-brand-teal text-brand-dark hover:bg-[#00A882]'
                        : 'bg-white/5 text-gray-600 cursor-not-allowed'
                    )}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Tipo de producto + DIAN ── */}
          <div className="grid grid-cols-1 gap-3">
            {/* Tipo */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Tipo de producto</label>
              <div className="grid grid-cols-2 gap-2">
                {(['compra_venta', 'receta'] as const).map(tipo => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => set('tipo_producto', tipo)}
                    className={cn(
                      'py-2.5 rounded-xl border text-xs font-semibold transition-colors',
                      form.tipo_producto === tipo
                        ? 'bg-brand-teal/15 border-brand-teal text-brand-teal'
                        : 'bg-brand-dark border-white/10 text-gray-400 hover:text-white hover:border-white/25',
                    )}
                  >
                    {tipo === 'compra_venta' ? '🛒 Compra y venta' : '🥐 De receta'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1 ml-1">
                {form.tipo_producto === 'receta'
                  ? 'Se fabrica internamente — el 40% de costo operativo se aplica al calcular utilidad'
                  : 'Se compra terminado y se revende (agua, gaseosas, snacks…)'}
              </p>
            </div>

            {/* Reportar a DIAN */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, reportar_a_dian: !f.reportar_a_dian }))}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  form.reportar_a_dian ? 'bg-brand-teal' : 'bg-white/10'
                )}
              >
                <span className={cn(
                  'absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  form.reportar_a_dian ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
              <div>
                <span className="text-sm text-gray-300">Reportar a DIAN</span>
                <p className="text-[10px] text-gray-600">
                  {form.reportar_a_dian ? 'Aparece en reportes tributarios' : 'No incluir en reportes tributarios'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Calculadora de precio ── */}
          <div className="bg-brand-dark rounded-xl p-4 space-y-4 border border-white/5">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Calculadora de precio</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Precio Compra ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="text" inputMode="numeric"
                    value={form.precio_compra ? parseInt(form.precio_compra, 10).toLocaleString('es-CO') : ''}
                    onChange={e => set('precio_compra', e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    className="w-full bg-brand-navy border border-white/10 rounded-lg pl-7 pr-4 py-2.5 text-white text-sm
                               focus:outline-none focus:border-brand-teal placeholder:text-gray-600" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Utilidad (%)</label>
                <div className="relative">
                  <input type="number" min="0" max="99" value={form.porcentaje_utilidad} onChange={e => set('porcentaje_utilidad', e.target.value)}
                    className="w-full bg-brand-navy border border-white/10 rounded-lg px-4 pr-8 py-2.5 text-white text-sm
                               focus:outline-none focus:border-brand-teal" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                </div>
              </div>
            </div>

            {/* IVA */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('porcentaje_iva', iva > 0 ? '0' : '19')}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  iva > 0 ? 'bg-brand-teal' : 'bg-white/10'
                )}
              >
                <span className={cn(
                  'absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  iva > 0 ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
              <span className="text-sm text-gray-300">
                Aplica IVA {iva > 0 ? <strong className="text-brand-teal">19%</strong> : <span className="text-gray-500">(sin IVA)</span>}
              </span>
            </div>

            {/* Precio sugerido */}
            {compra > 0 && (
              <div className="bg-brand-navy rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Precio sugerido</p>
                    <p className="text-lg font-bold text-brand-teal">{fmt(sugerido)}</p>
                    <p className="text-[11px] text-gray-600">
                      = {fmt(compra)} / {(1 - utilidad/100).toFixed(2)}
                      {iva > 0 ? ` × 1.${iva}` : ''}
                    </p>
                  </div>
                  <button onClick={applyPrecioSugerido}
                    className="text-xs bg-brand-teal/10 border border-brand-teal/30 text-brand-teal
                               hover:bg-brand-teal/20 px-3 py-1.5 rounded-lg transition-colors">
                    Aplicar →
                  </button>
                </div>
              </div>
            )}

            {/* Precio final */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Precio de Venta Sugerido / Final <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="text" inputMode="numeric"
                  value={form.precio_venta ? parseInt(form.precio_venta, 10).toLocaleString('es-CO') : ''}
                  onChange={e => set('precio_venta', e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full bg-brand-navy border border-brand-teal/50 rounded-xl pl-7 pr-4 py-3 text-white text-lg
                             font-bold focus:outline-none focus:border-brand-teal placeholder:text-gray-600" />
              </div>
            </div>
          </div>

          {/* Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Stock Inicial</label>
              <input type="number" min="0" value={form.stock_actual} onChange={e => set('stock_actual', e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-brand-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Alerta Stock Bajo (Mínimo)</label>
              <input type="number" min="0" value={form.stock_minimo} onChange={e => set('stock_minimo', e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:border-brand-teal" />
            </div>
          </div>

          {/* Eliminar (solo en edición de externos) */}
          {isEdit && producto?.origen === 'externo' && (
            confirmDel ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                <p className="text-sm text-red-300 font-medium">¿Eliminar "{producto.nombre}"?</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDel(false)}
                    className="flex-1 py-2 rounded-lg border border-white/10 text-gray-400 hover:text-white text-sm transition-colors">
                    Cancelar
                  </button>
                  <button onClick={() => eliminar()} disabled={deleting}
                    className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors">
                    {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/20
                           text-red-400/70 hover:text-red-400 hover:border-red-500/40 text-sm transition-colors">
                <Trash2 size={14} /> Eliminar producto
              </button>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-6 py-4 border-t border-white/5 sticky bottom-0 bg-brand-navy">
          {!valid && form.nombre.trim() && (
            <p className="text-xs text-yellow-400 text-center">
              ⚠️ Ingresa el Precio de Venta para poder guardar
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!valid} onClick={() => guardar()}>
              {isEdit ? 'Guardar cambios' : 'Guardar Producto'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers Export/Import Productos ──────────────────────────
const PLANTILLA_PROD_COLS = [
  'nombre','categoria','precio_venta','precio_compra',
  'porcentaje_utilidad','porcentaje_iva','unidad_venta','stock_minimo',
]
const PLANTILLA_PROD_ROWS = [
  ['Pan de Bono',          'Fritos',   0, 0, 30, 0, 'unidad', 5],
  ['Cheesecake Maracuya',  'Postres',  0, 0, 40, 0, 'unidad', 3],
  ['Cocacola 600ml',       'Gaseosas', 0, 0, 30, 0, 'unidad', 6],
]
function descargarPlantillaProductos() {
  const ws = XLSX.utils.aoa_to_sheet([PLANTILLA_PROD_COLS, ...PLANTILLA_PROD_ROWS])
  ws['!cols'] = [{wch:30},{wch:24},{wch:13},{wch:13},{wch:18},{wch:12},{wch:13},{wch:13}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Productos')
  XLSX.writeFile(wb, 'plantilla_productos_kalreco.xlsx')
}

function exportarProductos(productos: Producto[], categorias: Categoria[]) {
  const catMap = new Map(categorias.map(c => [c.id, c.nombre]))
  const filas  = productos.map(p => ({
    nombre:              p.nombre,
    categoria:           catMap.get(p.categoria_id ?? '') ?? '',
    precio_venta:        p.precio_venta,
    precio_compra:       p.precio_compra  ?? 0,
    porcentaje_utilidad: p.porcentaje_utilidad ?? 0,
    porcentaje_iva:      p.porcentaje_iva ?? 0,
    unidad_venta:        p.unidad_venta,
    stock_actual:        p.stock_actual,
    stock_minimo:        p.stock_minimo,
    origen:              p.origen ?? 'externo',
    disponible:          p.disponible ? 'Si' : 'No',
  }))
  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [{wch:32},{wch:24},{wch:13},{wch:13},{wch:18},{wch:12},{wch:13},{wch:12},{wch:12},{wch:10},{wch:10}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Productos')
  XLSX.writeFile(wb, `productos_terminados_${new Date().toISOString().split('T')[0]}.xlsx`)
  toast.success('Exportado como Excel ✅')
}

async function importarProductosExcel(
  file: File,
  categorias: Categoria[],
  queryClient: ReturnType<typeof useQueryClient>,
  onDone: () => void,
) {
  const data = await file.arrayBuffer()
  const wb   = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames.find(n => n === 'IMPORT') ?? wb.SheetNames[0]
  const ws   = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

  const valid = rows.filter(r =>
    String(r['nombre']    ?? '').trim() &&
    String(r['categoria'] ?? '').trim(),
  )
  if (!valid.length) {
    toast.error('El archivo está vacío o no tiene el formato correcto')
    onDone()
    return
  }

  const tid = toast.loading(`Procesando ${valid.length} productos…`)

  // ── UPSERT: buscar productos existentes para no duplicar ──────
  // Si el producto ya existe (por nombre) → actualiza precios
  // Si no existe → crea nuevo
  let existingByName = new Map<string, Producto>()
  try {
    const res = await api.get('/berlin/productos')
    const lista: Producto[] = res.data
    existingByName = new Map(lista.map(p => [p.nombre.toLowerCase().trim(), p]))
  } catch { /* si falla, se intentará crear todo */ }

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const catMap = new Map(categorias.map(c => [norm(c.nombre), c.id]))

  let creados = 0, actualizados = 0, err = 0

  for (const row of valid) {
    try {
      const nombre    = String(row['nombre']    ?? '').trim()
      const catNombre = String(row['categoria'] ?? '').trim()
      const pv = parseFloat(String(row['precio_venta']        ?? '0')) || 0
      const pc = parseFloat(String(row['precio_compra']       ?? '0')) || 0
      const pu = parseFloat(String(row['porcentaje_utilidad'] ?? '0')) || 0
      const pi = parseFloat(String(row['porcentaje_iva']      ?? '0')) || 0
      const uv = String(row['unidad_venta'] ?? 'unidad').trim() || 'unidad'
      const sm = parseFloat(String(row['stock_minimo'] ?? '5')) || 5

      // Buscar o crear categoría (tolerante a tildes)
      let catId = catMap.get(norm(catNombre))
      if (!catId) {
        const res = await api.post('/berlin/categorias', { nombre: catNombre, emoji: null, activo: true })
        const newCat = res.data as Categoria
        catId = newCat.id
        catMap.set(norm(newCat.nombre), catId)
      }

      const existing = existingByName.get(nombre.toLowerCase().trim())
      if (existing) {
        // Producto ya existe → actualizar precios y categoría
        await api.put(`/berlin/productos/${existing.id}`, {
          nombre,
          categoria_id:        catId,
          precio_venta:        pv,
          precio_compra:       pc,
          porcentaje_utilidad: pu,
          porcentaje_iva:      pi,
          unidad_venta:        uv,
          stock_minimo:        sm,
        })
        actualizados++
      } else {
        // No existe → crear
        await api.post('/berlin/productos', {
          nombre,
          categoria_id:        catId,
          precio_venta:        pv,
          precio_compra:       pc,
          porcentaje_utilidad: pu,
          porcentaje_iva:      pi,
          unidad_venta:        uv,
          stock_actual:        0,
          stock_minimo:        sm,
          disponible:          true,
          activo:              true,
          origen:              'externo',
        })
        creados++
      }
    } catch {
      err++
    }
  }

  toast.dismiss(tid)
  if (creados     > 0) toast.success(`${creados} productos nuevos creados ✅`)
  if (actualizados > 0) toast.success(`${actualizados} productos actualizados con precios ✅`)
  if (err         > 0) toast.error(`${err} productos con error`)
  queryClient.invalidateQueries({ queryKey: ['productos-terminados'] })
  queryClient.invalidateQueries({ queryKey: ['categorias-pan'] })
  onDone()
}

// ── Tab Productos Terminados ──────────────────────────────────
function TabProductos() {
  const user = useAuthStore(s => s.user)
  const esPanadero = user?.rol === 'panadero'
  const [busqueda,        setBusqueda]       = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroEstado,    setFiltroEstado]   = useState<'' | 'agotados' | 'bajos'>('')
  const [modalProducto,   setModalProducto]  = useState(false)
  const [productoEditar,  setProductoEditar] = useState<Producto | null>(null)
  const [showGestionCat,  setShowGestionCat] = useState(false)
  const [importando,      setImportando]     = useState(false)
  const fileRef    = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos-terminados'],
    queryFn:  () => api.get('/berlin/productos').then(r => r.data),
  })

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['categorias-pan'],
    queryFn:  () => api.get('/berlin/categorias').then(r => r.data),
  })

  const filtrados = productos.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.codigo_barras ?? '').includes(busqueda)
    const matchCat = filtroCategoria === '' || p.categoria_id === filtroCategoria
    const isAgotado = p.origen === 'externo' && p.stock_actual <= 0
    const isBajo = p.origen === 'externo' && p.stock_actual > 0 && p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo
    const matchEstado =
      filtroEstado === '' ? true :
      filtroEstado === 'agotados' ? isAgotado :
      isBajo
    return matchSearch && matchCat && matchEstado
  })

  const totales = {
    unidades: filtrados.reduce((s, p) => s + p.stock_actual, 0),
    valor:    filtrados.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0),
    agotados: productos.filter(p => p.origen === 'externo' && p.stock_actual <= 0).length,
    bajos:    productos.filter(p => p.origen === 'externo' && p.stock_actual > 0 && p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo).length,
  }

  const abrirEditar = (p: Producto) => {
    setProductoEditar(p)
    setModalProducto(true)
  }
  const cerrarModal = () => {
    setModalProducto(false)
    setProductoEditar(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ShoppingCart size={17} className="text-brand-teal" />
          <span className="text-sm font-bold text-white">Productos Terminados</span>
          <span className="text-xs bg-brand-dark border border-white/10 px-2 py-0.5 rounded-full text-gray-400">
            {productos.length} productos
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Input oculto para importar */}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={async e => {
              const f = e.target.files?.[0]
              if (!f) return
              setImportando(true)
              await importarProductosExcel(f, categorias, queryClient, () => {
                setImportando(false)
              })
              if (fileRef.current) fileRef.current.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importando}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <Upload size={13} />
            {importando ? 'Importando…' : 'Importar Excel'}
          </button>
          <button
            onClick={() => descargarPlantillaProductos()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <FileSpreadsheet size={13} /> Plantilla
          </button>
          <button
            onClick={() => exportarProductos(productos, categorias)}
            disabled={!productos.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            <Download size={13} /> Exportar
          </button>
          <button
            onClick={() => setShowGestionCat(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-white/10
                       text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Settings2 size={13} /> Categorías
          </button>
          <Button size="sm" onClick={() => { setProductoEditar(null); setModalProducto(true) }}>
            <Plus size={14} /> Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Ayuda importar */}
      <div className="bg-brand-navy/50 rounded-lg border border-white/5 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <FileSpreadsheet size={12} className="text-green-400" />
          Para importar en lote: descarga la{' '}
          <button onClick={descargarPlantillaProductos} className="text-brand-teal hover:underline">plantilla Excel</button>,
          rellénala y súbela con "Importar Excel".
        </span>
        <span>Columnas: nombre · categoria · precio_venta · precio_compra · porcentaje_utilidad · porcentaje_iva · unidad_venta · stock_minimo</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
          <p className="text-xs text-gray-500">Total unidades</p>
          <p className="text-lg font-bold mt-0.5 text-brand-teal">{totales.unidades.toFixed(0)}</p>
        </div>
        <div className="bg-brand-navy rounded-xl border border-white/5 p-4">
          <p className="text-xs text-gray-500">Valor en stock</p>
          <p className="text-lg font-bold mt-0.5 text-green-400">{fmt(totales.valor)}</p>
        </div>
        <button
          onClick={() => setFiltroEstado(f => f === 'agotados' ? '' : 'agotados')}
          className={cn(
            'rounded-xl border p-4 text-left transition-all',
            filtroEstado === 'agotados'
              ? 'bg-red-500/15 border-red-500/50'
              : 'bg-brand-navy border-white/5 hover:border-red-500/30',
          )}>
          <p className="text-xs text-gray-500">Agotados</p>
          <p className={cn('text-lg font-bold mt-0.5', totales.agotados > 0 ? 'text-red-400' : 'text-gray-500')}>
            {totales.agotados}
          </p>
          {filtroEstado === 'agotados' && <p className="text-[10px] text-red-400 mt-1">Filtro activo ×</p>}
        </button>
        <button
          onClick={() => setFiltroEstado(f => f === 'bajos' ? '' : 'bajos')}
          className={cn(
            'rounded-xl border p-4 text-left transition-all',
            filtroEstado === 'bajos'
              ? 'bg-amber-500/15 border-amber-500/50'
              : 'bg-brand-navy border-white/5 hover:border-amber-500/30',
          )}>
          <p className="text-xs text-gray-500">Bajos</p>
          <p className={cn('text-lg font-bold mt-0.5', totales.bajos > 0 ? 'text-amber-400' : 'text-gray-500')}>
            {totales.bajos}
          </p>
          {filtroEstado === 'bajos' && <p className="text-[10px] text-amber-400 mt-1">Filtro activo ×</p>}
        </button>
      </div>

      {/* Leyenda de origen */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="text-base">🥐</span> Producido en panadería (de receta/moje)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-base">🛒</span> Comprado a proveedor externo
        </span>
      </div>

      {/* Pills de categorías */}
      {categorias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroCategoria('')}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-colors',
              filtroCategoria === ''
                ? 'bg-brand-teal text-brand-dark border-brand-teal font-semibold'
                : 'bg-brand-navy text-gray-400 border-white/10 hover:text-white'
            )}
          >
            Todos
          </button>
          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFiltroCategoria(filtroCategoria === cat.id ? '' : cat.id)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors',
                filtroCategoria === cat.id
                  ? 'bg-brand-teal text-brand-dark border-brand-teal font-semibold'
                  : 'bg-brand-navy text-gray-400 border-white/10 hover:text-white'
              )}
            >
              {cat.emoji && <span>{cat.emoji}</span>}
              {cat.nombre}
              {(cat.productos?.[0]?.count ?? 0) > 0 && (
                <span className="opacity-60">({cat.productos?.[0]?.count ?? 0})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código de barras…"
          className="w-full bg-brand-navy border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white
                     focus:outline-none focus:border-brand-teal" />
      </div>

      {/* Tabla */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12 text-gray-500 text-sm">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-500">
            <Package2 size={32} className="opacity-30" />
            <p className="text-sm">{productos.length === 0 ? 'No hay productos — crea el primero' : 'Sin resultados'}</p>
            {productos.length === 0 && (
              <Button size="sm" onClick={() => { setProductoEditar(null); setModalProducto(true) }}>
                <Plus size={14} /> Crear primer producto
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-white/5 bg-brand-dark/30">
                  <th className="text-left px-5 py-3">Producto</th>
                  <th className="text-left px-4 py-3">Código</th>
                  <th className="text-right px-4 py-3">P. Compra</th>
                  <th className="text-right px-4 py-3">Utilidad</th>
                  <th className="text-right px-4 py-3">P. Venta</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map(p => {
                  // Para recetas, el stock viene de Mojes; stock=0 ≠ "agotado"
                  const esExterno = p.origen === 'externo'
                  const agotado   = esExterno && p.stock_actual <= 0
                  const critico   = esExterno && p.stock_actual > 0 && p.stock_actual <= p.stock_minimo
                  return (
                    <tr key={p.id} className={cn('hover:bg-white/2 transition-colors', agotado && 'opacity-70')}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {p.imagen_url?.startsWith('http') ? (
                            <img
                              src={p.imagen_url}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-white/10"
                            />
                          ) : p.imagen_url ? (
                            <span className="text-base flex-shrink-0">{p.imagen_url}</span>
                          ) : (
                            <span className="text-base flex-shrink-0" title={esExterno ? 'Externo' : 'De receta'}>
                              {esExterno ? '🛒' : '🥐'}
                            </span>
                          )}
                          <div>
                            <p className="font-medium text-white">{p.nombre}</p>
                            {p.categoria && (
                              <p className="text-xs text-gray-500">{p.categoria.nombre}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {p.codigo_barras ?? <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">
                        {p.precio_compra > 0 ? fmt(p.precio_compra) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {p.porcentaje_utilidad > 0 ? (
                          <span className="text-green-400">{p.porcentaje_utilidad}%</span>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-brand-teal font-medium">
                        {fmt(p.precio_venta)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-mono font-bold',
                          agotado ? 'text-red-400' : critico ? 'text-yellow-400' : 'text-white'
                        )}>
                          {p.stock_actual.toFixed(0)}
                        </span>{' '}
                        <span className="text-gray-600 text-xs">{p.unidad_venta}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {!esExterno ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border
                                          bg-orange-500/15 text-orange-400 border-orange-500/30">
                            Receta
                          </span>
                        ) : (
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full border',
                            agotado ? 'bg-red-500/15 text-red-400 border-red-500/30'
                              : critico ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
                              : 'bg-green-500/15 text-green-400 border-green-500/30'
                          )}>
                            {agotado ? 'Agotado' : critico ? 'Bajo' : 'Ok'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!esPanadero && (
                          <button onClick={() => abrirEditar(p)}
                            className="flex items-center gap-1.5 text-xs text-brand-teal hover:text-white
                                       bg-brand-teal/10 hover:bg-brand-teal/20 px-3 py-1.5 rounded-lg
                                       transition-colors border border-brand-teal/20 whitespace-nowrap">
                            <Pencil size={11} /> Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-white/10">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-xs text-gray-500">
                    {filtrados.length} productos
                  </td>
                  <td colSpan={4} className="px-4 py-3 text-right text-brand-teal font-bold text-sm">
                    Valor total: {fmt(filtrados.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalProducto && (
        <ModalProducto
          producto={productoEditar ?? undefined}
          categorias={categorias}
          categoriaPreseleccionada={!productoEditar ? filtroCategoria : undefined}
          onClose={cerrarModal}
        />
      )}
      {showGestionCat && (
        <ModalGestionCategorias onClose={() => setShowGestionCat(false)} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — Inventario (tab: Insumos / Productos)
// ═════════════════════════════════════════════════════════════
export default function MateriasPrimas() {
  const [tab, setTab] = useState<'insumos' | 'productos'>('insumos')

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Package size={20} className="text-brand-teal" />
        <h2 className="text-lg font-bold text-white">Inventario</h2>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-brand-dark p-1 rounded-xl w-fit border border-white/5">
        <button
          onClick={() => setTab('insumos')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'insumos'
              ? 'bg-brand-navy text-white shadow-sm border border-white/10'
              : 'text-gray-500 hover:text-white'
          )}
        >
          <FlaskConical size={15} />
          Insumos
          <span className="text-xs opacity-60">(recetas)</span>
        </button>
        <button
          onClick={() => setTab('productos')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'productos'
              ? 'bg-brand-navy text-white shadow-sm border border-white/10'
              : 'text-gray-500 hover:text-white'
          )}
        >
          <ShoppingCart size={15} />
          Productos Terminados
          <span className="text-xs opacity-60">(venta)</span>
        </button>
      </div>

      {/* ── Contenido del tab activo ── */}
      {tab === 'insumos' ? <TabInsumos /> : <TabProductos />}
    </div>
  )
}
