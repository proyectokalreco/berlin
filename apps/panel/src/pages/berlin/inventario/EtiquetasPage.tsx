import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag, Printer, Plus, Minus, Search } from 'lucide-react'
import { api } from '../../../lib/api'
import type { Producto } from '../../../types'
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

function isEmojiIcon(s?: string | null) {
  return !!s && !s.startsWith('http') && s.length <= 8
}

// ── Genera el HTML de impresión para las etiquetas ────────────
function generarHtmlEtiquetas(
  seleccion: { producto: Producto; cantidad: number }[],
  tamano: 'pequena' | 'mediana' | 'grande'
) {
  const sizes = {
    pequena: { w: '40mm', h: '25mm', precio: '18pt', nombre: '8pt', barcode: '35px' },
    mediana: { w: '58mm', h: '40mm', precio: '24pt', nombre: '9pt', barcode: '50px' },
    grande:  { w: '80mm', h: '50mm', precio: '30pt', nombre: '10pt', barcode: '60px' },
  }
  const s = sizes[tamano]

  const etiquetas: string[] = []
  for (const { producto: p, cantidad } of seleccion) {
    const codigo = p.codigo_barras ?? p.id.replace(/-/g, '').slice(0, 12).toUpperCase()
    for (let i = 0; i < cantidad; i++) {
      etiquetas.push(`
        <div class="etiqueta">
          <p class="nombre">${p.nombre}</p>
          <svg class="barcode" jsbarcode-value="${codigo}" jsbarcode-format="CODE128"
               jsbarcode-height="${parseInt(s.barcode)}" jsbarcode-fontsize="11"
               jsbarcode-margin="2" jsbarcode-displayvalue="true"></svg>
          <p class="precio">${fmt(p.precio_venta)}</p>
        </div>
      `)
    }
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Etiquetas — Delicias de Berlín</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  @page { margin:3mm; size: auto }
  body { font-family: Arial, sans-serif; background:#fff }
  .grid { display:flex; flex-wrap:wrap; gap:2mm }
  .etiqueta {
    width:${s.w}; height:${s.h};
    border:0.5px solid #ccc;
    border-radius:2mm;
    padding:2mm;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:space-between;
    overflow:hidden;
    page-break-inside:avoid;
  }
  .nombre {
    font-size:${s.nombre};
    font-weight:bold;
    text-align:center;
    width:100%;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    color:#000;
  }
  .barcode { max-width:100%; height:auto }
  .precio {
    font-size:${s.precio};
    font-weight:900;
    color:#000;
    text-align:center;
  }
</style></head><body>
<div class="grid">${etiquetas.join('')}</div>
<script>
  window.addEventListener('load', function() {
    JsBarcode('.barcode', { format: 'CODE128', lineColor:'#000', background:'#fff', displayValue:true, margin:2, fontSize:11 })
    setTimeout(function(){ window.print(); setTimeout(function(){ window.close() }, 800) }, 600)
  })
<\/script>
</body></html>`
}

// ── Página principal ──────────────────────────────────────────
export default function EtiquetasPage() {
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<Map<string, { producto: Producto; cantidad: number }>>(new Map())
  const [tamano, setTamano] = useState<'pequena' | 'mediana' | 'grande'>('mediana')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos-etiquetas', busqueda],
    queryFn:  () => api.get('/berlin/productos', {
      params: { q: busqueda || undefined, limit: 50 },
    }).then(r => r.data).catch(() => []),
  })

  const setCantidad = (producto: Producto, delta: number) => {
    setSeleccion(prev => {
      const next = new Map(prev)
      const actual = next.get(producto.id)?.cantidad ?? 0
      const nueva  = Math.max(0, actual + delta)
      if (nueva === 0) next.delete(producto.id)
      else next.set(producto.id, { producto, cantidad: nueva })
      return next
    })
  }

  const imprimir = () => {
    const items = Array.from(seleccion.values())
    if (!items.length) return
    const html = generarHtmlEtiquetas(items, tamano)
    const w = window.open('', '_blank', 'width=700,height=600')
    if (w) { w.document.write(html); w.document.close() }
  }

  const totalEtiquetas = Array.from(seleccion.values()).reduce((s, i) => s + i.cantidad, 0)

  return (
    <div className="space-y-4">

      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Tag size={20} className="text-brand-teal" />
          <div>
            <h2 className="text-lg font-bold text-white">Etiquetas de Productos</h2>
            <p className="text-xs text-gray-500">Código de barras + precio en tamaño grande</p>
          </div>
        </div>
        <button
          onClick={imprimir}
          disabled={!seleccion.size}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-teal
                     hover:bg-[#00A882] text-brand-dark font-bold text-sm
                     disabled:opacity-40 transition-colors min-h-[44px]"
        >
          <Printer size={15} />
          Imprimir {totalEtiquetas > 0 ? `(${totalEtiquetas})` : ''}
        </button>
      </div>

      {/* Opciones de tamaño */}
      <div className="flex gap-2 flex-wrap">
        {(['pequena', 'mediana', 'grande'] as const).map(t => (
          <button key={t} type="button"
            onClick={() => setTamano(t)}
            className={cn(
              'px-4 py-2 rounded-xl text-xs font-semibold border transition-all capitalize',
              tamano === t
                ? 'bg-brand-teal/15 border-brand-teal/50 text-brand-teal'
                : 'bg-brand-navy border-white/10 text-gray-400 hover:border-white/20',
            )}
          >
            {t === 'pequena' ? '40×25mm' : t === 'mediana' ? '58×40mm' : '80×50mm'} · {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <p className="text-xs text-gray-600 self-center ml-2">
          Precio mínimo 18pt · Código de barras ≥35px de alto
        </p>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full bg-brand-navy border border-white/10 rounded-xl
                     pl-10 pr-4 py-3 text-sm text-white focus:outline-none
                     focus:border-brand-teal placeholder:text-gray-600"
        />
      </div>

      {/* Grid de productos */}
      {isLoading ? (
        <p className="text-sm text-gray-600 text-center py-10">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {productos.map(p => {
            const qty = seleccion.get(p.id)?.cantidad ?? 0
            return (
              <div key={p.id}
                className={cn(
                  'bg-brand-navy rounded-xl border p-4 transition-colors',
                  qty > 0 ? 'border-brand-teal/40' : 'border-white/5',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden
                                  bg-brand-teal/10 flex items-center justify-center border border-white/5">
                    {p.imagen_url && !isEmojiIcon(p.imagen_url)
                      ? <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xl">{p.imagen_url || '🍞'}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.nombre}</p>
                    <p className="text-xs text-brand-teal font-bold">{fmt(p.precio_venta)}</p>
                    {p.codigo_barras && (
                      <p className="text-[10px] text-gray-600 font-mono">{p.codigo_barras}</p>
                    )}
                  </div>
                </div>

                {/* Control de cantidad */}
                <div className="flex items-center justify-between mt-3">
                  <p className="text-[10px] text-gray-500">Cantidad de etiquetas</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCantidad(p, -1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center
                                 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className={cn('w-8 text-center text-sm font-bold tabular-nums',
                      qty > 0 ? 'text-brand-teal' : 'text-gray-600')}>
                      {qty}
                    </span>
                    <button
                      onClick={() => setCantidad(p, 1)}
                      className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center
                                 text-gray-400 hover:text-brand-teal hover:bg-brand-teal/10 transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Resumen selección */}
      {seleccion.size > 0 && (
        <div className="sticky bottom-4">
          <div className="bg-brand-teal/15 border border-brand-teal/30 rounded-xl px-4 py-3
                          flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-brand-teal font-bold">
                {seleccion.size} producto{seleccion.size !== 1 ? 's' : ''} · {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {Array.from(seleccion.values()).map(i => `${i.producto.nombre} ×${i.cantidad}`).join(' · ')}
              </p>
            </div>
            <button
              onClick={imprimir}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-teal
                         hover:bg-[#00A882] text-brand-dark font-bold text-sm transition-colors"
            >
              <Printer size={15} /> Imprimir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
