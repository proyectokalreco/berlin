// ============================================================
// buscar.ts — búsqueda tolerante para todos los filtros del panel
// ============================================================
// Problema que resuelve: los nombres del negocio traen tildes
// (AROMATICA, CAFE, LIMON, PIÑA...). Un `.includes()` normal obliga a
// escribir el nombre exacto, con tilde y en el orden justo.
//
// `normalizar` -> minusculas + sin tildes/diacriticos + sin espacios sobrantes.
// `coincide`   -> todos los tokens del termino deben aparecer en ALGUNO de
//                los campos, en cualquier orden. Acento- y case-insensitive.
//
// Ej: coincide('cafe leche', 'CAFE CON LECHE', 'Bebidas Calientes') === true

export const normalizar = (s: unknown): string =>
  (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de combinacion (tildes, dieresis, etc.)
    .replace(/\s+/g, ' ')
    .trim()

export const coincide = (
  termino: string,
  ...campos: (string | number | null | undefined)[]
): boolean => {
  const t = normalizar(termino)
  if (!t) return true
  const heno = campos.map(normalizar).filter(Boolean).join(' - ')
  return t.split(' ').every(tok => heno.includes(tok))
}
