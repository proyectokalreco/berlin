const supabase = require('../../../config/supabase');
const { fechaColombia, rangoDiaColombia } = require('../../../utils/fecha');

// ── Libro Diario / Gran Bolsa — funciones nuevas (2026-08-23, clonado de Esquina) ──
//
// Tulio NO inserta un movimiento contable por cada venta del POS (a diferencia de
// Esquina) — ventas.controller.js solo actualiza br_turnos_caja vía RPC
// (incrementar_caja). Las funciones de abajo combinan br_movimientos_contables
// (gastos, compras, abonos, anticipos...) con br_ventas (fuente única de ventas,
// sin importar si vinieron del POS normal o de Mesas) para que el Libro Diario
// muestre el panorama completo sin tocar el flujo de venta en vivo.
//
// Las ventas de Mesa SÍ generan su propio movimiento en br_movimientos_contables
// (categoria='venta_mesa') — se excluye de ese lado para no duplicarlas, ya que
// también existen como fila en br_ventas.
const EXCLUIR_KPI = ['apertura_caja', 'cierre_caja', 'anulacion_venta', 'produccion', 'venta_mesa'];
const CAT_COMPRAS = ['compra_proveedor'];

function esElectronico(metodoPago) {
  return metodoPago === 'transferencia' || (metodoPago || '').includes('qr') || metodoPago === 'pago_electronico';
}

// Trae br_movimientos_contables + br_ventas normalizadas al mismo formato de fila.
// antesDe (si viene) tiene prioridad y usa "fecha <" en vez de gte/lte — para el saldo
// base del Libro Diario (todo lo anterior al rango consultado).
async function obtenerMovimientosUnificados(desde, hasta, antesDe) {
  let qMov = supabase
    .from('br_movimientos_contables')
    .select('id, fecha, concepto, tipo, categoria, monto, metodo_pago, created_at, registrado_por_user:registrado_por(nombre)')
    .not('categoria', 'in', `(${EXCLUIR_KPI.join(',')})`);
  let qVentas = supabase
    .from('br_ventas')
    // br_ventas NO tiene columna created_at (solo fecha) — a diferencia de
    // br_movimientos_contables, que sí la tiene. Pedirla aquí rompe la consulta con
    // 42703 "column br_ventas.created_at does not exist" en las 3 rutas que usan esta
    // función (gran-bolsa, resumen, libro-diario).
    .select('id, fecha, numero_venta, total, metodo_pago, estado, vendedor:vendedor_id(nombre)')
    .eq('estado', 'completada');

  if (antesDe) {
    qMov = qMov.lt('fecha', antesDe);
    qVentas = qVentas.lt('fecha', antesDe);
  } else {
    if (desde) { qMov = qMov.gte('fecha', desde); qVentas = qVentas.gte('fecha', desde); }
    if (hasta) { qMov = qMov.lte('fecha', hasta); qVentas = qVentas.lte('fecha', hasta); }
  }

  const [{ data: movs, error: e1 }, { data: ventas, error: e2 }] = await Promise.all([qMov, qVentas]);
  if (e1) throw e1;
  if (e2) throw e2;

  const ventasComoMovs = (ventas || []).map(v => ({
    id:                  `venta_${v.id}`,
    fecha:               v.fecha,
    concepto:            `Venta ${v.numero_venta}`,
    tipo:                'ingreso',
    categoria:           'venta',
    monto:               v.total,
    metodo_pago:         v.metodo_pago,
    created_at:          v.fecha, // br_ventas no tiene created_at propio, fecha hace de desempate
    registrado_por_user: v.vendedor,
  }));

  return [...(movs || []), ...ventasComoMovs];
}

async function getSaldoInicial() {
  const { data } = await supabase
    .from('br_configuracion')
    .select('clave, valor')
    .in('clave', [
      'saldo_inicial_gran_bolsa', 'saldo_inicial_fecha',
      'saldo_inicial_efectivo', 'saldo_inicial_electronico', 'saldo_inicial_cxc',
      'porcentaje_utilidad_bruta',
    ]);
  const rows        = data || [];
  const valor       = parseFloat(rows.find(r => r.clave === 'saldo_inicial_gran_bolsa')?.valor || '0');
  const fecha       = rows.find(r => r.clave === 'saldo_inicial_fecha')?.valor || null;
  const efectivo    = parseFloat(rows.find(r => r.clave === 'saldo_inicial_efectivo')?.valor || '0');
  const electronico = parseFloat(rows.find(r => r.clave === 'saldo_inicial_electronico')?.valor || '0');
  const cxc         = parseFloat(rows.find(r => r.clave === 'saldo_inicial_cxc')?.valor || '0');
  const pctUtilidad = parseFloat(rows.find(r => r.clave === 'porcentaje_utilidad_bruta')?.valor || '30');
  return { valor, fecha, efectivo, electronico, cxc, pctUtilidad };
}

