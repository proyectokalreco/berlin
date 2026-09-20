import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

// Aviso de versión nueva. La actualización NO se aplica sola: una recarga en medio de una venta
// o de un cobro sería un mal momento. El usuario decide cuándo (las ventas pendientes están
// guardadas en el equipo y sobreviven a la recarga).
const REVISAR_CADA_MS = 30 * 60 * 1000

export default function PwaUpdateBanner() {
  const {
    needRefresh: [necesitaActualizar, setNecesitaActualizar],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Buscar versiones nuevas de vez en cuando (el navegador solo lo hace al abrir la app)
      if (registro) setInterval(() => { void registro.update() }, REVISAR_CADA_MS)
    },
  })

  if (!necesitaActualizar) return null

  return (
    <div
      role="alert"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-amber-400/40 bg-[#1A120B] text-amber-100 text-sm"
    >
      <RefreshCw size={16} className="flex-shrink-0 text-amber-400" />
      <span className="flex-1">Hay una versión nueva de Berlín.</span>
      <button
        onClick={() => { void updateServiceWorker(true) }}
        className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400"
      >
        Actualizar
      </button>
      <button
        onClick={() => setNecesitaActualizar(false)}
        className="px-2 py-1.5 text-amber-200/70 hover:text-amber-100"
        aria-label="Después"
      >
        Después
      </button>
    </div>
  )
}
