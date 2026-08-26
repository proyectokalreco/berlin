import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// App de un solo negocio — sin sesión activa, siempre a /login.
export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
