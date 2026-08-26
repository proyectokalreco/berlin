/**
 * FormCrearProductoRapido
 * Mini-formulario inline para crear un producto terminado (tipo 'receta')
 * sin salir del flujo actual. Reutilizado en RecetasPage y PlanillaPage.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import type { Producto, Categoria } from '../types'
import ProductImageInput from './ProductImageInput'

interface Props {
  nombreInicial?: string
  /** Callback cuando el producto fue creado exitosamente */
  onCreado: (prod: Producto) => void
  onCancelar: () => void
}

export default function FormCrearProductoRapido({ nombreInicial = '', onCreado, onCancelar }: Props) {
  const qc = useQueryClient()

  const [nombre,     setNombre]     = useState(nombreInicial)
  const [precio,     setPrecio]     = useState('')
  const [catId,      setCatId]      = useState('')
  const [stock,      setStock]      = useState('0')
  const [imagenUrl,  setImagenUrl]  = useState('')

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['categorias-pan'],
    queryFn:  () => api.get('/berlin/categorias').then(r => r.data),
  })

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/productos', {
      nombre:              nombre.trim(),
      imagen_url:          imagenUrl || null,
      categoria_id:        catId || null,
      tipo_producto:       'receta',
      origen:              'receta',
      precio_venta:        parseFloat(precio) || 0,
      precio_compra:       0,
      porcentaje_utilidad: 0,
      porcentaje_iva:      0,
      unidad_venta:        'unidad',
      stock_actual:        parseFloat(stock) || 0,
      stock_minimo:        5,
      disponible:          true,
      activo:              true,
    }),
    onSuccess: (res) => {
      const prod = res.data as Producto
      qc.invalidateQueries({ queryKey: ['productos-terminados'] })
      qc.invalidateQueries({ queryKey: ['productos-busqueda'] })
      qc.invalidateQueries({ queryKey: ['productos-receta'] })
      toast.success(`"${prod.nombre}" creado ✅`)
      onCreado(prod)
    },
    onError: () => toast.error('Error al crear el producto'),
  })

  const canSave = nombre.trim().length > 0

  return (
    <div className="space-y-3 bg-brand-dark border border-brand-teal/30 rounded-xl p-3">
      <p className="text-xs text-brand-teal font-semibold flex items-center gap-1.5">
        <Plus size={11} /> Nuevo producto terminado
      </p>

      {/* Foto + Nombre */}
      <div className="flex gap-2 items-center">
        <ProductImageInput value={imagenUrl} onChange={setImagenUrl} />
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre del producto *"
          autoFocus
          className="flex-1 bg-brand-navy border border-white/10 rounded-lg px-3 py-2.5
                     text-white text-sm focus:outline-none focus:border-brand-teal
                     placeholder:text-gray-600"
        />
      </div>

      {/* Precio + Categoría */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
          <input
            type="text" inputMode="numeric"
            value={precio ? parseInt(precio, 10).toLocaleString('es-CO') : ''}
            onChange={e => setPrecio(e.target.value.replace(/\D/g, ''))}
            placeholder="Precio de venta *"
            className="w-full bg-brand-navy border border-white/10 rounded-lg pl-6 pr-3 py-2.5
                       text-white text-sm focus:outline-none focus:border-brand-teal
                       placeholder:text-gray-600"
          />
        </div>
        <select
          value={catId}
          onChange={e => setCatId(e.target.value)}
          className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2.5
                     text-white text-sm focus:outline-none focus:border-brand-teal"
        >
          <option value="">Sin categoría</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ''}{c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Stock inicial */}
      <div>
        <label className="text-[10px] text-gray-500 mb-1 block">Stock inicial</label>
        <input
          type="number" min="0" step="1"
          value={stock}
          onChange={e => setStock(e.target.value)}
          className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2
                     text-white text-sm focus:outline-none focus:border-brand-teal"
        />
      </div>

      <p className="text-[10px] text-gray-500">
        Tipo <span className="text-brand-teal">De receta</span> asignado automáticamente.
        Podés editar más detalles desde Inventario.
      </p>

      {/* Botones */}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 py-2 text-xs rounded-lg border border-white/10 text-gray-400
                     hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={() => crear()}
          disabled={!canSave || isPending}
          className="flex-1 py-2 text-xs rounded-lg bg-brand-teal hover:bg-[#00A882]
                     text-brand-dark font-bold transition-colors disabled:opacity-40">
          {isPending ? 'Creando…' : '✓ Crear y vincular'}
        </button>
      </div>
    </div>
  )
}
