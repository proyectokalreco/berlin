import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { hayInternet } from '../lib/conexion'
import { borrarCacheLocal } from '../lib/cacheLocal'
import { useAuthStore } from '../store/authStore'
import type { LoginResponse } from '../types'

// App dedicada a un solo negocio (Berlín) — no hay logins branded
// múltiples que elegir, siempre login/logout van a '/login'.
export function useAuth() {
  const queryClient  = useQueryClient()
  const { user, isAuthenticated, refreshToken, login } = useAuthStore()

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
      login(data.user, data.tokens.accessToken, data.tokens.refreshToken)
      return data
    },
    [login]
  )

  const signOut = useCallback(async () => {
    // Bloquear logout sin conexión — evita quedar atrapado en login sin internet
    if (!navigator.onLine || !hayInternet()) {
      toast.error(
        'Sin conexión a internet. Para salir temporalmente cierra el navegador.\nCierra sesión cuando tengas internet.',
        { duration: 6000, id: 'offline-logout' }
      )
      return
    }

    try {
      await api.post('/auth/logout', { refreshToken })
    } catch { /* ignora errores de red */ }

    queryClient.clear()
    await borrarCacheLocal()   // la copia de datos de este usuario no debe quedar en el equipo
    // Limpiar localStorage sin pasar por Zustand (evita re-render → flash de ruta protegida)
    localStorage.removeItem('berlin-auth')
    window.location.href = '/login'
  }, [refreshToken, queryClient])

  return { user, isAuthenticated, signIn, signOut }
}
