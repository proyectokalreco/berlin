const supabase = require('../../../config/supabase');
const { fechaColombia, rangoDiaColombia } = require('../../../utils/fecha');

const ROLES_ADMIN = ['super_admin', 'admin', 'admin_berlin'];
const esAdminRol  = (rol) => ROLES_ADMIN.includes(rol);

// Caja compartida por negocio (no por usuario) — cualquiera vende bajo el turno
// que esté abierto, sin importar quién lo abrió. Cada venta ya guarda vendedor_id
// (br_ventas), así que se sabe quién hizo qué. Migración 094 cambió el índice único
// de (fecha, usuario_apertura_id) a solo (fecha). Mismo criterio que Esquina (079).
//
// ⚠️ Horario del negocio 1pm–5am del día siguiente (2026-09-14): "turno activo" NUNCA
// se filtra por fecha calendario — solo por estado='abierto'. abrirCaja ya garantiza que
// como máximo hay 1 turno abierto a la vez, así que ese único turno ES el activo, sin
// importar si su columna `fecha` quedó "de ayer" tras pasar la medianoche. Filtrar por
// `fecha = hoy()` bloqueaba al cajero del POS/Mesas justo entre 12am y 5am (ver incidente
// 21/22 en berlin/CLAUDE.md) y hacía que el cierre solo sumara las ventas de después de
// medianoche, perdiendo las de la tarde/noche anterior.
const TURNO_LIMITE_HORAS_OLVIDADO = 20 // más que esto sin cerrar = probable turno olvidado

// ── Desglose por ÁREA / estación (Cocina, Bebidas y Barra…) — ventas de POS **y** Mesas en el
// rango dado, agrupadas por el área de la categoría de cada producto, con el detalle de qué
// producto salió, cuántas unidades y por cuánto valor, y con el responsable del área (el cajero
// cuya estación asignada en Empleados es esa). Antes solo contaba Mesas (Comandas Fase 4); el
// cliente pidió (2026-09-20) ver TODO lo vendido por área para saber de qué responde cada cajero.
// Reporte operativo: no toca el dinero del arqueo (ese se calcula aparte, sin filtrar por área).
const obtenerDesgloseEstaciones = async (desde, hasta) => {
  const [{ data: ventas }, { data: cajeros }] = await Promise.all([
    supabase
      .from('br_ventas')
      .select(`
        id, origen,
        items:br_venta_items(
          cantidad, subtotal,
          producto:producto_id(nombre, categoria:categoria_id(estacion_id, estacion:estacion_id(id, nombre, color)))
        )
      `)
      .eq('estado', 'completada')
      .gte('fecha', desde)
      .lte('fecha', hasta),
    supabase
      .from('br_empleados')
      .select('nombre, estacion_id')
      .eq('activo', true)
      .not('estacion_id', 'is', null),
  ])

  // estación → nombres de los cajeros a cargo
  const responsables = new Map()
  for (const c of cajeros || []) {
    if (!responsables.has(c.estacion_id)) responsables.set(c.estacion_id, [])
    responsables.get(c.estacion_id).push(c.nombre)
  }

  const estaciones = new Map()
  for (const v of ventas || []) {
    const modulo = v.origen === 'mesa' ? 'mesa' : 'pos'
    for (const it of v.items || []) {
      const est = it.producto?.categoria?.estacion
      const key = est?.id ?? 'sin_estacion'
      if (!estaciones.has(key)) {
        estaciones.set(key, {
          id: key, nombre: est?.nombre ?? 'Sin estación', color: est?.color ?? '#6B7280',
          responsables: est?.id ? (responsables.get(est.id) || []) : [],
          total: 0, pos: 0, mesa: 0, items: new Map(),
        })
      }
      const bucket = estaciones.get(key)
      const valor = Number(it.subtotal)
      bucket.total += valor
      bucket[modulo] += valor
      const nombreProd = it.producto?.nombre ?? 'Producto'
      const acc = bucket.items.get(nombreProd) || { nombre: nombreProd, cantidad: 0, valor: 0 }
      acc.cantidad += Number(it.cantidad)
      acc.valor += valor
      bucket.items.set(nombreProd, acc)
    }
  }

  return Array.from(estaciones.values())
    .map(e => ({ ...e, items: Array.from(e.items.values()).sort((x, y) => y.valor - x.valor) }))
    .sort((x, y) => y.total - x.total)
}

