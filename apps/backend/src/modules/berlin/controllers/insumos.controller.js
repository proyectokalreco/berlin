// ============================================================
// insumos.controller.js
// ============================================================
const supabase = require('../../../config/supabase');

const listar = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_insumos')
      .select('*').eq('activo', true).order('nombre');
    res.json(data || []);
  } catch (err) { next(err); }
};

const criticos = async (req, res, next) => {
  try {
    const { data } = await supabase.from('v_insumos_criticos').select('*');
    res.json(data || []);
  } catch (err) { next(err); }
};

const obtener = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_insumos').select('*').eq('id', req.params.id).single();
    if (!data) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_insumos').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizar = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_insumos')
      .update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const registrarEntrada = async (req, res, next) => {
  try {
    const { cantidad, costo_unitario, motivo = 'Compra' } = req.body;
    const { data: insumo } = await supabase.from('br_insumos').select('stock_actual').eq('id', req.params.id).single();
    const nuevo_stock = parseFloat(insumo.stock_actual) + parseFloat(cantidad);

    await supabase.from('br_insumos').update({
      stock_actual:  nuevo_stock,
      ...(costo_unitario ? { costo_unitario } : {}),
      updated_at: new Date(),
    }).eq('id', req.params.id);

    await supabase.from('br_movimientos_insumos').insert({
      insumo_id:  req.params.id,
      tipo:       'entrada',
      cantidad:   parseFloat(cantidad),
      saldo:      nuevo_stock,
      motivo,
      usuario_id: req.user.id,
    });

    res.json({ ok: true, stock_actual: nuevo_stock });
  } catch (err) { next(err); }
};

const ajustarStock = async (req, res, next) => {
  try {
    const { stock_real, motivo } = req.body;
    const { data: insumo } = await supabase.from('br_insumos').select('stock_actual').eq('id', req.params.id).single();
    const diferencia = parseFloat(stock_real) - parseFloat(insumo.stock_actual);

    await supabase.from('br_insumos').update({ stock_actual: parseFloat(stock_real), updated_at: new Date() }).eq('id', req.params.id);
    await supabase.from('br_movimientos_insumos').insert({
      insumo_id: req.params.id, tipo: 'ajuste', cantidad: diferencia,
      saldo: parseFloat(stock_real), motivo: motivo || 'Ajuste de inventario', usuario_id: req.user.id,
    });

    res.json({ ok: true, stock_actual: parseFloat(stock_real), diferencia });
  } catch (err) { next(err); }
};

const insumosCtrl = { listar, criticos, obtener, crear, actualizar, registrarEntrada, ajustarStock };

// ============================================================
// recetas.controller.js
// ============================================================
const listarR = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_recetas')
      .select(`*, producto:producto_id(id, nombre, imagen_url),
        ingredientes:br_receta_ingredientes(*, insumo:insumo_id(id, nombre, unidad_medida, costo_unitario))`)
      .eq('activo', true);
    res.json(data || []);
  } catch (err) { next(err); }
};

const obtenerR = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_recetas')
      .select(`*, producto:producto_id(*),
        ingredientes:br_receta_ingredientes(*, insumo:insumo_id(*))`)
      .eq('id', req.params.id).single();
    if (!data) return res.status(404).json({ error: 'Receta no encontrada' });
    res.json(data);
  } catch (err) { next(err); }
};

const crearR = async (req, res, next) => {
  try {
    const { ingredientes, ...recetaData } = req.body;
    const { data: receta, error } = await supabase.from('br_recetas').insert(recetaData).select().single();
    if (error) throw error;

    if (ingredientes?.length) {
      const items = ingredientes.map(i => ({ ...i, receta_id: receta.id }));
      await supabase.from('br_receta_ingredientes').insert(items);
    }

    await calcularYActualizarCosto(receta.id);
    res.status(201).json(receta);
  } catch (err) { next(err); }
};

const actualizarR = async (req, res, next) => {
  try {
    const { ingredientes, ...recetaData } = req.body;
    await supabase.from('br_recetas').update(recetaData).eq('id', req.params.id);

    if (ingredientes) {
      await supabase.from('br_receta_ingredientes').delete().eq('receta_id', req.params.id);
      await supabase.from('br_receta_ingredientes').insert(ingredientes.map(i => ({ ...i, receta_id: req.params.id })));
    }

    await calcularYActualizarCosto(req.params.id);
    const { data } = await supabase.from('br_recetas').select('*').eq('id', req.params.id).single();
    res.json(data);
  } catch (err) { next(err); }
};

const calcularCostoR = async (req, res, next) => {
  try {
    const costo = await calcularYActualizarCosto(req.params.id);
    res.json({ costo_calculado: costo });
  } catch (err) { next(err); }
};

async function calcularYActualizarCosto(recetaId) {
  const { data } = await supabase.from('br_receta_ingredientes')
    .select('cantidad, insumo:insumo_id(costo_unitario)').eq('receta_id', recetaId);
  const costo = (data || []).reduce((s, i) => s + parseFloat(i.cantidad) * parseFloat(i.insumo?.costo_unitario || 0), 0);
  await supabase.from('br_recetas').update({ costo_calculado: costo }).eq('id', recetaId);
  return costo;
}

const recetasCtrl = { listar: listarR, obtener: obtenerR, crear: crearR, actualizar: actualizarR, calcularCosto: calcularCostoR };

// ============================================================
// produccion.controller.js
// ============================================================
const listarP = async (req, res, next) => {
  try {
    const { fecha = new Date().toISOString().split('T')[0] } = req.query;
    const { data } = await supabase.from('br_plan_produccion')
      .select(`*, producto:producto_id(id, nombre, imagen_url, precio_venta),
        hornadas:br_hornadas(*), responsable:responsable_id(id, nombre)`)
      .eq('fecha', fecha).order('hora_inicio_plan');
    res.json(data || []);
  } catch (err) { next(err); }
};

