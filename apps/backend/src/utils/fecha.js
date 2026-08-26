// Zona horaria Colombia (UTC-5) para todos los cálculos de fecha del sistema
const TZ = 'America/Bogota'

// Fecha actual Colombia como 'YYYY-MM-DD'
function fechaColombia(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ })
}

// Rango UTC completo de un día Colombia
// Medianoche Colombia = 05:00 UTC; fin de día = 04:59:59.999 UTC siguiente
function rangoDiaColombia(fechaStr) {
  const f = fechaStr || fechaColombia()
  const [y, m, d] = f.split('-').map(Number)
  const inicio = new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0))
  const fin    = new Date(Date.UTC(y, m - 1, d + 1, 4, 59, 59, 999))
  return { desde: inicio.toISOString(), hasta: fin.toISOString() }
}

// Rango UTC para un mes Colombia
function rangoMesColombia(year, month) {
  const inicio = new Date(Date.UTC(year, month - 1, 1, 5, 0, 0, 0))
  const fin    = new Date(Date.UTC(year, month, 1, 4, 59, 59, 999))
  return { desde: inicio.toISOString(), hasta: fin.toISOString() }
}

// Rango UTC de los últimos N días Colombia
function rangoUltimosDias(n) {
  const hoy   = fechaColombia()
  const inicio = new Date(Date.UTC(...hoy.split('-').map(Number).map((v, i) => i === 1 ? v - 1 : v)))
  inicio.setUTCDate(inicio.getUTCDate() - (n - 1))
  inicio.setUTCHours(5, 0, 0, 0)
  const fin = new Date(Date.UTC(...hoy.split('-').map(Number).map((v, i) => i === 1 ? v - 1 : v)))
  fin.setUTCDate(fin.getUTCDate() + 1)
  fin.setUTCHours(4, 59, 59, 999)
  return { desde: inicio.toISOString(), hasta: fin.toISOString() }
}

module.exports = { fechaColombia, rangoDiaColombia, rangoMesColombia, rangoUltimosDias }
