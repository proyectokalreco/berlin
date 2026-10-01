const supabase = require('../../../config/supabase');
const { fechaColombia } = require('../../../utils/fecha');

const listar = async (req, res, next) => {
  try {
    const { categoria, desde, hasta, limit = 100 } = req.query;
    let q = supabase
      .from('br_gastos')
      .select('*, registrado_por_user:registrado_por(id, nombre)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (categoria) q = q.eq('categoria', categoria);
    if (desde)     q = q.gte('fecha', desde);
    if (hasta)     q = q.lte('fecha', hasta);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const resumen = async (req, res, next) => {
  try {
    const hoy   = fechaColombia(); // no toISOString(): después de las 7pm Colombia da el día siguiente
    const mes   = hoy.substring(0, 7); // YYYY-MM
    const { data: hoyData }  = await supabase.from('br_gastos').select('monto').eq('fecha', hoy);
    const { data: mesData }  = await supabase.from('br_gastos').select('monto,categoria').gte('fecha', `${mes}-01`).lte('fecha', hoy);
    const totalHoy = (hoyData  || []).reduce((s, g) => s + parseFloat(g.monto), 0);
    const totalMes = (mesData  || []).reduce((s, g) => s + parseFloat(g.monto), 0);
    const porCategoria = {};
    (mesData || []).forEach(g => {
      porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + parseFloat(g.monto);
    });
    res.json({ totalHoy, totalMes, porCategoria });
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const { categoria, concepto, monto, metodo_pago = 'efectivo', notas } = req.body;
    // Medios de pago válidos en Berlín: efectivo o pago electrónico ('transferencia' en BD).
    // Cualquier otro valor (p. ej. 'tarjeta') quedaría mal repartido entre los bolsillos del Libro Diario.
    if (!['efectivo', 'transferencia'].includes(metodo_pago)) {
      return res.status(400).json({ error: 'Método de pago no válido. Usa Efectivo o Pago Electrónico.' });
    }
    const hoy = fechaColombia();

    // Turno activo = el único turno abierto del negocio, sin filtrar por fecha: el negocio
    // opera de 1pm a 5am, así que pasada la medianoche (o las 7pm en UTC) el turno sigue siendo
    // el mismo aunque la fecha calendaria cambie. Mismo criterio que caja.controller.js
    // (obtenerTurnoAbierto). Si no se enlaza al turno, el cierre de caja no descuenta el gasto.
    const { data: turno } = await supabase
      .from('br_turnos_caja')
      .select('id')
      .eq('estado', 'abierto')
      .order('apertura_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from('br_gastos')
      .insert({
        categoria,
        concepto,
        monto: parseFloat(monto),
        metodo_pago,
        notas,
        fecha:          hoy,
        turno_id:       turno?.id ?? null,
        registrado_por: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    // Libro contable
    await supabase.from('br_movimientos_contables').insert({
      tipo:            'egreso',
      categoria:       'gasto',
      concepto:        `${categoria} — ${concepto}`,
      monto:           parseFloat(monto),
      metodo_pago,
      referencia_tipo: 'gasto',
      referencia_id:   data.id,
      turno_id:        turno?.id ?? null,
      registrado_por:  req.user.id,
    });

    // Actualizar total_gastos del turno si existe
    if (turno?.id) {
      await supabase.rpc('br_actualizar_totales_turno', {
        p_turno_id:   turno.id,
        p_monto:      parseFloat(monto),
        p_tipo:       'gasto',
        p_num_ventas: 0,
      });
    }

    res.status(201).json(data);
  } catch (err) { next(err); }
};

const eliminar = async (req, res, next) => {
  try {
    const { data: gasto, error: errGet } = await supabase
      .from('br_gastos')
      .select('id, monto, turno_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (errGet) throw errGet;
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    const { error } = await supabase.from('br_gastos').delete().eq('id', gasto.id);
    if (error) throw error;

    // El gasto también dejó un egreso en el Libro Diario: sin borrarlo, el Libro Diario y la
    // Gran Bolsa seguirían restando un gasto que ya no existe.
    const { error: errMov } = await supabase
      .from('br_movimientos_contables')
      .delete()
      .eq('referencia_tipo', 'gasto')
      .eq('referencia_id', gasto.id);
    if (errMov) console.error('[gastos.eliminar] no se pudo borrar el movimiento contable:', errMov.message);

    // Si el turno sigue abierto, descontar el gasto de su total (en turnos cerrados el total
    // ya quedó impreso en el cierre: no se reescribe).
    if (gasto.turno_id) {
      const { data: turno } = await supabase
        .from('br_turnos_caja').select('estado').eq('id', gasto.turno_id).maybeSingle();
      if (turno?.estado === 'abierto') {
        await supabase.rpc('br_actualizar_totales_turno', {
          p_turno_id:   gasto.turno_id,
          p_monto:      -parseFloat(gasto.monto),
          p_tipo:       'gasto',
          p_num_ventas: 0,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = { listar, resumen, crear, eliminar };
