import { useEffect, useState } from 'react'
import { Check, X, Pencil } from 'lucide-react'
import { cn } from '../lib/utils'
import { armarNotaModificacion } from '../lib/comida'

// "¿Completo o modificar?" — se abre al tocar un producto de la categoría COMIDA, en POS y
// en Mesas. "Completo" agrega igual que siempre. "Modificar": los toppings vienen todos
// marcados (se desmarca lo que NO lleva), las salsas se marcan para agregarlas (sin costo) y
// hay una nota libre. El resultado es solo un TEXTO que viaja como nota del ítem — no crea
// líneas, no tiene precio, no mueve stock ni contabilidad.
export default function ModalModificarComida({
  nombreProducto, toppings, salsas, onCompleto, onModificado, onCerrar,
}: {
  nombreProducto: string
  toppings:       string[]   // nombres de los productos de la categoría TOPPINGS
  salsas:         string[]   // nombres de los productos de la categoría SALSAS
  onCompleto:     () => void
  onModificado:   (nota: string) => void
  onCerrar:       () => void
}) {
  const [modificando, setModificando] = useState(false)
  const [sinTopping,  setSinTopping]  = useState<Set<string>>(new Set())
  const [salsaSel,    setSalsaSel]    = useState<Set<string>>(new Set())
  const [otra,        setOtra]        = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const alternar = (set: Set<string>, setter: (s: Set<string>) => void, nombre: string) => {
    const s = new Set(set)
    if (s.has(nombre)) s.delete(nombre); else s.add(nombre)
    setter(s)
  }

  const hayCambios = sinTopping.size > 0 || salsaSel.size > 0 || otra.trim().length > 0
  const agregar = () => onModificado(armarNotaModificacion({
    sin:    toppings.filter(t => sinTopping.has(t)),
    salsas: salsas.filter(s => salsaSel.has(s)),
    otra,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#2C2925] rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-lg leading-tight">{nombreProducto}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {modificando ? 'El precio no cambia. Elige qué se le quita y qué salsas lleva.' : '¿Va completo o se modifica?'}
            </p>
          </div>
          <button onClick={onCerrar}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-lg flex-shrink-0">
            <X size={16}/>
          </button>
        </div>

        {!modificando ? (
          <div className="p-5 grid grid-cols-2 gap-3">
            <button autoFocus onClick={onCompleto}
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-brand-teal hover:bg-[#c7913f]
                         text-brand-dark font-bold text-base transition-colors active:scale-[0.97]">
              <Check size={26}/> Completo
            </button>
            <button onClick={() => setModificando(true)}
              className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-brand-dark border border-white/10
                         hover:border-brand-teal/50 hover:bg-brand-teal/10 text-white font-bold text-base transition-colors active:scale-[0.97]">
              <Pencil size={24}/> Modificar
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold text-gray-500 mb-2">
                  Toppings — toca los que NO lleva
                </p>
                {toppings.length === 0 ? (
                  <p className="text-xs text-gray-600">No hay productos en la categoría TOPPINGS.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {toppings.map(t => {
                      const sin = sinTopping.has(t)
                      return (
                        <button key={t} onClick={() => alternar(sinTopping, setSinTopping, t)}
                          className={cn('px-3 py-2 rounded-xl text-sm font-semibold border transition-colors select-none',
                            sin
                              ? 'bg-red-500/15 border-red-500/40 text-red-300 line-through'
                              : 'bg-brand-dark border-white/10 text-white hover:border-white/25')}>
                          {t}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold text-gray-500 mb-2">
                  Salsas — toca las que le agregas (sin costo)
                </p>
                {salsas.length === 0 ? (
                  <p className="text-xs text-gray-600">No hay productos en la categoría SALSAS.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {salsas.map(s => {
                      const on = salsaSel.has(s)
                      return (
                        <button key={s} onClick={() => alternar(salsaSel, setSalsaSel, s)}
                          className={cn('px-3 py-2 rounded-xl text-sm font-semibold border transition-colors select-none',
                            on
                              ? 'bg-brand-teal text-brand-dark border-brand-teal'
                              : 'bg-brand-dark border-white/10 text-white hover:border-white/25')}>
                          {on && <Check size={12} className="inline mr-1 -mt-0.5"/>}{s}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-widest font-semibold text-gray-500 mb-2">
                  Otra indicación (opcional)
                </p>
                <input value={otra} onChange={e => setOtra(e.target.value)} maxLength={120}
                  placeholder="Ej: bien cocida, sin pan, partida en dos…"
                  className="w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white
                             placeholder:text-gray-600 focus:outline-none focus:border-brand-teal/60"/>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button onClick={() => setModificando(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-semibold transition-colors">
                Volver
              </button>
              <button onClick={agregar} disabled={!hayCambios}
                className={cn('flex-[2] py-3 rounded-xl font-bold text-sm transition-colors active:scale-[0.98]',
                  hayCambios ? 'bg-brand-teal hover:bg-[#c7913f] text-brand-dark' : 'bg-white/5 text-gray-600 cursor-not-allowed')}>
                Agregar modificada
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
