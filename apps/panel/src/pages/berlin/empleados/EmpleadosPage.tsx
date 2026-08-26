import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import toast from 'react-hot-toast'
import { UserCheck, Plus, X, Phone, Edit2, ShieldCheck, Eye, EyeOff, KeyRound, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useAuthStore } from '../../../store/authStore'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

const CARGOS = [
  { value: 'panadero',       label: 'Panadero',       color: '#F97316', rol: 'panadero'        },
  { value: 'cajero',         label: 'Cajero',          color: '#22C55E', rol: 'cajero'           },
  { value: 'vendedor',       label: 'Vendedor',        color: '#3B82F6', rol: 'vendedor'         },
  { value: 'domicilios',     label: 'Domicilios',      color: '#A855F7', rol: 'domiciliario'     },
  { value: 'administrativo', label: 'Administrativo',  color: '#EAB308', rol: 'admin_berlin'  },
  { value: 'mesero',         label: 'Mesero',          color: '#06B6D4', rol: 'mesero'           },
  { value: 'otro',           label: 'Otro',            color: '#6B7280', rol: 'vendedor'         },
]

const EMPTY = {
  nombre: '', apellido: '', cedula: '', cargo: 'vendedor',
  salario: '', fecha_ingreso: '', telefono: '', email: '', notas: '',
  crear_usuario: false, usuario_email: '', usuario_password: '', nueva_password: '',
}

interface UsuarioVinculado { id: string; email: string; rol: string; activo: boolean }
interface Empleado {
  id: string; nombre: string; apellido?: string; cedula?: string
  cargo: string; salario?: number; fecha_ingreso?: string
  telefono?: string; email?: string; activo: boolean
  usuario_id?: string | null
  usuario?: UsuarioVinculado | null
}