// Posición acumulada de cada bolsillo hasta una fecha dada (TIMESTAMPTZ boundary vía
// rangoDiaColombia — a diferencia de Esquina, br_movimientos_contables.fecha y
// br_ventas.fecha son TIMESTAMPTZ, no DATE).
async function calcularPosicionHasta(hastaFechaCol) {
  const { valor: siTotal, fecha: siFecha, efectivo: siEfectivo, electronico: siElectronico, cxc: siCxc, pctUtilidad } = await getSaldoInicial();

  const hastaUTC = hastaFechaCol ? rangoDiaColombia(hastaFechaCol).hasta : null;
  const todos = await obtenerMovimientosUnificados(null, hastaUTC);

  const ingresos = todos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + parseFloat(m.monto), 0);
  const compras  = todos.filter(m => CAT_COMPRAS.includes(m.categoria)).reduce((s, m) => s + parseFloat(m.monto), 0);
  const gastos   = todos.filter(m => m.tipo === 'egreso' && !CAT_COMPRAS.includes(m.categoria)).reduce((s, m) => s + parseFloat(m.monto), 0);
  const saldo    = siTotal + ingresos - compras - gastos;

  const ingEfectivo = todos.filter(m => m.tipo === 'ingreso' && !esElectronico(m.metodo_pago) && m.metodo_pago !== 'credito')
    .reduce((s, m) => s + parseFloat(m.monto), 0);
  const egrEfectivo = todos.filter(m => m.tipo === 'egreso' && !esElectronico(m.metodo_pago) && m.metodo_pago !== 'credito')
    .reduce((s, m) => s + parseFloat(m.monto), 0);
  const efectivoTotal = siEfectivo + ingEfectivo - egrEfectivo;

  const ingElectronico = todos.filter(m => m.tipo === 'ingreso' && esElectronico(m.metodo_pago)).reduce((s, m) => s + parseFloat(m.monto), 0);
  const egrElectronico = todos.filter(m => m.tipo === 'egreso' && esElectronico(m.metodo_pago)).reduce((s, m) => s + parseFloat(m.monto), 0);
  const electronicoTotal = siElectronico + ingElectronico - egrElectronico;

  const ingCxc = todos.filter(m => m.tipo === 'ingreso' && m.metodo_pago === 'credito').reduce((s, m) => s + parseFloat(m.monto), 0);
  const cxcTotal = siCxc + ingCxc;

  const gastosOp = todos.filter(m => m.tipo === 'egreso' && m.categoria === 'gasto').reduce((s, m) => s + parseFloat(m.monto), 0);
  const utilidadBruta = ingresos * (pctUtilidad / 100);
  const utilidadNeta  = utilidadBruta - gastosOp;

  return {
    saldo,
    saldo_inicial:             siTotal,
    saldo_inicial_fecha:       siFecha,
    saldo_inicial_efectivo:    siEfectivo,
    saldo_inicial_electronico: siElectronico,
    saldo_inicial_cxc:         siCxc,
    efectivo_total:            efectivoTotal,
    electronico_total:         electronicoTotal,
    cxc_total:                 cxcTotal,
    utilidad_bruta:            utilidadBruta,
    utilidad_neta:             utilidadNeta,
    gastos_periodo:            gastosOp,
    porcentaje_utilidad:       pctUtilidad,
  };
}

const granBolsa = async (req, res, next) => {
  try {
    const data = await calcularPosicionHasta(null);
    res.json(data);
  } catch (err) { next(err); }
};

// GET /panaderia/movimientos/posicion?hasta=YYYY-MM-DD
const posicion = async (req, res, next) => {
  try {
    const { hasta } = req.query;
    const data = await calcularPosicionHasta(hasta || null);
    res.json(data);
  } catch (err) { next(err); }
};

