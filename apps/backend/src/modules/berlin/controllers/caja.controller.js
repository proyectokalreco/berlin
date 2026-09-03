const supabase = require('../../../config/supabase');
const { fechaColombia, rangoDiaColombia } = require('../../../utils/fecha');

const ROLES_ADMIN = ['super_admin', 'admin', 'admin_berlin'];
const esAdminRol  = (rol) => ROLES_ADMIN.includes(rol);

// Caja compartida por negocio (no por usuario) — cualquiera vende bajo el turno
// que esté abierto, sin importar quién lo abrió. Cada venta ya guarda vendedor_id
// (br_ventas), así que se sabe quién hizo qué. Migración 094 cambió el índice único
// de (fecha, usuario_apertura_id) a solo (fecha). Mismo criterio que Esquina (079).

// ── GET /api/panaderia/caja/turno-activo
const turnoActivo = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { data, error } = await supabase
      .from('br_turnos_caja')
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre, rol), usuario_cierre:usuario_cierre_id(id, nombre)`)
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
      .maybeSingle();

    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/turno-pendiente  (turno abierto de días anteriores)
const turnoPendiente = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { data, error } = await supabase
      .from('br_turnos_caja')
      .select(`id, fecha, estado, monto_inicial, usuario_apertura:usuario_apertura_id(id, nombre)`)
      .eq('estado', 'abierto')
      .neq('fecha', hoy)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/hoy
const obtenerCajaHoy = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { data } = await supabase
      .from('br_turnos_caja')
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre), usuario_cierre:usuario_cierre_id(id, nombre)`)
      .eq('fecha', hoy)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── POST /api/panaderia/caja/apertura
