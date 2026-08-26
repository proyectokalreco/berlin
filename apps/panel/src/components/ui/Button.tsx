import { cn } from '../../lib/utils'
import LoadingSpinner from './LoadingSpinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:   'bg-brand-teal text-brand-dark hover:bg-brand-teal-dk font-semibold',
  secondary: 'bg-brand-card text-white hover:bg-brand-card/80 border border-white/10',
  danger:    'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20',
  ghost:     'text-gray-400 hover:text-white hover:bg-white/5',
}
const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
}

export default function Button({
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  disabled,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg transition-all',
        variants[variant],
        sizes[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  )
}