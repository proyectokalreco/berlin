import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { Lock, Mail, Eye, EyeOff, Beer } from 'lucide-react'

// Colores corporativos de Berlín Café Bar (tomados del logo)
const GOLD      = '#D9A652'
const GOLD_DARK = '#A15F2F'
const GOLD_RING = '#D9A65233'
const WOOD      = '#4A2C17'

export default function Login() {
  const navigate    = useNavigate()
  const { signIn }  = useAuth()
  const user        = useAuthStore(s => s.user)

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [loading,      setLoading]      = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [imgError,     setImgError]     = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // El autocompletado del navegador rellena los inputs SIN disparar onChange,
    // dejando el estado de React desactualizado — leemos del formulario real.
    const fd       = new FormData(e.currentTarget)
    const emailEnv = String(fd.get('email') ?? '').trim() || email
    const passEnv  = String(fd.get('password') ?? '')     || password

    setLoading(true)
    try {
      const data = await signIn(emailEnv, passEnv)
      toast.success(`¡Bienvenido/a, ${data.user.nombre}!`)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Correo o contraseña incorrectos'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#0F0A06' }}>

      <div
        className="absolute top-0 left-0 w-full h-1.5 pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD_DARK}, ${GOLD})` }}
      />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[420px] h-[420px] rounded-full" style={{ background: `${GOLD}0D` }} />
        <div className="absolute -bottom-40 -left-40 w-[420px] h-[420px] rounded-full" style={{ background: `${WOOD}20` }} />
      </div>

      <div className="relative w-full max-w-md">

        <div className="text-center mb-8 select-none">
          {!imgError ? (
            <img
              src={`${import.meta.env.BASE_URL}logos/berlin.png`}
              alt="Berlín Café Bar"
              onError={() => setImgError(true)}
              className="h-28 w-auto mx-auto mb-5 object-contain drop-shadow-xl"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl shadow-lg"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})` }}
            >
              <Beer size={36} color="#1A120B" />
            </div>
          )}
          <h1
            className="leading-tight"
            style={{
              fontFamily: "'Pacifico', cursive",
              fontSize: '2rem',
              color: GOLD,
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            Berlín Café Bar
          </h1>
          <p
            className="text-xs font-bold mt-2 tracking-[0.22em] uppercase"
            style={{ color: GOLD_DARK }}
          >
            Restaurante &bull; Bar &bull; Cafetería
          </p>
        </div>

        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: '#2B1D14', border: `1px solid ${GOLD}22` }}
        >
          <h2 className="text-xl font-semibold text-white mb-6">Iniciar sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="admin.berlin@kalreco.com"
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-white
                             placeholder-gray-600 transition-all outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)' }}
                  onFocus={e => {
                    e.currentTarget.style.border = `1.5px solid ${GOLD}`
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${GOLD_RING}`
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1.5px solid rgba(255,255,255,0.1)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl pl-10 pr-10 py-3 text-white
                             placeholder-gray-600 transition-all outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)' }}
                  onFocus={e => {
                    e.currentTarget.style.border = `1.5px solid ${GOLD}`
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${GOLD_RING}`
                  }}
                  onBlur={e => {
                    e.currentTarget.style.border = '1.5px solid rgba(255,255,255,0.1)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold rounded-xl py-3.5 text-base
                         transition-all duration-150 mt-2
                         active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed select-none"
              style={{
                background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_DARK} 100%)`,
                color: '#1A120B',
                boxShadow: `0 4px 22px ${GOLD}40`,
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Ingresando…
                </span>
              ) : 'Iniciar sesión'}
            </button>

          </form>

          <div className="mt-6 text-center space-y-3">
            {/* <a> plano, no <Link> de React Router: la landing vive fuera
                del basename "/login" de este SPA, en otro contenedor. */}
            <a
              href="/"
              className="inline-block text-xs font-semibold"
              style={{ color: GOLD }}
            >
              ← Ir a la página principal
            </a>
            <p className="text-xs text-gray-600">
              Grupo DK Soluciones · Plataforma Kalreco v1.0
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
