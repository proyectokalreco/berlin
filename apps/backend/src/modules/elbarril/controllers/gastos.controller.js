const supabase = require('../../../config/supabase');

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
    const hoy   = new Date().toISOString().split('T')[0];
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
    const hoy = new Date().toISOString().split('T')[0];

    // Obtener turno activo del día
    const { data: turno } = await supabase
      .from('br_turnos_caja')
      .select('id')
      .eq('fecha', hoy)
      .eq('estado', 'abierto')
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
    const { error } = await supabase.from('br_gastos').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = { listar, resumen, crear, eliminar };