// ── Libro Diario — movimientos + ventas con saldo acumulado por fila ──────────
const libroDiario = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;

    const { valor: saldoInicialValor, fecha: saldoInicialFecha } = await getSaldoInicial();
    const incluirSaldoInicial = !saldoInicialFecha || !desde || saldoInicialFecha <= desde;
    let saldoBase = incluirSaldoInicial ? saldoInicialValor : 0;

    const desdeUTC = desde ? rangoDiaColombia(desde).desde : null;
    const hastaUTC = hasta ? rangoDiaColombia(hasta).hasta : null;

    if (desdeUTC) {
      const previos = await obtenerMovimientosUnificados(null, null, desdeUTC);
      previos.forEach(m => {
        const monto = parseFloat(m.monto);
        if (m.tipo === 'ingreso') saldoBase += monto;
        else saldoBase -= monto;
      });
    }

    const filasRaw = await obtenerMovimientosUnificados(desdeUTC, hastaUTC);
    filasRaw.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0) || (a.created_at < b.created_at ? -1 : 1));

    let saldoAcum = saldoBase;
    const filas = filasRaw.slice(0, 2000).map(m => {
      const monto = parseFloat(m.monto);
      const esCompra = CAT_COMPRAS.includes(m.categoria);
      const ingreso  = m.tipo === 'ingreso' ? monto : 0;
      const egreso   = m.tipo === 'egreso' && !esCompra ? monto : 0;
      const compra   = esCompra ? monto : 0;
      saldoAcum += ingreso - egreso - compra;
      return { ...m, ingreso, egreso, compra, saldo: saldoAcum };
    });

    res.json({ saldo_base: saldoBase, filas });
  } catch (err) { next(err); }
};

const listar = async (req, res, next) => {
  try {
    const { tipo, desde, hasta, limit = 200 } = req.query;
    let q = supabase
      .from('br_movimientos_contables')
      .select('*, registrado_por_user:registrado_por(id, nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (tipo)  q = q.eq('tipo', tipo);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

// Nota (2026-08-23): ahora usa obtenerMovimientosUnificados (br_movimientos_contables +
// br_ventas) — antes solo leía br_movimientos_contables, así que las tarjetas de
// Ingresos/Gastos/Compras del Libro Diario nunca incluían las ventas del POS. Cambio
// de solo lectura, no toca cómo se crea una venta.
const resumen = async (req, res, next) => {
  try {
    const { periodo = 'hoy' } = req.query;
    const hoy = fechaColombia();

    let desde = hoy;
    let hasta = hoy;

    if (periodo === 'semana') {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      d.setDate(d.getDate() - 6)
      desde = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    } else if (periodo === 'mes') {
      desde = `${hoy.substring(0, 7)}-01`
    } else if (periodo === 'mes_anterior') {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      d.setDate(1)
      d.setMonth(d.getMonth() - 1)
      desde = d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).substring(0, 7) + '-01'
      const fin = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      fin.setDate(0)
      hasta = fin.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    } else if (periodo === 'rango' && req.query.desde && req.query.hasta) {
      desde = req.query.desde
      hasta = req.query.hasta
    }

    const desdeUTC = rangoDiaColombia(desde).desde
    const hastaUTC = rangoDiaColombia(hasta).hasta
    const movs = await obtenerMovimientosUnificados(desdeUTC, hastaUTC);

    const ingresos = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + parseFloat(m.monto), 0);
    const compras  = movs.filter(m => CAT_COMPRAS.includes(m.categoria)).reduce((s, m) => s + parseFloat(m.monto), 0);
    const gastos   = movs.filter(m => m.tipo === 'egreso' && !CAT_COMPRAS.includes(m.categoria)).reduce((s, m) => s + parseFloat(m.monto), 0);
    const egresos  = gastos + compras;

    const porCategoria = {};
    movs.forEach(m => {
      if (!porCategoria[m.categoria]) porCategoria[m.categoria] = { ingreso: 0, egreso: 0 };
      porCategoria[m.categoria][m.tipo] += parseFloat(m.monto);
    });
    res.json({ ingresos, gastos, compras, egresos, utilidad: ingresos - egresos, porCategoria, periodo, desde, hasta });
  } catch (err) { next(err); }
};

module.exports = { listar, resumen, granBolsa, posicion, libroDiario };
