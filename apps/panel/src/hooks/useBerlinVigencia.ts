import { useMemo } from 'react'
import { useAuthStore } from '../store/authStore'

const NON_ADMIN = ['cajero', 'vendedor', 'mesero', 'panadero']

export function useBerlinVigencia() {
  const user = useAuthStore(s => s.user)
  return useMemo(() => {
    if (NON_ADMIN.includes(user?.rol ?? '')) return null
    if ((user as any)?.negocio?.slug === 'demo') return null
    const vigente_hasta = (user as any)?.vigente_hasta as string | null | undefined
    if (!vigente_hasta) return null
    const hasta = new Date(vigente_hasta + 'T12:00:00')
    const dias = Math.floor((hasta.getTime() - Date.now()) / 86400000)
    const fechaStr = hasta.toLocaleDateString('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric',
      timeZone: 'America/Bogota'
    })
    if (dias < 0) return { texto: `Vencido · ${fechaStr}`, color: 'red' as const }
    if (dias <= 30) return { texto: `${dias}d · ${fechaStr}`, color: 'yellow' as const }
    return { texto: `${dias}d · ${fechaStr}`, color: 'green' as const }
  }, [user])
}
