import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import type { Producto, Categoria } from '../../../types'

const SNAP_PRODUCTOS  = 'pos_berlin_snap_productos'
const SNAP_CATEGORIAS = 'pos_berlin_snap_categorias'

function saveSnap(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch { /* cuota llena */ }
}

function loadSnap<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return (JSON.parse(raw) as { data: T }).data
  } catch { return null }
}

export function useProductosConSnapshot() {
  const { data: productos = [], isLoading: loadingProductos } = useQuery<Producto[]>({
    queryKey: ['productos-pos'],
    queryFn: async () => {
      try {
        const res = await api.get('/berlin/productos')
        const lista = (res.data as Producto[]).filter(p => p.disponible && p.activo)
        saveSnap(SNAP_PRODUCTOS, lista)
        return lista
      } catch (err) {
        // Sin red → intentar snapshot
        const snap = loadSnap<Producto[]>(SNAP_PRODUCTOS)
        if (snap) return snap
        throw err
      }
    },
    refetchInterval: 15_000,
    // Mantener datos anteriores mientras se refetch (no parpadea a vacío)
    placeholderData: (prev) => prev ?? loadSnap<Producto[]>(SNAP_PRODUCTOS) ?? [],
  })

  const { data: categorias = [], isLoading: loadingCategorias } = useQuery<Categoria[]>({
    queryKey: ['categorias-pos'],
    queryFn: async () => {
      try {
        const res = await api.get('/berlin/categorias')
        saveSnap(SNAP_CATEGORIAS, res.data)
        return res.data as Categoria[]
      } catch {
        return loadSnap<Categoria[]>(SNAP_CATEGORIAS) ?? []
      }
    },
    staleTime: 300_000,
    placeholderData: (prev) => prev ?? loadSnap<Categoria[]>(SNAP_CATEGORIAS) ?? [],
  })

  const isLoading = loadingProductos && !loadSnap(SNAP_PRODUCTOS)

  return { productos, categorias, isLoading }
}
