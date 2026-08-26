import { NavLink, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Beer, BarChart2, Package, ShoppingCart,
  Banknote, PieChart, FlaskConical, BookOpen, LogOut, ClipboardList, Bell, LayoutGrid,
  Wifi, WifiOff,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'
import toast from 'react-hot-toast'

// ── Paleta Berlín Café Bar (tomada del logo) ───────────────────
const GOLD  = '#D9A652'
const GOLD_DK = '#A15F2F'
const BG_DARK = '#1A120B'

// ── Logo de Berlín Café Bar ─────────────────────────────
function BerlinLogo() {
  const [imgError, setImgError] = useState(false)
  if (!imgError) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}logos/berlin.png`}
        alt="Berlín Café Bar"
        onError={() => setImgError(true)}
        className="h-14 w-auto max-w-[220px] rounded-xl object-contain"
      />
    )
  }
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center"
      style={{ background: 'rgba(217,166,82,0.15)', border: '1px solid rgba(217,166,82,0.3)' }}
    >
      <Beer size={20} style={{ color: GOLD }} />
    </div>
  )
}

// ── Todos los tabs disponibles — app de un solo negocio, raíz ──
const ALL_TABS = [
  { to: '/',             end: true,  icon: BarChart2,     label: 'Dashboard'  },
  { to: '/caja',         end: false, icon: Banknote,      label: 'Caja'       },
  { to: '/pos',          end: false, icon: ShoppingCart,  label: 'POS'        },
  { to: '/mesas',        end: false, icon: LayoutGrid,    label: 'Mesas'      },
  { to: '/mojes',        end: false, icon: FlaskConical,  label: 'Producción' },
  { to: '/planilla',     end: false, icon: ClipboardList, label: 'Planilla'   },
  { to: '/inventario',   end: false, icon: Package,       label: 'Inventario' },
  { to: '/recetas',      end: false, icon: BookOpen,      label: 'Recetas'    },
  { to: '/reportes',     end: false, icon: PieChart,      label: 'Reportes'   },
]

// ── Tabs visibles según rol ────────────────────────────────────
function getTabsByRol(rol: string) {
  if (rol === 'panadero')
    return ALL_TABS.filter(t => ['Dashboard','Producción','Planilla','Inventario','Recetas'].includes(t.label))
  if (rol === 'cajero' || rol === 'vendedor')
    return ALL_TABS.filter(t => ['Dashboard','Caja','POS','Mesas'].includes(t.label))
  if (rol === 'mesero')
    return ALL_TABS.filter(t => ['Dashboard','Mesas','Inventario'].includes(t.label))
  return ALL_TABS // admin_berlin, super_admin
}

// ── Roles que reciben notificaciones de mesas ─────────────────
const ROLES_NOTIF = ['cajero', 'admin_berlin', 'super_admin', 'vendedor']

interface Notificacion {
  id: string; tipo: string; titulo: string; mensaje?: string
  datos: Record<string,unknown>; created_at: string
}

// ── Bell de notificaciones (solo para cajero/admin) ───────────
function NotifBell({ rol }: { rol: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: notifs = [] } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones-pendientes'],
    queryFn:  () => api.get('/berlin/notificaciones/pendientes').then(r => r.data),
    refetchInterval: 4_000,
    enabled: ROLES_NOTIF.includes(rol),
  })

  const { mutate: leerTodas } = useMutation({
    mutationFn: () => api.put('/berlin/notificaciones/leer-todas'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notificaciones-pendientes'] })
      toast.success('Notificaciones marcadas como leídas')
      setOpen(false)
    },
  })

  if (!ROLES_NOTIF.includes(rol)) return null

  const count = notifs.length

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        title="Notificaciones de mesas"
        className="relative p-2 rounded-xl transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
        style={{ color: count > 0 ? GOLD : 'rgba(255,255,255,0.45)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Bell size={18} className={count > 0 ? 'animate-pulse' : ''} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white
                           text-[9px] font-bold flex items-center justify-center leading-none"
                style={{ background: GOLD }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 bg-[#241811] rounded-2xl border border-white/10
                          shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-bold text-white">
                Pedidos de mesas {count > 0 && <span style={{ color: GOLD }}>({count})</span>}
              </p>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button onClick={() => leerTodas()}
                    className="text-[10px] text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
                    Marcar leído
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white rounded-lg hover:bg-white/5">
                  ×
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="py-8 text-center text-gray-600">
                  <Bell size={24} className="mx-auto mb-2 opacity-20"/>
                  <p className="text-xs">Sin notificaciones pendientes</p>
                </div>
              ) : (
                notifs.map(n => (
                  <div key={n.id} className="px-4 py-3 border-b border-white/5 hover:bg-white/3 transition-colors">
                    <p className="text-xs font-semibold text-white">{n.titulo}</p>
                    {n.mensaje && <p className="text-[11px] text-gray-400 mt-0.5">{n.mensaje}</p>}
                    <p className="text-[10px] text-gray-600 mt-1">
                      {new Date(n.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Shell principal — app de un solo negocio, sin Sidebar global ──
export default function BerlinShell() {
  const user            = useAuthStore(s => s.user)
  const { signOut }     = useAuth()
  const rol             = user?.rol ?? ''
  const tabs            = getTabsByRol(rol)

  const [isOnline, setIsOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  return (
    <div className="flex flex-col min-h-screen" style={{ background: BG_DARK }}>

      {/* ── Encabezado — sticky: siempre visible al hacer scroll ── */}
      <div
        className="px-4 sm:px-6 pt-4 pb-0 sticky top-0 z-30"
        style={{ background: BG_DARK, borderBottom: `1px solid ${GOLD}2e` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <BerlinLogo />

          <div className="flex-1 min-w-0">
            <h1
              className="leading-none"
              style={{
                fontFamily: "'Pacifico', cursive",
                fontSize: '1.25rem',
                color: GOLD,
                textShadow: '0 1px 4px rgba(0,0,0,0.35)',
              }}
            >
              Berlín Café Bar
            </h1>
            <p
              className="text-[11px] font-semibold tracking-[0.18em] uppercase mt-1"
              style={{ color: GOLD_DK }}
            >
              Restaurante &bull; Bar &bull; Cafetería
            </p>
          </div>

          {/* Usuario + Bell + Cerrar sesión */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
                style={{ background: 'rgba(217,166,82,0.22)', color: GOLD }}
              >
                {user?.nombre?.[0]}{user?.apellido?.[0]}
              </div>
              <span className="text-xs max-w-[90px] truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {user?.nombre}
              </span>
            </div>
            {/* Indicador de red */}
            <div
              title={isOnline ? 'En línea' : 'Sin conexión — las ventas se guardan en cola'}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border select-none',
                isOnline
                  ? 'text-green-400 border-green-500/25 bg-green-500/10'
                  : 'text-red-400 border-red-500/25 bg-red-500/10 animate-pulse',
              )}
            >
              {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
              <span className="hidden sm:inline">{isOnline ? 'En línea' : 'Sin conexión'}</span>
            </div>

            <NotifBell rol={rol} />
            <button
              onClick={() => signOut()}
              title="Cerrar sesión"
              className="p-2 rounded-xl text-gray-500 hover:text-red-400
                         hover:bg-red-500/10 transition-colors min-h-[36px] min-w-[36px]
                         flex items-center justify-center"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* ── Tabs de navegación — scrollables con el dedo ── */}
        <nav className="flex gap-1 -mb-px overflow-x-auto"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {tabs.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => isActive
                ? { color: GOLD, background: 'rgba(217,166,82,0.08)', borderColor: GOLD }
                : undefined}
              className={({ isActive }) => cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-lg border-b-2',
                'transition-colors whitespace-nowrap flex-shrink-0',
                isActive ? '' : 'text-white/50 border-transparent hover:text-white hover:bg-white/5'
              )}
            >
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ── Contenido de la sección activa ── */}
      <div className="flex-1 p-4 sm:p-6">
        <Outlet />
      </div>
    </div>
  )
}
