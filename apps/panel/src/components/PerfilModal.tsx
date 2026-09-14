import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, Eye, EyeOff, KeyRound, User } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'

// Mi Perfil — cada usuario edita su propio nombre/apellido/correo/username y
// contraseña. Se abre desde el avatar del header (BerlinShell.tsx). Backend:
// PUT /api/auth/perfil (auth/routes.js) — ya existía para nombre/apellido/
// email/password, se le agregó soporte de username (migración 098).
export default function PerfilModal({ onClose }: { onClose: () => void }) {
  const user    = useAuthStore(s => s.user)
  const setUser = useAuthStore(s => s.setUser)

  const [nombre,   setNombre]   = useState(user?.nombre ?? '')
  const [apellido, setApellido] = useState(user?.apellido ?? '')
  const [email,    setEmail]    = useState(user?.email ?? '')
  const [username, setUsername] = useState(user?.username ?? '')

  const [cambiarPass, setCambiarPass]     = useState(false)
  const [passActual,  setPassActual]      = useState('')
  const [passNueva,   setPassNueva]       = useState('')
  const [passConfirmar, setPassConfirmar] = useState('')
  const [showActual,  setShowActual]      = useState(false)
  const [showNueva,   setShowNueva]       = useState(false)

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: () => api.put('/auth/perfil', {
      nombre:  nombre.trim(),
      apellido: apellido.trim(),
      email:    email.trim(),
      username: username.trim() || null,
      ...(cambiarPass && passNueva ? {
        password_actual: passActual,
        password_nueva:  passNueva,
      } : {}),
    }),
    onSuccess: (res) => {
      if (user) setUser({ ...user, ...res.data.user })
      toast.success('Perfil actualizado ✅')
      onClose()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Error al actualizar perfil'),
  })

  const passwordValida = !cambiarPass || !passNueva ||
    (passActual.length > 0 && passNueva.length >= 6 && passNueva === passConfirmar)

  const puedeGuardar = nombre.trim().length > 0 && passwordValida &&
    (!cambiarPass || !passNueva || (passActual && passNueva.length >= 6 && passNueva === passConfirmar))

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white font-bold flex items-center gap-2">
            <User size={16} className="text-brand-teal" /> Mi Perfil
          </h3>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Nombre *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Apellido</label>
              <input value={apellido} onChange={e => setApellido(e.target.value)}
                className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="off"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                         focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Usuario (opcional, para entrar sin correo)</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value.trim())}
              placeholder="ej. cajero1"
              autoComplete="off"
              className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                         focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
          </div>

          <div className="border border-teal-500/20 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setCambiarPass(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-teal-500/5">
              <span className="text-sm text-teal-300 font-semibold flex items-center gap-2">
                <KeyRound size={13} /> Cambiar contraseña
              </span>
              <span className="text-[10px] text-gray-500">{cambiarPass ? 'Cancelar' : 'Editar'}</span>
            </button>

            {cambiarPass && (
              <div className="p-4 space-y-3 bg-brand-dark/30">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Contraseña actual</label>
                  <div className="relative">
                    <input type={showActual ? 'text' : 'password'} value={passActual}
                      onChange={e => setPassActual(e.target.value)}
                      autoComplete="current-password"
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white
                                 focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
                    <button type="button" onClick={() => setShowActual(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showActual ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Contraseña nueva (mínimo 6 caracteres)</label>
                  <div className="relative">
                    <input type={showNueva ? 'text' : 'password'} value={passNueva}
                      onChange={e => setPassNueva(e.target.value)}
                      autoComplete="new-password"
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white
                                 focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
                    <button type="button" onClick={() => setShowNueva(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showNueva ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Confirmar contraseña nueva</label>
                  <input type={showNueva ? 'text' : 'password'} value={passConfirmar}
                    onChange={e => setPassConfirmar(e.target.value)}
                    autoComplete="new-password"
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                               focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
                  {passNueva && passConfirmar && passNueva !== passConfirmar && (
                    <p className="text-[10px] text-red-400 mt-1">Las contraseñas no coinciden</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 text-sm min-h-[48px]">
            Cancelar
          </button>
          <button disabled={!puedeGuardar || isPending} onClick={() => guardar()}
            className="flex-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold
                       text-sm transition-colors disabled:opacity-40 min-h-[48px]">
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
