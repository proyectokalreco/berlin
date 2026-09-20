import { useEffect } from 'react'
import { sincronizarColaPos } from './pos/useOfflineQueue'
import { sincronizarCobrosMesas } from './mesas/useOfflineMesasCobro'
import { SYNC_INTERVALO_MS, pedirAlmacenamientoPersistente } from '../../lib/offline'

// Sincroniza en segundo plano las colas de ventas (POS) y cobros de mesa guardados sin conexión,
// desde CUALQUIER pantalla del panel (el cajero puede estar en Caja o Mesas cuando vuelve internet).
// Hook puro (solo useEffect): es seguro dentro del shell/layout.
//
// Cuándo se intenta:
//  · al abrir la app — recupera lo que quedó pendiente tras un cierre brusco del navegador o del equipo
//  · al volver internet (evento "online")
//  · al volver a la pestaña o a la app (visibilitychange)
//  · cada SYNC_INTERVALO_MS — cubre el Wi-Fi conectado SIN internet, donde el navegador nunca
//    dispara "online" aunque el servicio vuelva
// Cada sincronización sale rápido si no hay nada pendiente (lee localStorage y termina).
export function useSincronizacionColas(): void {
  useEffect(() => {
    pedirAlmacenamientoPersistente()

    const intentar = () => {
      void sincronizarColaPos()
      void sincronizarCobrosMesas()
    }
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }

    intentar()
    const id = window.setInterval(intentar, SYNC_INTERVALO_MS)
    window.addEventListener('online', intentar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('online', intentar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
}
