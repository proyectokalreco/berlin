import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// VITE_API_URL definido en .env (default: /api -> nginx proxya al backend)
const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request: adjunta access token ─────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: 401 → intenta refresh, luego logout ─────────
let isRefreshing = false
let failedQueue: Array<{
  resolve: (t: string) => void
  reject:  (e: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token!)
  )
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const orig = error.config
    if (error.response?.status !== 401 || orig._retry) return Promise.reject(error)

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        orig.headers.Authorization = `Bearer ${token}`
        return api(orig)
      })
    }

    orig._retry   = true
    isRefreshing  = true

    const refreshToken = useAuthStore.getState().refreshToken
    if (!refreshToken) {
      useAuthStore.getState().logout()
      return Promise.reject(error)
    }

    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken })
      const newToken: string = data.accessToken
      useAuthStore.getState().setAccessToken(newToken)
      processQueue(null, newToken)
      orig.headers.Authorization = `Bearer ${newToken}`
      return api(orig)
    } catch (err) {
      processQueue(err, null)
      // Solo cerrar sesión si el servidor rechazó el token (4xx), no por error de red offline
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      if (status && status >= 400 && status < 500) {
        useAuthStore.getState().logout()
      }
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)