// Formato de miles para inputs de dinero (COP) — mismo patrón ya usado en
// CajaPage.tsx (fmtInput/stripDigits) y en MateriasPrimas.tsx/FormCrear*Rapido.tsx
// (parseInt(...).toLocaleString('es-CO')). Centralizado acá para no repetir la
// lógica en cada archivo nuevo que la necesite.
//
// Uso: <input type="text" inputMode="numeric" value={fmtDinero(monto)}
//   onChange={e => setMonto(soloDigitos(e.target.value))} />
// El estado guarda solo dígitos crudos (como antes con type="number"); fmtDinero
// solo formatea lo que se muestra.

export const fmtDinero = (raw: string): string => {
  if (!raw) return ''
  const n = parseInt(raw.replace(/\D/g, ''), 10)
  return isNaN(n) ? '' : n.toLocaleString('es-CO')
}

export const soloDigitos = (val: string): string => val.replace(/\D/g, '')
