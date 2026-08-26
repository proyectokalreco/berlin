const supabase = require('../../../config/supabase');
const { fechaColombia, rangoDiaColombia } = require('../../../utils/fecha');

// ── GET /api/panaderia/caja/turno-activo
const turnoActivo = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { data, error } = await supabase
      .from('br_turnos_caja')
      .select(`*, usuario_apertura:usuario_apertura_id(id, nombre), usuario_cierre:usuario_cierre_id(id, nombre)`)
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
      .eq('usuario_apertura_id', req.user.id)
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
      .eq('usuario_apertura_id', req.user.id)
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

    // Bloquear si hay turno abierto de cualquier día (hoy o anterior)
    const { data: turnoPendiente } = await supabase
      .from('br_turnos_caja')
      .select('id, fecha, estado')
      .eq('estado', 'abierto')
      .eq('usuario_apertura_id', req.user.id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (turnoPendiente) {
      const esMismaFecha = turnoPendiente.fecha === hoy;
      const msg = esMismaFecha
        ? 'Ya tienes un turno abierto hoy. Debes cerrarlo antes de abrir uno nuevo.'
        : `Tienes un turno pendiente de cierre del ${turnoPendiente.fecha}. Debes cerrarlo antes de abrir un nuevo turno.`;
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

    // Turno activo del USUARIO actual
    const { data: turno } = await supabase
      .from('br_turnos_caja')
      .select('*')
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
      .eq('usuario_apertura_id', req.user.id)
      .maybeSingle();

    if (!turno) {
      return res.status(404).json({ error: 'No tienes un turno abierto hoy' });
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

    // Ventas del cajero actual en este turno (filtrado por vendedor_id)
    const { data: ventasData } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado')
      .eq('estado', 'completada')
      .eq('vendedor_id', req.user.id)
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const ventas               = ventasData || [];
    const totalVentas          = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
    const totalEfectivo        = ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0);
    const totalTransferencia   = ventas.filter(v => v.metodo_pago === 'transferencia').reduce((s, v) => s + parseFloat(v.total), 0);
    const totalQr              = ventas.filter(v => v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0);
    const totalCredito         = ventas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + parseFloat(v.total), 0);

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
        total_ventas_qr:            totalQr,
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

    res.json({ ...turnoCerrado, diferencia, efectivo_esperado: efectivoEsperado });
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

    const { data: ventasData } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado')
      .eq('estado', 'completada')
      .eq('vendedor_id', turno.usuario_apertura_id)
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const ventas             = ventasData || [];
    const totalVentas        = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
    const totalEfectivo      = ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0);
    const totalTransferencia = ventas.filter(v => v.metodo_pago === 'transferencia').reduce((s, v) => s + parseFloat(v.total), 0);
    const totalQr            = ventas.filter(v => v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0);
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
        total_ventas_qr:            totalQr,
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
const turnoNegocioActivo = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { negocio_id: negocioId, rol, id: userId } = req.user;
    const esGlobal = ['super_admin', 'admin'].includes(rol);

    let turnoQuery = supabase.from('br_turnos_caja')
      .select('id, estado')
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
      .limit(1);

    if (!esGlobal) {
      // Buscar negocio_id vía br_empleados (más confiable que usuarios.negocio_id)
      const { data: miEmpleado } = await supabase
        .from('br_empleados')
        .select('negocio_id')
        .eq('usuario_id', userId)
        .maybeSingle();

      const negId = miEmpleado?.negocio_id || negocioId;

      // Siempre incluir al usuario actual como mínimo, aunque no esté en br_empleados
      let userIds = [userId];
      if (negId) {
        // Obtener todos los usuarios del mismo negocio vía br_empleados
        const { data: empNegocio } = await supabase
          .from('br_empleados')
          .select('usuario_id')
          .eq('negocio_id', negId)
          .not('usuario_id', 'is', null);

        userIds = [...new Set([...(empNegocio || []).map(e => e.usuario_id).filter(Boolean), userId])];
      }
      turnoQuery = turnoQuery.in('usuario_apertura_id', userIds);
    }

    const { data, error } = await turnoQuery.maybeSingle();
    if (error) throw error;
    res.set('Cache-Control', 'no-store');
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/ventas-turno
const ventasTurno = async (req, res, next) => {
  try {
    const hoy = fechaColombia();
    const { desde, hasta } = rangoDiaColombia(hoy);
    const { data } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado')
      .eq('estado', 'completada')
      .eq('vendedor_id', req.user.id)
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const ventas     = data || [];
    const totalVentas = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
    res.json({
      total_ventas:   totalVentas,
      num_ventas:     ventas.length,
      efectivo:       ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0),
      transferencias: ventas.filter(v => v.metodo_pago === 'transferencia').reduce((s, v) => s + parseFloat(v.total), 0),
      qr:             ventas.filter(v => v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0),
      credito:        ventas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + parseFloat(v.total), 0),
      ticket_promedio: ventas.length > 0 ? totalVentas / ventas.length : 0,
    });
  } catch (err) { next(err); }
};

module.exports = { turnoActivo, turnoPendiente, turnoNegocioActivo, obtenerCajaHoy, abrirCaja, cerrarCaja, cerrarTurnoHistorico, historial, ventasTurno };
