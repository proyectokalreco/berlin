import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { Producto } from '../../../types'
import { Package2, Search, TrendingUp, TrendingDown, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export default function ProductosTerminados() {
  const [busqueda, setBusqueda] = useState('')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos'],
    queryFn:  () => api.get('/berlin/productos').then(r => r.data),
    refetchInterval: 15_000,
  })

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const totalUnidades   = filtrados.reduce((s, p) => s + p.stock_actual, 0)
  const totalValor      = filtrados.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0)
  const conStock        = filtrados.filter(p => p.stock_actual > p.stock_minimo).length
  const agotados        = filtrados.filter(p => p.stock_actual <= 0).length

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package2 size={20} className="text-brand-teal" />
          <h2 className="text-lg font-bold text-white">Productos Terminados</h2>
          <span className="text-xs bg-brand-navy border border-white/10 px-2 py-0.5 rounded-full text-gray-400">
            {productos.length} productos
          </span>
        </div>
      </div>

      {/* ── KPI resumen ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total unidades', value: totalUnidades.toFixed(0), icon: Package2, color: 'teal' },
          { label: 'Valor en stock', value: fmt(totalValor), icon: TrendingUp, color: 'green' },
          { label: 'Con stock', value: conStock, icon: CheckCircle, color: 'teal' },
          { label: 'Agotados', value: agotados, icon: XCircle, color: agotados > 0 ? 'red' : 'teal' },
        ].map(({ label, value, icon: Icon, color }) => {
          const colors: Record<string, string> = {
            teal:  'text-brand-teal bg-brand-teal/10',
            green: 'text-green-400 bg-green-400/10',
            red:   'text-red-400 bg-red-400/10',
          }
          return (
            <div key={label} className="bg-brand-navy rounded-xl border border-white/5 p-4 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', colors[color])}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Buscador ── */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full bg-brand-navy border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white
                     focus:outline-none focus:border-brand-teal max-w-sm"
        />
      </div>

      {/* ── Tabla ── */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12 text-gray-500 text-sm">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2 text-gray-500">
            <Package2 size={32} className="opacity-30" />
            <p className="text-sm">
              {productos.length === 0
                ? 'No hay productos registrados'
                : 'Sin resultados para la búsqueda'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-white/5 bg-brand-dark/30">
                  <th className="text-left px-5 py-3">Producto</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-right px-4 py-3">Precio venta</th>
                  <th className="text-right px-4 py-3">Valor stock</th>
                  <th className="text-center px-4 py-3">Disponible</th>
                  <th className="text-center px-4 py-3">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map(p => {
                  const agotado  = p.stock_actual <= 0
                  const critico  = p.stock_actual > 0 && p.stock_actual <= p.stock_minimo
                  return (
                    <tr key={p.id} className={cn(
                      'hover:bg-white/2 transition-colors',
                      agotado && 'opacity-60'
                    )}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {agotado
                            ? <TrendingDown size={14} className="text-red-400 flex-shrink-0" />
                            : critico
                            ? <TrendingDown size={14} className="text-yellow-400 flex-shrink-0" />
                            : <TrendingUp size={14} className="text-green-500/60 flex-shrink-0" />}
                          <p className="font-medium text-white">{p.nombre}</p>
                        </div>
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
                      <td className="px-4 py-3 text-right text-brand-teal font-mono">
                        {fmt(p.precio_venta)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono">
                        {fmt(p.stock_actual * p.precio_venta)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full border',
                          p.disponible && !agotado
                            ? 'bg-green-500/15 text-green-400 border-green-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30'
                        )}>
                          {p.disponible && !agotado ? 'Disponible' : agotado ? 'Agotado' : 'No disponible'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs capitalize">
                        {p.unidad_venta}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t border-white/10">
                <tr className="text-sm">
                  <td className="px-5 py-3 text-gray-400 font-medium">Totales</td>
                  <td className="px-4 py-3 text-right text-white font-bold">
                    {filtrados.reduce((s, p) => s + p.stock_actual, 0).toFixed(0)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-brand-teal font-bold">
                    {fmt(filtrados.reduce((s, p) => s + p.stock_actual * p.precio_venta, 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