const abrirCaja = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { monto_inicial = 0, notas_apertura } = req.body;

    // Caja compartida: bloquear si YA hay un turno abierto en el negocio (hoy o
    // de un día anterior sin cerrar), sin importar quién lo abrió.
    const { data: turnoPendiente } = await supabase
      .from('br_turnos_caja')
      .select('id, fecha, estado, usuario_apertura:usuario_apertura_id(nombre)')
      .eq('estado', 'abierto')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (turnoPendiente) {
      const esMismaFecha = turnoPendiente.fecha === hoy;
      const quien = turnoPendiente.usuario_apertura?.nombre;
      const msg = esMismaFecha
        ? `Ya hay una caja abierta hoy${quien ? ` (abierta por ${quien})` : ''} — no hace falta abrir otra, ya puedes vender.`
        : `Hay un turno pendiente de cierre del ${turnoPendiente.fecha}. Debe cerrarse antes de abrir un nuevo turno.`;
      return res.status(400).json({ error: msg, turno_pendiente: turnoPendiente });
    }

    const { data, error } = await supabase
      .from('br_turnos_caja')
      .insert({
        fecha:               hoy,
        monto_inicial:       parseFloat(monto_inicial) || 0,
        usuario_apertura_id: req.user.id,
        estado:              'abierto',
        notas_apertura,
      })
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre)`)
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Ya hay un turno abierto hoy en este punto de venta.' });
      }
      throw error;
    }

    await supabase.from('br_movimientos_contables').insert({
      fecha:           hoy,
      tipo:            'ingreso',
      categoria:       'apertura_caja',
      concepto:        `Apertura de caja — ${hoy}`,
      monto:           parseFloat(monto_inicial) || 0,
      metodo_pago:     'efectivo',
      referencia_tipo: 'turno',
      referencia_id:   data.id,
      turno_id:        data.id,
      registrado_por:  req.user.id,
    });

    res.status(201).json(data);
  } catch (err) { next(err); }
};

// ── POST /api/panaderia/caja/cierre
const cerrarCaja = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { desde, hasta } = rangoDiaColombia(hoy);
    const { monto_final_real, notas_cierre } = req.body;

    // Turno compartido del negocio (no filtra por usuario)
    const { data: turno } = await supabase
      .from('br_turnos_caja')
      .select('*, usuario_apertura:usuario_apertura_id(id, nombre, rol)')
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
      .maybeSingle();

    if (!turno) {
      return res.status(404).json({ error: 'No hay una caja abierta hoy' });
    }

    // Permiso para cerrar: admin del negocio siempre puede. Si la abrió un cajero,
    // ese mismo cajero también puede cerrarla. Si la abrió un vendedor, solo un
    // admin puede cerrarla. Mismo criterio que Esquina del Crédito.
    const abrioUnCajero = turno.usuario_apertura?.rol === 'cajero';
    const esQuienAbrio   = turno.usuario_apertura_id === req.user.id;
    const puedeCerrar    = esAdminRol(req.user.rol) || (abrioUnCajero && esQuienAbrio);
    if (!puedeCerrar) {
      return res.status(403).json({ error: 'No tienes permiso para cerrar esta caja — solo un administrador o quien la abrió (si es cajero) puede hacerlo.' });
    }

    // Verificar que no haya mesas con órdenes abiertas (br_meseros.id ≠ usuarios.id — sin filtro por mesero)
    const { data: mesasAbiertas } = await supabase
      .from('br_ordenes_mesa')
      .select('id, mesa:mesa_id(numero)')
      .eq('estado', 'abierta');

    if (mesasAbiertas && mesasAbiertas.length > 0) {
      const numeros = mesasAbiertas.map(o => `Mesa ${o.mesa?.numero ?? '?'}`).join(', ');
      return res.status(400).json({
        error: `No puedes cerrar el turno con órdenes de mesa pendientes. Cancela o cobra primero: ${numeros}.`,
        mesas_pendientes: mesasAbiertas,
      });
    }

    // Ventas de TODOS los que vendieron hoy bajo esta caja compartida — no solo
    // las de quien cierra. vendedor_id de cada venta identifica quién la hizo.
    const { data: ventasData } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado, monto_efectivo, monto_transferencia, vendedor_id, vendedor:vendedor_id(nombre)')
      .eq('estado', 'completada')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const ventas               = ventasData || [];
    const totalVentas          = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
    // Efectivo = ventas efectivo + parte efectivo de pago mixto
    const totalEfectivo        =
      ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0)
      + ventas.filter(v => v.metodo_pago === 'mixto').reduce((s, v) => s + (parseFloat(v.monto_efectivo) || 0), 0);
    // Pago Electrónico = transferencia + QR/Nequi (unificados) + parte electrónica de mixto
    const totalTransferencia   =
      ventas.filter(v => v.metodo_pago === 'transferencia' || v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0)
      + ventas.filter(v => v.metodo_pago === 'mixto').reduce((s, v) => s + (parseFloat(v.monto_transferencia) || 0), 0);
    const totalCredito         = ventas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + parseFloat(v.total), 0);

    // Desglose por vendedor — para control de quién vendió qué al cerrar el día
    const desgloseMap = new Map();
    for (const v of ventas) {
      const key = v.vendedor_id || 'sin_asignar';
      const nombre = v.vendedor?.nombre || 'Sin asignar';
      const acc = desgloseMap.get(key) || { vendedor_id: v.vendedor_id, nombre, total: 0, num_ventas: 0 };
      acc.total += parseFloat(v.total);
      acc.num_ventas += 1;
      desgloseMap.set(key, acc);
    }
    const desglosePorVendedor = Array.from(desgloseMap.values()).sort((a, b) => b.total - a.total);

    // Gastos del turno
    const { data: gastosData } = await supabase
      .from('br_gastos')
      .select('monto')
      .eq('turno_id', turno.id);

    const totalGastos = (gastosData || []).reduce((s, g) => s + parseFloat(g.monto), 0);

    const montoFinal = parseFloat(monto_final_real) || 0;
    const efectivoEsperado = parseFloat(turno.monto_inicial) + totalEfectivo - totalGastos;
    const diferencia = montoFinal - efectivoEsperado;

    const { data: turnoCerrado, error } = await supabase
      .from('br_turnos_caja')
      .update({
        cierre_at:                  new Date().toISOString(),
        usuario_cierre_id:          req.user.id,
        monto_final_real:           montoFinal,
        total_ventas:               totalVentas,
        total_ventas_efectivo:      totalEfectivo,
        total_ventas_transferencia: totalTransferencia,
        total_ventas_qr:            0,
        total_credito:              totalCredito,
        total_gastos:               totalGastos,
        num_ventas:                 ventas.length,
        estado:                     'cerrado',
        notas_cierre,
      })
      .eq('id', turno.id)
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre), usuario_cierre:usuario_cierre_id(id, nombre)`)
      .single();

    if (error) throw error;

    await supabase.from('br_movimientos_contables').insert({
      fecha:           hoy,
      tipo:            'egreso',
      categoria:       'cierre_caja',
      concepto:        `Cierre de caja — ${hoy} — Total ventas: $${totalVentas.toLocaleString('es-CO')}`,
      monto:           0,
      metodo_pago:     'efectivo',
      referencia_tipo: 'turno',
      referencia_id:   turno.id,
      turno_id:        turno.id,
      registrado_por:  req.user.id,
    });

    res.json({ ...turnoCerrado, diferencia, efectivo_esperado: efectivoEsperado, desglose_vendedores: desglosePorVendedor });
  } catch (err) { next(err); }
};

