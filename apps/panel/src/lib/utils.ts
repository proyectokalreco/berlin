/** Formatea un valor en pesos colombianos */
export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style:                 'currency',
    currency:              'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)

/** Fecha y hora corta en español */
export const formatDate = (dateStr: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    hour:    '2-digit',
    minute:  '2-digit',
  }).format(new Date(dateStr))

/** Solo fecha */
export const formatDateShort = (dateStr: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  }).format(new Date(dateStr))

/** Combina clases CSS (mínimo utilitario — sin librerías extra) */
export const cn = (...classes: (string | undefined | false | null)[]): string =>
  classes.filter(Boolean).join(' ')

/** Clases Tailwind para el estado de un pedido */
export const getEstadoColor = (estado: string): string => {
  const map: Record<string, string> = {
    pendiente:     'text-brand-gold bg-brand-gold/10',
    confirmado:    'text-blue-400 bg-blue-400/10',
    en_produccion: 'text-brand-teal bg-brand-teal/10',
    listo:         'text-green-400 bg-green-400/10',
    completada:    'text-green-500 bg-green-500/10',
    cancelado:     'text-red-400 bg-red-400/10',
  }
  return map[estado] ?? 'text-gray-400 bg-gray-400/10'
}