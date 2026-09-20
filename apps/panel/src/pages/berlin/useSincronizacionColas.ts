import { useEffect } from 'react'
import { sincronizarColaPos } from './pos/useOfflineQueue'
import { sincronizarCobrosMesas } from './mesas/useOfflineMesasCobro'
import { SYNC_INTERVALO_MS, pedirAlmacenamientoPersistente } from '../../lib/offline'
import { EVT_CONEXION, hayInternet, iniciarSondeoConexion } from '../../lib/conexion'

// Sincroniza en segundo plano las colas de ventas (POS) y cobros de mesa guardados sin conexión,
// desde CUALQUIER pantalla del panel (el cajero puede estar en Caja o Mesas cuando vuelve internet).
// Hook puro (solo useEffect): es seguro dentro del shell/layout.
//
// Cuándo se intenta:
//  - al abrir la app: recupera lo que quedó pendiente tras un cierre brusco del navegador o del equipo
//  - en cuanto el sondeo detecta que el servidor volvió a responder (cubre el Wi-Fi conectado SIN
//    internet, donde el navegador nunca dispara "online")
//  - al volver a la pestaña o a la app (visibilitychange)
//  - cada SYNC_INTERVALO_MS mientras haya conexión (red de seguridad)
// Mientras el servidor no responde no se intenta (evita esperas inútiles de 15 s y parpadeos del
// aviso de "sincronizando"). Cada sincronización sale rápido si no hay nada pendiente.
export function useSincronizacionColas(): void {
  useEffect(() => {
    pedirAlmacenamientoPersistente()
    iniciarSondeoConexion()

    const intentar = () => {
      if (!hayInternet()) return
      void sincronizarColaPos()
      void sincronizarCobrosMesas()
    }
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }

    intentar()
    const id = window.setInterval(intentar, SYNC_INTERVALO_MS)
    window.addEventListener(EVT_CONEXION, intentar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.clearInterval(id)
      window.removeEventListener(EVT_CONEXION, intentar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
}
