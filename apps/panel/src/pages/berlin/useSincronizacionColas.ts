import { useEffect } from 'react'
import { sincronizarColaPos } from './pos/useOfflineQueue'
import { sincronizarCobrosMesas } from './mesas/useOfflineMesasCobro'
import { sincronizarOpsMesas } from './mesas/useOutboxMesas'
import { SYNC_INTERVALO_MS, pedirAlmacenamientoPersistente } from '../../lib/offline'
import { EVT_CONEXION, hayInternet, iniciarSondeoConexion } from '../../lib/conexion'
import { queryClient } from '../../lib/queryClient'
import { api } from '../../lib/api'
import { fallbackSiNoRed } from '../../lib/offline'
import { precargarCatalogoPos } from './pos/useProductosConSnapshot'

// Datos que hacen falta para ARRANCAR sin conexión (turno de caja, mesas, catálogo). Se traen en
// segundo plano desde cualquier pantalla, con las MISMAS claves que usan POS y Mesas: así la copia
// local existe aunque este equipo nunca haya abierto esas pantallas con internet (sin esto, el
// POS quedaba en "Bloqueado" al reiniciar sin conexión).
const PRECARGA_CADA_MS = 5 * 60 * 1000
function precargarBasicos() {
  const q = (queryKey: string[], queryFn: () => Promise<unknown>) => { void queryClient.prefetchQuery({ queryKey, queryFn, staleTime: 4 * 60 * 1000 }) }
  q(['turno-activo-pos'],     () => api.get('/berlin/caja/turno-activo').then(r => r.data ?? null))
  q(['turno-activo-mesas'],   () => api.get('/berlin/caja/turno-activo').then(r => r.data).catch(fallbackSiNoRed(null)))
  q(['turno-negocio-activo'], () => api.get('/berlin/caja/turno-negocio-activo').then(r => r.data).catch(fallbackSiNoRed(null)))
  q(['mesas'],                () => api.get('/berlin/mesas').then(r => r.data))
  q(['productos-mesa'],       () => api.get('/berlin/productos', { params: { limit: 1000 } }).then(r => r.data))
  q(['categorias'],           () => api.get('/berlin/categorias').then(r => r.data))
  void precargarCatalogoPos()
}

// Sincroniza en segundo plano las colas de ventas (POS), operaciones de mesas y cobros de mesa guardados sin conexión,
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
      // Operaciones de mesas primero (los cobros de mesa esperan a las de su cuenta)
      void sincronizarOpsMesas().then(() => sincronizarCobrosMesas())
    }
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }

    intentar()
    const id = window.setInterval(intentar, SYNC_INTERVALO_MS)
    window.addEventListener(EVT_CONEXION, intentar)
    document.addEventListener('visibilitychange', alVolver)
    // Precarga de lo básico: al abrir, al volver la conexión y cada 5 min (no en cada ciclo de 20 s)
    const precargar = () => { if (hayInternet()) precargarBasicos() }
    precargar()
    const idPrecarga = window.setInterval(precargar, PRECARGA_CADA_MS)
    window.addEventListener(EVT_CONEXION, precargar)
    return () => {
      window.clearInterval(id)
      window.clearInterval(idPrecarga)
      window.removeEventListener(EVT_CONEXION, precargar)
      window.removeEventListener(EVT_CONEXION, intentar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
}