// ── POST /api/panaderia/caja/:id/cerrar  (cierre de turno de un día anterior)
const cerrarTurnoHistorico = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { monto_final_real = 0, notas_cierre } = req.body;
    const isAdmin = ['super_admin', 'admin', 'admin_berlin'].includes(req.user.rol);

    const { data: turno, error: errTurno } = await supabase
      .from('br_turnos_caja')
      .select('*')
      .eq('id', id)
      .eq('estado', 'abierto')
      .maybeSingle();

    if (errTurno) throw errTurno;
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado o ya está cerrado' });

    // Solo el propietario del turno o un admin puede cerrarlo
    if (!isAdmin && turno.usuario_apertura_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para cerrar este turno' });
    }

    // Verificar que no haya mesas con órdenes abiertas (br_meseros.id ≠ usuarios.id — sin filtro por mesero)
    const { data: mesasAbiertas } = await supabase
      .from('br_ordenes_mesa')
      .select('id, mesa:mesa_id(numero)')
      .eq('estado', 'abierta');

    if (mesasAbiertas && mesasAbiertas.length > 0) {
      const numeros = mesasAbiertas.map(o => `Mesa ${o.mesa?.numero ?? '?'}`).join(', ');
      return res.status(400).json({
        error: `No puedes cerrar el turno con órdenes pendientes. Cancela o cobra primero: ${numeros}.`,
        mesas_pendientes: mesasAbiertas,
      });
    }

    const { desde, hasta } = rangoDiaColombia(turno.fecha);

    // Caja compartida: ventas de TODOS los que vendieron ese día, no solo las de quien abrió
    const { data: ventasData } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado, monto_efectivo, monto_transferencia')
      .eq('estado', 'completada')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const ventas             = ventasData || [];
    const totalVentas        = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
    const totalEfectivo      =
      ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0)
      + ventas.filter(v => v.metodo_pago === 'mixto').reduce((s, v) => s + (parseFloat(v.monto_efectivo) || 0), 0);
    const totalTransferencia =
      ventas.filter(v => v.metodo_pago === 'transferencia' || v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0)
      + ventas.filter(v => v.metodo_pago === 'mixto').reduce((s, v) => s + (parseFloat(v.monto_transferencia) || 0), 0);
    const totalCredito       = ventas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + parseFloat(v.total), 0);

    const { data: gastosData } = await supabase
      .from('br_gastos').select('monto').eq('turno_id', turno.id);
    const totalGastos = (gastosData || []).reduce((s, g) => s + parseFloat(g.monto), 0);

    const montoFinal        = parseFloat(monto_final_real) || 0;
    const efectivoEsperado  = parseFloat(turno.monto_inicial) + totalEfectivo - totalGastos;
    const diferencia        = montoFinal - efectivoEsperado;

    const { data: turnoCerrado, error } = await supabase
      .from('br_turnos_caja')
      .update({
        cierre_at:                  new Date().toISOString(),
        usuario_cierre_id:          req.user.id,
        monto_final_real:           montoFinal,
        total_ventas:               totalVentas,
        total_ventas_efectivo:      totalEfectivo,
        total_ventas_transferencia: totalTransferencia,
        total_ventas_qr:            0,
        total_credito:              totalCredito,
        total_gastos:               totalGastos,
        num_ventas:                 ventas.length,
        estado:                     'cerrado',
        notas_cierre:               notas_cierre || `Cierre manual de turno del ${turno.fecha}`,
      })
      .eq('id', turno.id)
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre), usuario_cierre:usuario_cierre_id(id, nombre)`)
      .single();

    if (error) throw error;

    await supabase.from('br_movimientos_contables').insert({
      fecha:           turno.fecha,
      tipo:            'egreso',
      categoria:       'cierre_caja',
      concepto:        `Cierre de caja — ${turno.fecha} — Total ventas: $${totalVentas.toLocaleString('es-CO')}`,
      monto:           0,
      metodo_pago:     'efectivo',
      referencia_tipo: 'turno',
      referencia_id:   turno.id,
      turno_id:        turno.id,
      registrado_por:  req.user.id,
    });

    res.json({ ...turnoCerrado, diferencia, efectivo_esperado: efectivoEsperado });
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/historial
const historial = async (req, res, next) => {
  try {
    const { limit = 30 } = req.query;
    const isAdmin = ['super_admin','admin','admin_berlin'].includes(req.user.rol);

    let query = supabase
      .from('br_turnos_caja')
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre), usuario_cierre:usuario_cierre_id(id, nombre)`)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (!isAdmin) {
      query = query.eq('usuario_apertura_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/turno-negocio-activo
// Caja compartida: hay un solo turno por negocio por día (br_ es single-tenant),
// así que basta con buscar el turno abierto de hoy — sin resolver usuarios del negocio.
const turnoNegocioActivo = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { data, error } = await supabase.from('br_turnos_caja')
      .select('id, estado')
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/ventas-turno
// Caja compartida: el turno es del negocio, así que este resumen es de TODAS las
// ventas del día, no solo las del usuario que consulta.
const ventasTurno = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { desde, hasta } = rangoDiaColombia(hoy);
    const { data } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado, monto_efectivo, monto_transferencia')
      .eq('estado', 'completada')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const ventas     = data || [];
    const totalVentas = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
    const efectivo =
      ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0)
      + ventas.filter(v => v.metodo_pago === 'mixto').reduce((s, v) => s + (parseFloat(v.monto_efectivo) || 0), 0);
    // Pago Electrónico incluye transferencia + QR/Nequi (unificados) + parte electrónica de mixto
    const transferencias =
      ventas.filter(v => v.metodo_pago === 'transferencia' || v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0)
      + ventas.filter(v => v.metodo_pago === 'mixto').reduce((s, v) => s + (parseFloat(v.monto_transferencia) || 0), 0);
    res.json({
      total_ventas:   totalVentas,
      num_ventas:     ventas.length,
      efectivo,
      transferencias,
      credito:        ventas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + parseFloat(v.total), 0),
      ticket_promedio: ventas.length > 0 ? totalVentas / ventas.length : 0,
    });
  } catch (err) { next(err); }
};

module.exports = { turnoActivo, turnoPendiente, turnoNegocioActivo, obtenerCajaHoy, abrirCaja, cerrarCaja, cerrarTurnoHistorico, historial, ventasTurno };