const planHoy = async (req, res, next) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('br_plan_produccion')
      .select(`*, producto:producto_id(id, nombre, imagen_url),
        hornadas:br_hornadas(*)`)
      .eq('fecha', hoy).order('hora_inicio_plan');
    res.json(data || []);
  } catch (err) { next(err); }
};

const crearP = async (req, res, next) => {
  try {
    const payload = { ...req.body, responsable_id: req.body.responsable_id || req.user.id };
    const { data, error } = await supabase.from('br_plan_produccion').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizarP = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_plan_produccion')
      .update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const cambiarEstadoP = async (req, res, next) => {
  try {
    await supabase.from('br_plan_produccion').update({ estado: req.body.estado }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const registrarHornada = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_hornadas').insert({ plan_id: req.params.id, ...req.body }).select().single();
    if (error) throw error;
    // Actualizar cantidad producida en el plan
    const { data: hornadas } = await supabase.from('br_hornadas').select('cantidad').eq('plan_id', req.params.id).eq('estado', 'completada');
    const total = (hornadas || []).reduce((s, h) => s + h.cantidad, 0);
    await supabase.from('br_plan_produccion').update({ cantidad_producida: total }).eq('id', req.params.id);
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const reporteMermas = async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    let q = supabase.from('br_mermas').select(`*, producto:producto_id(id, nombre), registrado_por:registrado_por(id, nombre)`).order('fecha', { ascending: false });
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data } = await q;
    res.json(data || []);
  } catch (err) { next(err); }
};

const produccionCtrl = { listar: listarP, planHoy, crear: crearP, actualizar: actualizarP, cambiarEstado: cambiarEstadoP, registrarHornada, reporteMermas };

// ============================================================
// caja.controller.js
// ============================================================
const obtenerCajaHoy = async (req, res, next) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('br_caja').select('*').eq('fecha', hoy).single();
    res.json(data || null);
  } catch (err) { next(err); }
};

const abrirCaja = async (req, res, next) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { apertura = 0, notas } = req.body;

    const { data: existe } = await supabase.from('br_caja').select('id, estado').eq('fecha', hoy).single();
    if (existe?.estado === 'abierta') return res.status(400).json({ error: 'Caja ya abierta hoy' });

    const { data, error } = await supabase.from('br_caja').upsert({
      fecha: hoy, apertura, estado: 'abierta',
      usuario_apertura: req.user.id, hora_apertura: new Date(), notas,
    }, { onConflict: 'fecha' }).select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const cerrarCaja = async (req, res, next) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { cierre_declarado, notas } = req.body;
    const { data: caja } = await supabase.from('br_caja').select('*').eq('fecha', hoy).single();
    if (!caja) return res.status(404).json({ error: 'No hay caja abierta hoy' });

    const diferencia = parseFloat(cierre_declarado) - parseFloat(caja.total_efectivo || 0);
    const { data } = await supabase.from('br_caja').update({
      cierre_declarado: parseFloat(cierre_declarado), diferencia,
      estado: 'cerrada', usuario_cierre: req.user.id,
      hora_cierre: new Date(), notas,
    }).eq('fecha', hoy).select().single();

    res.json(data);
  } catch (err) { next(err); }
};

const historialCaja = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_caja').select('*').order('fecha', { ascending: false }).limit(30);
    res.json(data || []);
  } catch (err) { next(err); }
};

const cajaCtrl = { obtenerCajaHoy, abrirCaja, cerrarCaja, historial: historialCaja };

// ============================================================
// domicilios.controller.js
// ============================================================
const listarD = async (req, res, next) => {
  try {
    const { estado } = req.query;
    let q = supabase.from('br_domicilios').select(`*, domiciliario:domiciliario_id(id, nombre, telefono)`).order('hora_asignacion', { ascending: false });
    if (estado) q = q.eq('estado', estado);
    const { data } = await q;
    res.json(data || []);
  } catch (err) { next(err); }
};

const crearD = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_domicilios').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const cambiarEstadoD = async (req, res, next) => {
  try {
    const updates = { estado: req.body.estado };
    if (req.body.estado === 'en_camino')  updates.hora_salida  = new Date();
    if (req.body.estado === 'entregado')  updates.hora_entrega = new Date();
    await supabase.from('br_domicilios').update(updates).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const domiciliosCtrl = { listar: listarD, crear: crearD, cambiarEstado: cambiarEstadoD };

// ============================================================
// clientes.controller.js
// ============================================================
const listarC = async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query;
    let query = supabase.from('br_clientes').select('*').eq('activo', true).order('nombre').limit(parseInt(limit));
    if (q) query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`);
    const { data } = await query;
    res.json(data || []);
  } catch (err) { next(err); }
};

const crearC = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_clientes').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const obtenerC = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_clientes').select('*').eq('id', req.params.id).single();
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
};

const actualizarC = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_clientes').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const historialPedidos = async (req, res, next) => {
  try {
    const { data } = await supabase.from('br_pedidos')
      .select('numero_pedido, fecha_entrega, total, estado, tipo')
      .eq('cliente_id', req.params.id).order('fecha_pedido', { ascending: false }).limit(20);
    res.json(data || []);
  } catch (err) { next(err); }
};

const clientesCtrl = { listar: listarC, crear: crearC, obtener: obtenerC, actualizar: actualizarC, historialPedidos };

module.exports = insumosCtrl;
