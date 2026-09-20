import { QueryClient } from '@tanstack/react-query'

// Cliente de React Query único de la app (lo comparten main.tsx —que restaura la copia guardada
// antes de pintar— y App.tsx).
export const queryClient = new QueryClient({
  defaultOptions: {
    // 'offlineFirst': la primera petición sale aunque el navegador crea que no hay red (así falla
    // rápido y entran en juego las copias locales) y solo se pausan los reintentos.
    // gcTime 24 h: los datos se conservan en memoria (y se guardan en el equipo, ver cacheLocal.ts)
    // para poder mostrarlos sin conexión.
    queries: { retry: 1, staleTime: 60_000, gcTime: 24 * 60 * 60 * 1000, networkMode: 'offlineFirst' },
    // 'always': con el navegador "sin red" React Query pausaría la mutación para siempre (el cajero
    // vería "Procesando…" indefinido). Así la mutación se ejecuta, falla rápido y la venta pasa a
    // la cola local (ver lib/offline.ts).
    mutations: { networkMode: 'always' },
  },
})
