import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { queryClient } from './lib/queryClient'
import { restaurarCache, iniciarPersistenciaCache } from './lib/cacheLocal'

// Se restaura la copia local de datos ANTES de pintar: así, si la app abre sin internet (cierre
// brusco del navegador o del equipo con la red caída) ya tiene turno de caja, mesas y catálogo.
async function arrancar() {
  await restaurarCache(queryClient)
  iniciarPersistenciaCache(queryClient)
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
void arrancar()
