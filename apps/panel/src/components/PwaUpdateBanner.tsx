import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

// Aviso de versión nueva. La actualización NO se aplica sola: una recarga en medio de una venta
// o de un cobro sería un mal momento. El usuario decide cuándo (las ventas pendientes están
// guardadas en el equipo y sobreviven a la recarga).
const REVISAR_CADA_MS = 30 * 60 * 1000
// Si el Service Worker nuevo no toma el control en este tiempo, se pasa al plan B
const ESPERA_PLAN_B_MS = 2_500

// Aplica la versión nueva SIN depender de que el flujo interno del plugin complete el cambio
// (en algunos equipos el botón "no hacía nada" y la app seguía en la versión vieja).
//  1) Le pide al Service Worker nuevo que tome el control y recarga cuando lo hace.
//  2) Plan B, si en ESPERA_PLAN_B_MS no ocurrió: desregistra el Service Worker, borra sus cachés de
//     archivos y recarga. La app vuelve a bajarse completa del servidor y registra el nuevo.
// No toca localStorage ni IndexedDB: la sesión, las ventas y cobros pendientes y la copia local de
// datos se conservan.
async function aplicarActualizacion(): Promise<void> {
  let recargado = false
  const recargar = () => { if (!recargado) { recargado = true; window.location.reload() } }

  try {
    if (!('serviceWorker' in navigator)) { recargar(); return }
    navigator.serviceWorker.addEventListener('controllerchange', recargar)
    const registro = await navigator.serviceWorker.getRegistration()
    registro?.waiting?.postMessage({ type: 'SKIP_WAITING' })

    window.setTimeout(async () => {
      if (recargado) return
      try {
        const registros = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registros.map(r => r.unregister()))
        if ('caches' in window) {
          const nombres = await caches.keys()
          await Promise.all(nombres.map(n => caches.delete(n)))
        }
      } catch (e) {
        console.error('[pwa] plan B de actualización', e)
      }
      recargar()
    }, ESPERA_PLAN_B_MS)
  } catch (e) {
    console.error('[pwa] no se pudo pedir la actualización', e)
    recargar()
  }
}

export default function PwaUpdateBanner() {
  const [actualizando, setActualizando] = useState(false)
  const {
    needRefresh: [necesitaActualizar, setNecesitaActualizar],
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
      <RefreshCw size={16} className={`flex-shrink-0 text-amber-400 ${actualizando ? 'animate-spin' : ''}`} />
      <span className="flex-1">
        {actualizando ? 'Actualizando Berlín…' : 'Hay una versión nueva de Berlín.'}
      </span>
      {!actualizando && (
        <>
          <button
            onClick={() => { setActualizando(true); void aplicarActualizacion() }}
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
        </>
      )}
    </div>
  )
}
