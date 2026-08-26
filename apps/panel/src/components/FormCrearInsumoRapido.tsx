/**
 * FormCrearInsumoRapido
 * Mini-formulario inline para crear una materia prima (insumo) sin salir del flujo.
 * Reutilizado en RecetasPage.
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import type { Insumo } from '../types'

const UNIDADES = ['g', 'kg', 'ml', 'l', 'unidad', 'bolsa', 'bulto', 'libra', 'onza']

interface Props {
  onCreado:   (insumo: Insumo) => void
  onCancelar: () => void
}

export default function FormCrearInsumoRapido({ onCreado, onCancelar }: Props) {
  const qc = useQueryClient()

  const [nombre,  setNombre]  = useState('')
  const [costo,   setCosto]   = useState('')
  const [unidad,  setUnidad]  = useState('g')
  const [stock,   setStock]   = useState('0')

  const { mutate: crear, isPending } = useMutation({
    mutationFn: () => api.post('/berlin/insumos', {
      nombre:         nombre.trim(),
      costo_unitario: parseFloat(costo.replace(/\D/g, '')) || 0,
      unidad_medida:  unidad,
      stock_actual:   parseFloat(stock) || 0,
      stock_minimo:   0,
      activo:         true,
    }),
    onSuccess: (res) => {
      const insumo = res.data as Insumo
      qc.invalidateQueries({ queryKey: ['insumos-receta'] })
      qc.invalidateQueries({ queryKey: ['insumos'] })
      toast.success(`"${insumo.nombre}" creado ✅`)
      onCreado(insumo)
    },
    onError: () => toast.error('Error al crear el insumo'),
  })

  return (
    <div className="space-y-3 bg-brand-dark border border-[#EA580C]/30 rounded-xl p-3">
      <p className="text-xs text-[#EA580C] font-semibold flex items-center gap-1.5">
        <Plus size={11} /> Nuevo insumo (materia prima)
      </p>

      <input
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        placeholder="Nombre del insumo *"
        autoFocus
        className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2.5
                   text-white text-sm focus:outline-none focus:border-[#EA580C]/60
                   placeholder:text-gray-600"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
          <input
            type="text" inputMode="numeric"
            value={costo ? parseInt(costo.replace(/\D/g,''), 10).toLocaleString('es-CO') : ''}
            onChange={e => setCosto(e.target.value.replace(/\D/g, ''))}
            placeholder="Costo por unidad"
            className="w-full bg-brand-navy border border-white/10 rounded-lg pl-6 pr-3 py-2.5
                       text-white text-sm focus:outline-none focus:border-[#EA580C]/60
                       placeholder:text-gray-600"
          />
        </div>
        <select
          value={unidad}
          onChange={e => setUnidad(e.target.value)}
          className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2.5
                     text-white text-sm focus:outline-none focus:border-[#EA580C]/60"
        >
          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div>
        <label className="text-[10px] text-gray-500 mb-1 block">Stock inicial</label>
        <input
          type="number" min="0" step="0.1"
          value={stock}
          onChange={e => setStock(e.target.value)}
          className="w-full bg-brand-navy border border-white/10 rounded-lg px-3 py-2
                     text-white text-sm focus:outline-none focus:border-[#EA580C]/60"
        />
      </div>

      <p className="text-[10px] text-gray-500">
        Podés editar más detalles desde <span className="text-[#EA580C]">Inventario → Materias Primas</span>.
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 py-2 text-xs rounded-lg border border-white/10 text-gray-400
                     hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={() => crear()}
          disabled={!nombre.trim() || isPending}
          className="flex-1 py-2 text-xs rounded-lg bg-[#EA580C] hover:bg-[#C2410C]
                     text-white font-bold transition-colors disabled:opacity-40">
          {isPending ? 'Creando…' : '✓ Crear y usar'}
        </button>
      </div>
    </div>
  )
}