// Desglose de ventas por cajero, separado además por módulo (POS/Mesas) — control
// de quién vendió qué y desde dónde, para una caja compartida entre varios cajeros.
// Espera filas de br_ventas con vendedor_id, vendedor:vendedor_id(nombre), origen, total.
const construirDesgloseVendedores = (ventas) => {
  const map = new Map()
  for (const v of ventas) {
    const key    = v.vendedor_id || 'sin_asignar'
    const nombre = v.vendedor?.nombre || 'Sin asignar'
    const acc = map.get(key) || {
      vendedor_id: v.vendedor_id, nombre, total: 0, num_ventas: 0,
      pos:  { total: 0, num_ventas: 0 },
      mesa: { total: 0, num_ventas: 0 },
    }
    const monto = parseFloat(v.total)
    acc.total += monto
    acc.num_ventas += 1
    const bucket = v.origen === 'mesa' ? acc.mesa : acc.pos
    bucket.total += monto
    bucket.num_ventas += 1
    map.set(key, acc)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

const obtenerTurnoAbierto = async (select) => {
  const { data, error } = await supabase
    .from('br_turnos_caja')
    .select(select)
    .eq('estado', 'abierto')
    .order('apertura_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// ── GET /api/panaderia/caja/turno-activo
const turnoActivo = async (req, res, next) => {
  try {
    const data = await obtenerTurnoAbierto(
      `*, usuario_apertura:usuario_apertura_id(id, nombre, rol), usuario_cierre:usuario_cierre_id(id, nombre)`
    );
    res.set('Cache-Control', 'no-store');
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/turno-pendiente  (turno abierto olvidado, > 20h sin cerrar)
const turnoPendiente = async (req, res, next) => {
  try {
    const limite = new Date(Date.now() - TURNO_LIMITE_HORAS_OLVIDADO * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('br_turnos_caja')
      .select(`id, fecha, estado, monto_inicial, apertura_at, usuario_apertura:usuario_apertura_id(id, nombre)`)
      .eq('estado', 'abierto')
      .lt('apertura_at', limite)
      .order('apertura_at', { ascending: true })
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
    const { monto_final_real, notas_cierre } = req.body;

    // Turno compartido del negocio (no filtra por usuario ni por fecha calendario —
    // ver nota de horario 1pm-5am arriba)
    const turno = await obtenerTurnoAbierto('*, usuario_apertura:usuario_apertura_id(id, nombre, rol)');

    if (!turno) {
      return res.status(404).json({ error: 'No hay una caja abierta' });
    }

    // Ventas de todo el turno (desde que se abrió hasta ahora), no por fecha calendario —
    // un turno de 1pm a 5am cruza medianoche y rangoDiaColombia() perdía la mitad.
    const desde = turno.apertura_at;
    const hasta = new Date().toISOString();

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
      .select('total, metodo_pago, estado, monto_efectivo, monto_transferencia, vendedor_id, origen, vendedor:vendedor_id(nombre)')
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

    // Desglose por vendedor, separado por módulo (POS/Mesas) — control de quién vendió
    // qué y desde dónde al cerrar el día.
    const desglosePorVendedor = construirDesgloseVendedores(ventas);

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

    const desglose_estaciones = await obtenerDesgloseEstaciones(desde, hasta)

    res.json({ ...turnoCerrado, diferencia, efectivo_esperado: efectivoEsperado, desglose_vendedores: desglosePorVendedor, desglose_estaciones });
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
      .select('total, metodo_pago, estado, monto_efectivo, monto_transferencia, vendedor_id, origen, vendedor:vendedor_id(nombre)')
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

    const desglose_estaciones = await obtenerDesgloseEstaciones(desde, hasta);
    const desglose_vendedores = construirDesgloseVendedores(ventas);

    res.json({ ...turnoCerrado, diferencia, efectivo_esperado: efectivoEsperado, desglose_estaciones, desglose_vendedores });
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
// Caja compartida: hay un solo turno abierto por negocio a la vez (br_ es single-tenant,
// garantizado por abrirCaja) — sin filtrar por fecha calendario, mismo criterio que
// turnoActivo (ver nota de horario 1pm-5am arriba).
const turnoNegocioActivo = async (req, res, next) => {
  try {
    const data = await obtenerTurnoAbierto('id, estado');
    res.set('Cache-Control', 'no-store');
    res.json(data || null);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/ventas-turno
// Caja compartida: el turno es del negocio, así que este resumen es de TODAS las
// ventas del turno en curso (desde que se abrió, no por fecha calendario) — no solo
// las del usuario que consulta.
const ventasTurno = async (req, res, next) => {
  try {
    const turno = await obtenerTurnoAbierto('apertura_at');
    if (!turno) {
      return res.json({ total_ventas: 0, num_ventas: 0, efectivo: 0, transferencias: 0, credito: 0, ticket_promedio: 0, desglose_vendedores: [] });
    }

    const { data } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado, monto_efectivo, monto_transferencia, vendedor_id, origen, vendedor:vendedor_id(nombre)')
      .eq('estado', 'completada')
      .gte('fecha', turno.apertura_at);

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
      desglose_vendedores: construirDesgloseVendedores(ventas),
    });
  } catch (err) { next(err); }
};

// ── GET /berlin/caja/turnos/:id/desglose
// Reconstruye el detalle (ventas por cajero + despacho por área) de CUALQUIER turno, para
// reimprimir cierres históricos con el mismo formato que el cierre en vivo. El detalle no se
// guarda al cerrar: se recalcula desde las ventas del turno.
//
// Los turnos se cerraron con dos reglas distintas y se prueban las dos:
//   'turno' → ventas desde la apertura hasta el cierre (cerrarCaja, el cierre normal)
//   'dia'   → ventas del día calendario del turno (cerrarTurnoHistorico, cierre manual de un turno viejo)
// Se usa la regla cuyo total Y número de ventas coinciden con lo que quedó guardado al cerrar ese
// turno. Si ninguna coincide (p. ej. se anuló una venta después) se devuelve la regla 'turno' con
// exacto=false y las diferencias, para que el reporte lo avise en vez de mostrar un dato dudoso.
const ventasDeRango = async (desde, hasta) => {
  const { data } = await supabase
    .from('br_ventas')
    .select('total, vendedor_id, origen, vendedor:vendedor_id(nombre)')
    .eq('estado', 'completada')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  return data || [];
};

const desgloseTurno = async (req, res, next) => {
  try {
    const isAdmin = ['super_admin', 'admin', 'admin_berlin'].includes(req.user.rol);
    const { data: turno, error } = await supabase
      .from('br_turnos_caja').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
    // Mismo criterio que el historial: un no-admin solo ve los turnos que él abrió
    if (!isAdmin && turno.usuario_apertura_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este turno' });
    }

    const cerrado = turno.estado === 'cerrado';
    const candidatos = [
      { regla: 'turno', desde: turno.apertura_at, hasta: turno.cierre_at || new Date().toISOString() },
      { regla: 'dia',   ...rangoDiaColombia(turno.fecha) },
    ];

    let elegido = null;
    let primero = null;
    for (const c of candidatos) {
      const ventas = await ventasDeRango(c.desde, c.hasta);
      const total  = ventas.reduce((s, v) => s + parseFloat(v.total), 0);
      const r = { ...c, ventas, total };
      if (!primero) primero = r;
      const coincide = !cerrado
        || (Math.abs(total - Number(turno.total_ventas)) < 0.5 && ventas.length === Number(turno.num_ventas));
      if (coincide) { elegido = r; break; }
    }
    const usado = elegido || primero;

    res.json({
      exacto:               !!elegido,
      regla:                usado.regla,
      total_guardado:       Number(turno.total_ventas),
      total_reconstruido:   usado.total,
      num_guardado:         Number(turno.num_ventas),
      num_reconstruido:     usado.ventas.length,
      desglose_vendedores:  construirDesgloseVendedores(usado.ventas),
      desglose_estaciones:  await obtenerDesgloseEstaciones(usado.desde, usado.hasta),
    });
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/caja/desglose-estaciones
// Vista en vivo (turno abierto, desde apertura_at hasta ahora) — usada por el
// cierre parcial en el panel. El cierre real recalcula esto mismo con el rango
// exacto de cada cierre (ver cerrarCaja/cerrarTurnoHistorico).
const desgloseEstacionesTurno = async (req, res, next) => {
  try {
    const turno = await obtenerTurnoAbierto('apertura_at');
    if (!turno) return res.json([]);
    const data = await obtenerDesgloseEstaciones(turno.apertura_at, new Date().toISOString());
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) { next(err); }
};

module.exports = {
  turnoActivo, turnoPendiente, turnoNegocioActivo, obtenerCajaHoy, abrirCaja,
  cerrarCaja, cerrarTurnoHistorico, historial, ventasTurno, desgloseEstacionesTurno, desgloseTurno,
};
