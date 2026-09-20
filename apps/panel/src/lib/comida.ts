import { normalizar } from './buscar'

// Detección por NOMBRE de categoría (acento/mayúscula-insensible, `includes` para tolerar
// emoji u otro texto delante) — no depende de IDs fijos, igual que Jugos/Limonadas.
export const esCategoriaComida   = (nombre?: string | null) => normalizar(nombre ?? '').includes('comida')
export const esCategoriaToppings = (nombre?: string | null) => normalizar(nombre ?? '').includes('topping')
export const esCategoriaSalsas   = (nombre?: string | null) => normalizar(nombre ?? '').includes('salsa')

export interface ModificacionComida {
  sin:    string[]   // toppings que NO lleva
  salsas: string[]   // salsas que se le agregan (sin costo)
  otra:   string     // indicación libre
}

// Texto informativo que viaja como nota del ítem (comanda, ticket, factura). No tiene costo
// ni mueve stock ni contabilidad: es solo la indicación para cocina.
export function armarNotaModificacion(m: ModificacionComida): string {
  const partes: string[] = []
  if (m.sin.length)    partes.push(`SIN: ${m.sin.join(', ')}`)
  if (m.salsas.length) partes.push(`SALSAS: ${m.salsas.join(', ')}`)
  if (m.otra.trim())   partes.push(m.otra.trim())
  return partes.join(' · ')
}
