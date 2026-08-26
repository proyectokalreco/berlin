/**
 * ProductImageInput — selector de imagen para productos.
 * Soporta: subir foto desde dispositivo, pegar URL de internet, elegir emoji.
 * Componente compartido: usado en MateriasPrimas y FormCrearProductoRapido.
 */
import { useState, useRef, ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Smile, ChevronLeft, Globe, X, Plus } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { cn } from '../lib/utils'

export const EMOJIS_BAKERY = [
  '🍞','🥐','🥖','🥨','🥯','🫓','🧆','🥙',
  '🎂','🍰','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🥮','🍡','🍧','🍨','🍦',
  '🥟','🌭','🍕','🧀','🥘','🍖','🥚','🫔',
  '☕','🍵','🥤','🧃','🥛','🫗','🧋','💧','🫧','🍺','🧉','🍊',
  '🍋','🍓','🍇','🍑','🍊','🍎','🧈','🌾','🫙',
  '⭐','🔥','✨','💛','🧡','❤️','🎁','🛒','📦','🏷️',
]

interface Props {
  value:    string
  onChange: (v: string) => void
}

export default function ProductImageInput({ value, onChange }: Props) {
  const [open,       setOpen]       = useState(false)
  const [mode,       setMode]       = useState<'menu' | 'emoji' | 'url'>('menu')
  const [uploading,  setUploading]  = useState(false)
  const [urlInput,   setUrlInput]   = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [panelPos,   setPanelPos]   = useState({ top: 0, left: 0 })
  const btnRef  = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isUrl   = value.startsWith('http')
  const isEmpty = !value || value === '??' || value === '?'

  const toggle = () => {
    if (!open && btnRef.current) {
      const r    = btnRef.current.getBoundingClientRect()
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 240))
      setPanelPos({ top: r.bottom + 6, left })
    }
    setOpen(v => !v)
    if (open) { setMode('menu'); setUrlInput('') }
  }

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setOpen(false)
    setMode('menu')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('imagen', file)
      const { data } = await api.post<{ url: string }>('/berlin/upload/imagen', fd)
      onChange(data.url)
      toast.success('Imagen subida ✅')
    } catch {
      toast.error('Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  const handleUrlImport = async () => {
    if (!urlInput.startsWith('http')) return
    setLoadingUrl(true)
    try {
      const { data } = await api.post<{ url: string }>('/berlin/upload/imagen-url', { url: urlInput })
      onChange(data.url)
      setUrlInput('')
      setOpen(false)
      setMode('menu')
      toast.success('Imagen guardada ✅')
    } catch {
      toast.error('No se pudo guardar la imagen. Verifica que la URL sea directa a un archivo de imagen.')
    } finally {
      setLoadingUrl(false)
    }
  }

  const panel = open ? createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={() => { setOpen(false); setMode('menu') }} />
      <div
        className="fixed z-[9999] bg-[#0D1B2A] border border-white/20 rounded-2xl p-3 shadow-2xl w-56"
        style={{ top: panelPos.top, left: panelPos.left }}
      >
        {mode === 'menu' ? (
          <div className="space-y-0.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-1">Imagen del producto</p>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/10 transition-colors text-left">
              <Camera size={14} className="text-brand-teal flex-shrink-0" />
              Subir foto del dispositivo
            </button>
            <button type="button" onClick={() => setMode('url')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/10 transition-colors text-left">
              <Globe size={14} className="text-purple-400 flex-shrink-0" />
              Pegar URL de internet
            </button>
            <button type="button" onClick={() => setMode('emoji')}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/10 transition-colors text-left">
              <Smile size={14} className="text-yellow-400 flex-shrink-0" />
              Usar emoji / ícono
            </button>
            {!isEmpty && (
              <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left">
                <X size={14} className="flex-shrink-0" />
                Quitar imagen
              </button>
            )}
          </div>
        ) : mode === 'url' ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button type="button" onClick={() => { setMode('menu'); setUrlInput('') }}
                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Imagen desde internet</p>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              En Google Imágenes: clic derecho → <strong className="text-gray-300">Copiar dirección de imagen</strong> → pégala aquí
            </p>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlImport()}
              placeholder="https://..."
              autoFocus
              className="w-full bg-[#112240] border border-white/10 rounded-lg px-3 py-2 text-xs text-white
                         focus:outline-none focus:border-brand-teal placeholder:text-gray-600"
            />
            {urlInput.startsWith('http') && (
              <div className="mt-2 rounded-lg overflow-hidden bg-white/5 h-20 flex items-center justify-center">
                <img src={urlInput} alt="" className="max-w-full max-h-full object-contain"
                     onError={e => { e.currentTarget.style.opacity = '0.3' }} />
              </div>
            )}
            <button type="button" onClick={handleUrlImport}
              disabled={!urlInput.startsWith('http') || loadingUrl}
              className="w-full mt-2 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30
                         text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed">
              {loadingUrl ? 'Descargando y guardando…' : 'Guardar imagen ✓'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={() => setMode('menu')}
                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Toca para seleccionar</p>
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {EMOJIS_BAKERY.map(e => (
                <button key={e} type="button"
                  onClick={() => { onChange(e); setOpen(false); setMode('menu') }}
                  className={cn(
                    'w-8 h-8 text-xl rounded-lg flex items-center justify-center',
                    'hover:bg-white/10 active:scale-90 transition-all select-none',
                    value === e && 'bg-brand-teal/20 ring-1 ring-brand-teal/50',
                  )}>
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-white/10">
              <p className="text-[10px] text-gray-600 mb-1.5">O escribe / pega uno:</p>
              <input
                value={(!isEmpty && !isUrl) ? value : ''}
                onChange={e => onChange(e.target.value)}
                placeholder="🍞" autoFocus
                className="w-full bg-[#112240] border border-white/10 rounded-lg px-3 py-1.5
                           text-lg text-center focus:outline-none focus:border-brand-teal
                           placeholder:text-gray-700"
              />
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  ) : null

  return (
    <div className="flex-shrink-0">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
             className="hidden" onChange={handleFile} />
      <button ref={btnRef} type="button"
        title={isUrl ? 'Cambiar imagen' : isEmpty ? 'Agregar imagen o emoji' : 'Cambiar ícono'}
        onClick={toggle} disabled={uploading}
        className={cn(
          'w-12 h-10 rounded-lg border flex items-center justify-center transition-colors select-none overflow-hidden',
          open ? 'bg-brand-teal/10 border-brand-teal'
               : 'bg-brand-navy border-white/10 hover:border-brand-teal/60',
        )}
      >
        {uploading ? (
          <div className="w-4 h-4 border-2 border-brand-teal/30 border-t-brand-teal rounded-full animate-spin" />
        ) : isUrl ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : isEmpty ? (
          <Camera size={15} className="text-gray-500" />
        ) : (
          <span className="text-base">{value}</span>
        )}
      </button>
      {panel}
    </div>
  )
}
