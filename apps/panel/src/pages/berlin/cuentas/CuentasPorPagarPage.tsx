import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { AlertCircle, CheckCircle, Clock, Truck } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

interface Factura {
  id: string
  numero_factura?: string
  fecha: string
  fecha_vencimiento?: string
  total: number
  estado: string
  notas?: string
  proveedor?: { id: string; nombre: string; telefono?: string }
}

function diasRestantes(fecha?: string) {
  if (!fecha) return null
  const diff = Math.ceil((new Date(fecha + 'T12:00:00').getTime() - Date.now()) / 86_400_000)
  return diff
}

export default function CuentasPorPagarPage() {
  const qc = useQueryClient()

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ['cuentas-por-pagar'],
    queryFn:  () => api.get('/berlin/cuentas-por-pagar').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { mutate: pagar } = useMutation({
    mutationFn: (id: string) => api.patch(`/berlin/proveedores/facturas/${id}/pagar`, {}),
    onSuccess: () => {
      toast.success('Factura marcada como pagada')
      qc.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
      qc.invalidateQueries({ queryKey: ['facturas-proveedor'] })
    },
    onError: () => toast.error('Error al marcar como pagada'),
  })

  const total = facturas.reduce((s, f) => s + f.total, 0)
  const vencidas = facturas.filter(f => {
    const d = diasRestantes(f.fecha_vencimiento)
    return d !== null && d < 0
  })
  const proximas = facturas.filter(f => {
    const d = diasRestantes(f.fecha_vencimiento)
    return d !== null && d >= 0 && d <= 7
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertCircle size={20} className="text-amber-400"/>
        <h2 className="text-lg font-bold text-white">Cuentas por Pagar</h2>
        <span className="ml-auto text-sm text-gray-400">{facturas.length} pendientes</span>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-brand-navy rounded-xl p-3 border border-white/5 text-center">
          <p className="text-xs text-gray-500 mb-1">Total pendiente</p>
          <p className="text-sm font-bold text-amber-400">{fmt(total)}</p>
        </div>
        <div className="bg-brand-navy rounded-xl p-3 border border-white/5 text-center">
          <p className="text-xs text-gray-500 mb-1">Vencidas</p>
          <p className="text-sm font-bold text-red-400">{vencidas.length}</p>
        </div>
        <div className="bg-brand-navy rounded-xl p-3 border border-white/5 text-center">
          <p className="text-xs text-gray-500 mb-1">Próx. 7 días</p>
          <p className="text-sm font-bold text-orange-400">{proximas.length}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-600"><p className="text-sm">Cargando…</p></div>
        ) : facturas.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
            <CheckCircle size={36} className="opacity-20 text-green-400"/>
            <p className="text-sm">Sin cuentas pendientes</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {facturas.map(f => {
              const dias = diasRestantes(f.fecha_vencimiento)
              const vencida = dias !== null && dias < 0
              const proxima = dias !== null && dias >= 0 && dias <= 7
              return (
                <div key={f.id} className="flex items-start gap-3 p-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5
                    ${vencida ? 'bg-red-500/10' : proxima ? 'bg-orange-500/10' : 'bg-amber-500/10'}`}>
                    {vencida ? <AlertCircle size={15} className="text-red-400"/> : <Clock size={15} className="text-amber-400"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{f.proveedor?.nombre ?? '—'}</p>
                      {vencida && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold uppercase flex-shrink-0">vencida</span>}
                      {proxima && !vencida && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold uppercase flex-shrink-0">próxima</span>}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {f.numero_factura ? `#${f.numero_factura} · ` : ''}
                      Emitida: {new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                    </p>
                    {f.fecha_vencimiento && (
                      <p className={`text-[10px] mt-0.5 ${vencida ? 'text-red-400' : proxima ? 'text-orange-400' : 'text-gray-500'}`}>
                        Vence: {new Date(f.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                        {dias !== null && ` (${dias < 0 ? `${Math.abs(dias)} días vencida` : dias === 0 ? 'hoy' : `${dias} días`})`}
                      </p>
                    )}
                    {f.proveedor?.telefono && (
                      <p className="text-[10px] text-gray-600 mt-0.5">Tel: {f.proveedor.telefono}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <p className="text-sm font-bold text-white tabular-nums">{fmt(f.total)}</p>
                    <button onClick={() => { if (confirm(`¿Marcar factura de ${f.proveedor?.nombre} por ${fmt(f.total)} como pagada?`)) pagar(f.id) }}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20
                                 hover:bg-green-500/20 transition-colors min-h-[32px]">
                      Pagar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
