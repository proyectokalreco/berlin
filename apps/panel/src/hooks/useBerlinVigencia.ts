import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'

const NON_ADMIN = ['cajero', 'vendedor', 'mesero', 'panadero']

// El panel no vuelve a pedir /auth/me tras el login, así que vigente_hasta se consulta aquí.
export function useBerlinVigencia() {
  const user = useAuthStore(s => s.user)
  const [info, setInfo] = useState<{ vigente_hasta: string | null; slug: string | null } | null>(null)

  useEffect(() => {
    if (!user?.id || NON_ADMIN.includes(user.rol ?? '')) return
    let vivo = true
    api.get('/auth/me')
      .then(({ data }) => {
        if (vivo) setInfo({ vigente_hasta: data?.user?.vigente_hasta ?? null, slug: data?.user?.negocio?.slug ?? null })
      })
      .catch(() => { /* sin red: no se muestra el badge */ })
    return () => { vivo = false }
  }, [user?.id, user?.rol])

  return useMemo(() => {
    if (!info?.vigente_hasta) return null
    if (NON_ADMIN.includes(user?.rol ?? '')) return null
    if (info.slug === 'demo') return null
    const hasta = new Date(info.vigente_hasta + 'T12:00:00')
    const dias = Math.floor((hasta.getTime() - Date.now()) / 86400000)
    const fechaStr = hasta.toLocaleDateString('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric',
      timeZone: 'America/Bogota'
    })
    if (dias < 0) return { texto: `Vencido · ${fechaStr}`, color: 'red' as const }
    if (dias <= 30) return { texto: `${dias}d · ${fechaStr}`, color: 'yellow' as const }
    return { texto: `${dias}d · ${fechaStr}`, color: 'green' as const }
  }, [info, user?.rol])
}