export default function EmpleadosPage() {
  const qc       = useQueryClient()
  const authUser = useAuthStore(s => s.user)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<Empleado | null>(null)
  const [form, setForm]           = useState(EMPTY)
  const [showPass, setShowPass]   = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<Empleado | null>(null)

  const { data: empleados = [], isLoading } = useQuery<Empleado[]>({
    queryKey: ['empleados'],
    queryFn:  () => api.get('/berlin/empleados').then(r => r.data),
  })

  const { mutate: eliminarEmpleado, isPending: eliminando } = useMutation({
    mutationFn: (id: string) => api.delete(`/berlin/empleados/${id}`),
    onSuccess: (_, id) => {
      toast.success('Empleado eliminado correctamente')
      setConfirmEliminar(null)
      qc.invalidateQueries({ queryKey: ['empleados'] })
      // Si el empleado eliminado tenía usuario vinculado, refrescar lista de usuarios
      qc.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Error al eliminar'),
  })

  const { mutate: guardar, isPending } = useMutation({
    mutationFn: () => {
      const payload = {
        nombre:           form.nombre,
        apellido:         form.apellido,
        cedula:           form.cedula,
        cargo:            form.cargo,
        salario:          parseFloat(form.salario) || 0,
        fecha_ingreso:    form.fecha_ingreso,
        telefono:         form.telefono,
        email:            form.email,
        notas:            form.notas,
        ...(editando
          ? { nueva_password: form.nueva_password || undefined }
          : {
              crear_usuario:    form.crear_usuario,
              usuario_email:    form.crear_usuario ? form.usuario_email : undefined,
              usuario_password: form.crear_usuario ? form.usuario_password : undefined,
            }
        ),
      }
      return editando
        ? api.put(`/berlin/empleados/${editando.id}`, payload)
        : api.post('/berlin/empleados', payload)
    },
    onSuccess: () => {
      toast.success(editando ? 'Empleado actualizado' : 'Empleado creado')
      qc.invalidateQueries({ queryKey: ['empleados'] })
      cerrarModal()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Error al guardar'),
  })

  const cerrarModal = () => { setShowModal(false); setEditando(null); setForm(EMPTY) }

  const abrirEditar = (e: Empleado) => {
    setEditando(e)
    setForm({
      nombre: e.nombre, apellido: e.apellido ?? '', cedula: e.cedula ?? '',
      cargo: e.cargo, salario: e.salario?.toString() ?? '',
      fecha_ingreso: e.fecha_ingreso ?? '', telefono: e.telefono ?? '',
      email: e.email ?? '', notas: '',
      crear_usuario: false,
      usuario_email: e.usuario?.email ?? '',
      usuario_password: '', nueva_password: '',
    })
    setShowModal(true)
  }

  const cargoInfo = (v: string) => CARGOS.find(c => c.value === v) ?? CARGOS[6]
  const cargoActual = CARGOS.find(c => c.value === form.cargo) ?? CARGOS[6]
  const canCrearUsuario = authUser?.rol === 'super_admin' || authUser?.rol === 'admin_berlin'
  const canEliminar     = authUser?.rol === 'super_admin' || authUser?.rol === 'admin_berlin'

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <UserCheck size={20} className="text-teal-400" />
          <h2 className="text-lg font-bold text-white">Empleados</h2>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400
                     border border-teal-500/30 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium min-h-[44px]">
          <Plus size={16} /> Nuevo empleado
        </button>
      </div>

      {/* KPI */}
      <div className="bg-brand-navy rounded-xl border border-white/5 p-4 flex items-center gap-3">
        <UserCheck size={20} className="text-teal-400" />
        <div>
          <p className="text-[11px] text-gray-500">Total empleados activos</p>
          <p className="text-xl font-bold text-white">{empleados.filter(e => e.activo).length}</p>
        </div>
        <div className="ml-auto flex flex-col items-end">
          <p className="text-[11px] text-gray-500">Con acceso al sistema</p>
          <p className="text-xl font-bold text-teal-400">{empleados.filter(e => e.usuario_id).length}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-600"><p className="text-sm">Cargando…</p></div>
        ) : empleados.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
            <UserCheck size={36} className="opacity-20" />
            <p className="text-sm">No hay empleados registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {empleados.map(e => {
              const cargo = cargoInfo(e.cargo)
              return (
                <div key={e.id} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                    style={{ background: `${cargo.color}30`, color: cargo.color }}>
                    {e.nombre[0]}{e.apellido?.[0] ?? ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{e.nombre} {e.apellido ?? ''}</p>
                      {e.usuario_id && (
                        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/20 font-bold">
                          <ShieldCheck size={9}/> Acceso
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${cargo.color}20`, color: cargo.color }}>
                        {cargo.label}
                      </span>
                      {e.usuario && (
                        <span className="text-[10px] text-gray-500 truncate">{e.usuario.email}</span>
                      )}
                      {e.telefono && (
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Phone size={9}/>{e.telefono}
                        </span>
                      )}
                    </div>
                  </div>
                  {e.salario ? (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500">Salario</p>
                      <p className="text-sm font-bold text-white tabular-nums">{fmt(e.salario)}</p>
                    </div>
                  ) : null}
                  <button onClick={() => abrirEditar(e)}
                    className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-teal-400
                               hover:bg-teal-500/10 rounded-lg transition-colors flex-shrink-0 ml-1">
                    <Edit2 size={13} />
                  </button>
                  {canEliminar && e.usuario_id !== authUser?.id && (
                    <button onClick={() => setConfirmEliminar(e)}
                      className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-red-400
                                 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal confirmación eliminar */}
      {confirmEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#112240] rounded-2xl w-full max-w-sm border border-red-500/20 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 flex-shrink-0">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="font-bold text-white">Eliminar empleado</p>
                <p className="text-xs text-gray-500 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="bg-brand-dark rounded-xl p-3 border border-white/5">
              <p className="text-sm text-white font-semibold">
                {confirmEliminar.nombre} {confirmEliminar.apellido ?? ''}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{confirmEliminar.cargo}</p>
              {confirmEliminar.usuario_id && (
                <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Su acceso al sistema también será desactivado
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmEliminar(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400
                           hover:bg-white/5 text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminarEmpleado(confirmEliminar.id)}
                disabled={eliminando}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white
                           font-bold text-sm transition-colors disabled:opacity-50"
              >
                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#112240] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#112240] rounded-t-2xl z-10">
              <h3 className="text-white font-bold">{editando ? 'Editar empleado' : 'Nuevo empleado'}</h3>
              <button onClick={cerrarModal}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-xl">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Nombre / Apellido */}
              <div className="grid grid-cols-2 gap-3">
                {([['nombre','Nombre *'], ['apellido','Apellido']] as [string,string][]).map(([k, label]) => (
                  <div key={k}>
                    <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
                    <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                                 focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
                  </div>
                ))}
              </div>

              {/* Cargo / Salario */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Cargo *</label>
                  <select value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-3 text-sm text-white
                               focus:outline-none focus:border-teal-500/50 min-h-[48px]">
                    {CARGOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Rol sistema: <span className="text-teal-400">{cargoActual.rol}</span>
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Salario</label>
                  <input type="number" value={form.salario} onChange={e => setForm(f => ({ ...f, salario: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                               placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
                </div>
              </div>

              {/* Cédula / Teléfono */}
              <div className="grid grid-cols-2 gap-3">
                {([['cedula','Cédula'], ['telefono','Teléfono']] as [string,string][]).map(([k, label]) => (
                  <div key={k}>
                    <label className="text-xs text-gray-400 mb-1.5 block">{label}</label>
                    <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                                 focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
                  </div>
                ))}
              </div>

              {/* Fecha ingreso */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Fecha de ingreso</label>
                <input type="date" value={form.fecha_ingreso} onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))}
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                             focus:outline-none focus:border-teal-500/50 min-h-[48px]" />
              </div>

              {/* ── Sección acceso al sistema ── */}
              {canCrearUsuario && (
                <div className="border border-teal-500/20 rounded-xl overflow-hidden">
                  <div className="bg-teal-500/5 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={15} className="text-teal-400"/>
                      <span className="text-sm text-teal-300 font-semibold">Acceso al sistema</span>
                    </div>
                    {!editando ? (
                      /* Crear: toggle activar */
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, crear_usuario: !f.crear_usuario }))}
                        className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          form.crear_usuario ? 'bg-teal-500' : 'bg-gray-700')}>
                        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          form.crear_usuario ? 'translate-x-6' : 'translate-x-1')}/>
                      </button>
                    ) : editando.usuario_id ? (
                      <span className="text-[10px] text-teal-400 flex items-center gap-1">
                        <ShieldCheck size={10}/> Vinculado
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Sin acceso</span>
                    )}
                  </div>

                  {/* Crear nuevo: email + contraseña */}
                  {!editando && form.crear_usuario && (
                    <div className="p-4 space-y-3 bg-brand-dark/30">
                      <p className="text-[10px] text-gray-500">
                        Se creará un usuario con rol <span className="text-teal-400 font-semibold">{cargoActual.rol}</span> para este empleado.
                      </p>
                      <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Email de acceso *</label>
                        <input type="email" value={form.usuario_email}
                          onChange={e => setForm(f => ({ ...f, usuario_email: e.target.value }))}
                          placeholder="empleado@berlin.com"
                          autoComplete="new-password"
                          className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                                     focus:outline-none focus:border-teal-500/50 min-h-[48px]"/>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1.5 block">Contraseña *</label>
                        <div className="relative">
                          <input type={showPass ? 'text' : 'password'} value={form.usuario_password}
                            onChange={e => setForm(f => ({ ...f, usuario_password: e.target.value }))}
                            placeholder="Mínimo 8 caracteres"
                            autoComplete="new-password"
                            className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white
                                       focus:outline-none focus:border-teal-500/50 min-h-[48px]"/>
                          <button type="button" onClick={() => setShowPass(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                            {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Editando: mostrar email + cambiar contraseña */}
                  {editando && editando.usuario_id && (
                    <div className="p-4 space-y-3 bg-brand-dark/30">
                      <div className="flex items-center gap-2 text-sm">
                        <ShieldCheck size={13} className="text-teal-400 flex-shrink-0"/>
                        <span className="text-gray-300">{editando.usuario?.email}</span>
                        <span className={cn('ml-auto text-[10px] px-2 py-0.5 rounded-full',
                          editando.usuario?.activo
                            ? 'bg-green-500/15 text-green-400'
                            : 'bg-red-500/15 text-red-400')}>
                          {editando.usuario?.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1">
                          <KeyRound size={10}/> Nueva contraseña (opcional)
                        </label>
                        <div className="relative">
                          <input type={showNewPass ? 'text' : 'password'} value={form.nueva_password}
                            onChange={e => setForm(f => ({ ...f, nueva_password: e.target.value }))}
                            placeholder="Dejar vacío para no cambiar"
                            className="w-full bg-brand-dark border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white
                                       focus:outline-none focus:border-teal-500/50 min-h-[48px]"/>
                          <button type="button" onClick={() => setShowNewPass(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                            {showNewPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-600">
                        Cambiar el cargo actualiza automáticamente el rol del usuario en el sistema.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button onClick={cerrarModal}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 text-sm min-h-[48px]">
                Cancelar
              </button>
              <button
                disabled={
                  !form.nombre || isPending ||
                  (!editando && form.crear_usuario && (!form.usuario_email || !form.usuario_password))
                }
                onClick={() => guardar()}
                className="flex-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold
                           text-sm transition-colors disabled:opacity-40 min-h-[48px]">
                {isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear empleado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
