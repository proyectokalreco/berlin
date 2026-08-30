import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'

// Berlín — app de un solo negocio, shell + páginas en la raíz
import BerlinShell      from './pages/berlin/BerlinShell'
import BerlinDashboard  from './pages/berlin/BerlinDashboard'
import CajaPage         from './pages/berlin/caja/CajaPage'
import POS              from './pages/berlin/pos/POS'
import MesasPage        from './pages/berlin/mesas/MesasPage'
import MojesPage        from './pages/berlin/produccion/MojesPage'
import RegistroMoje     from './pages/berlin/produccion/RegistroMoje'
import PlanillaPage     from './pages/berlin/produccion/PlanillaPage'
import MermasPage       from './pages/berlin/produccion/MermasPage'
import MateriasPrimas   from './pages/berlin/inventario/MateriasPrimas'
import EtiquetasPage    from './pages/berlin/inventario/EtiquetasPage'
import RecetasPage      from './pages/berlin/recetas/RecetasPage'
import ProveedoresPage  from './pages/berlin/proveedores/ProveedoresPage'
import FacturacionPage  from './pages/berlin/facturacion/FacturacionPage'
import ClientesPage     from './pages/berlin/clientes/ClientesPage'
import EmpleadosPage    from './pages/berlin/empleados/EmpleadosPage'
import GastosPage       from './pages/berlin/gastos/GastosPage'
import MovimientosPage  from './pages/berlin/movimientos/MovimientosPage'
import ReportesPage     from './pages/berlin/reportes/ReportesPage'
import CuentasPorPagarPage  from './pages/berlin/cuentas/CuentasPorPagarPage'
import CuentasPorCobrarPage from './pages/berlin/cuentas/CuentasPorCobrarPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
  },
})

// Con basename="/login", una ruta "/login" aparte quedaba en /login/login
// (el basename ya aporta ese prefijo). Login vive en la raíz del router:
// se muestra si no hay sesión, o el Shell si la hay — mismo candado que
// antes daba PrivateRoute, sin sumar el prefijo dos veces.
function RootGate() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  return isAuthenticated ? <BerlinShell /> : <Login />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/login">
        <Routes>
          <Route path="/" element={<RootGate />}>
            <Route index                  element={<BerlinDashboard />} />
            <Route path="caja"            element={<CajaPage />} />
            <Route path="pos"             element={<POS />} />
            <Route path="mesas"           element={<MesasPage />} />
            <Route path="inventario"      element={<MateriasPrimas />} />
            <Route path="etiquetas"       element={<EtiquetasPage />} />
            <Route path="mojes"           element={<MojesPage />} />
            <Route path="mojes/nuevo"     element={<RegistroMoje />} />
            <Route path="planilla"        element={<PlanillaPage />} />
            <Route path="mermas"          element={<MermasPage />} />
            <Route path="recetas"         element={<RecetasPage />} />
            <Route path="proveedores"     element={<ProveedoresPage />} />
            <Route path="facturacion"     element={<FacturacionPage />} />
            <Route path="clientes"        element={<ClientesPage />} />
            <Route path="empleados"       element={<EmpleadosPage />} />
            <Route path="gastos"          element={<GastosPage />} />
            <Route path="movimientos"     element={<MovimientosPage />} />
            <Route path="reportes"        element={<ReportesPage />} />
            <Route path="cuentas-pagar"   element={<CuentasPorPagarPage />} />
            <Route path="cuentas-cobrar"  element={<CuentasPorCobrarPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#241811',
            color: '#fff',
            border: '1px solid rgba(217,166,82,0.15)',
          },
          success: { iconTheme: { primary: '#D9A652', secondary: '#241811' } },
          error:   { iconTheme: { primary: '#FF6B35', secondary: '#241811' } },
        }}
      />
    </QueryClientProvider>
  )
}
