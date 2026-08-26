import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { TrendingUp, CheckCircle, Users } from 'lucide-react'
import toast from 'react-hot-toast'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

interface VentaCredito {
  id: string
  created_at: string
  total: number
  saldo_pendiente: number
  cliente?: { id: string; nombre: string; telefono?: string }
}

export default function CuentasPorCobrarPage() {
  const qc = useQueryClient()

  const { data: ventas = [], isLoading } = useQuery<VentaCredito[]>({
    queryKey: ['cuentas-por-cobrar'],
    queryFn:  () => api.get('/berlin/cuentas-por-cobrar').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { mutate: abonar } = useMutation({
    mutationFn: ({ clienteId, ventaId, monto }: { clienteId: string; ventaId: string; monto: number }) =>
      api.post(`/berlin/clientes/${clienteId}/abonar`, { venta_id: ventaId, monto }),
    onSuccess: () => {
      toast.success('Abono registrado')
      qc.invalidateQueries({ queryKey: ['cuentas-por-cobrar'] })
    },
    onError: () => toast.error('Error al registrar abono'),
  })

  const total = ventas.reduce((s, v) => s + v.saldo_pendiente, 0)

  const handleAbonar = (v: VentaCredito) => {
    const input = window.prompt(`Abono para ${v.cliente?.nombre ?? 'cliente'}\nSaldo: ${fmt(v.saldo_pendiente)}\n\nIngresa el monto del abono:`)
    if (!input) return
    const monto = parseFloat(input.replace(/[^0-9.]/g, ''))
    if (!monto || monto <= 0) return toast.error('Monto inválido')
    if (monto > v.saldo_pendiente) return toast.error('El abono supera el saldo')
    if (!v.cliente?.id) return toast.error('Venta sin cliente asociado')
    abonar({ clienteId: v.cliente.id, ventaId: v.id, monto })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={20} className="text-brand-teal"/>
        <h2 className="text-lg font-bold text-white">Cuentas por Cobrar</h2>
        <span className="ml-auto text-sm text-gray-400">{ventas.length} activas</span>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-brand-navy rounded-xl p-3 border border-white/5 text-center">
          <p className="text-xs text-gray-500 mb-1">Total por cobrar</p>
          <p className="text-sm font-bold text-brand-teal">{fmt(total)}</p>
        </div>
        <div className="bg-brand-navy rounded-xl p-3 border border-white/5 text-center">
          <p className="text-xs text-gray-500 mb-1">Clientes con deuda</p>
          <p className="text-sm font-bold text-white">
            {new Set(ventas.map(v => v.cliente?.id).filter(Boolean)).size}
          </p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-brand-navy rounded-xl border border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-600"><p className="text-sm">Cargando…</p></div>
        ) : ventas.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-gray-600">
            <CheckCircle size={36} className="opacity-20 text-green-400"/>
            <p className="text-sm">Sin cuentas pendientes por cobrar</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {ventas.map(v => (
              <div key={v.id} className="flex items-start gap-3 p-4">
                <div className="w-9 h-9 rounded-lg bg-brand-teal/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Users size={15} className="text-brand-teal"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{v.cliente?.nombre ?? 'Sin cliente'}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Venta: {new Date(v.created_at).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
                    {' · '}Total: {fmt(v.total)}
                  </p>
                  {v.cliente?.telefono && (
                    <p className="text-[10px] text-gray-600 mt-0.5">Tel: {v.cliente.telefono}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <p className="text-sm font-bold text-brand-teal tabular-nums">{fmt(v.saldo_pendiente)}</p>
                  <button onClick={() => handleAbonar(v)}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg bg-brand-teal/10 text-brand-teal border border-brand-teal/20
                               hover:bg-brand-teal/20 transition-colors min-h-[32px]">
                    Abonar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
