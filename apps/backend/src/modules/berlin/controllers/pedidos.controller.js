const supabase = require('../../../config/supabase');

const selectFull = `
  id, numero_pedido, fecha_pedido, fecha_entrega, hora_entrega,
  subtotal, descuento, total, anticipo, saldo, metodo_anticipo,
  estado, tipo, es_domicilio, direccion_entrega, referencia_dir,
  notas, notas_produccion, created_at,
  cliente:cliente_id(id, nombre, telefono, whatsapp, direccion, barrio),
  vendedor:vendedor_id(id, nombre),
  items:br_pedido_items(
    id, cantidad, precio_unitario, subtotal, personalizacion, imagen_ref_url,
    producto:producto_id(id, nombre, unidad_venta, imagen_url)
  )
`;

const listar = async (req, res, next) => {
  try {
    const { estado, tipo, desde, hasta, limit = 30, offset = 0 } = req.query;
    let q = supabase.from('br_pedidos').select(selectFull, { count: 'exact' })
      .order('fecha_entrega', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (estado) q = q.eq('estado', estado);
    if (tipo)   q = q.eq('tipo', tipo);
    if (desde)  q = q.gte('fecha_entrega', desde);
    if (hasta)  q = q.lte('fecha_entrega', hasta);

    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ data: data || [], total: count });
  } catch (err) { next(err); }
};

const proximos = async (req, res, next) => {
  try {
    const { data } = await supabase.from('v_pedidos_proximos').select('*').limit(20);
    res.json(data || []);
  } catch (err) { next(err); }
};

const obtener = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_pedidos').select(selectFull).eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const {
      cliente_id, items, fecha_entrega, hora_entrega,
      tipo = 'normal', es_domicilio = false,
      direccion_entrega, referencia_dir,
      anticipo = 0, metodo_anticipo,
      notas, notas_produccion, descuento = 0,
    } = req.body;

    if (!cliente_id)    return res.status(400).json({ error: 'cliente_id requerido' });
    if (!fecha_entrega) return res.status(400).json({ error: 'fecha_entrega requerida' });
    if (!items?.length) return res.status(400).json({ error: 'Se requiere al menos un ítem' });

    const subtotal = items.reduce((s, i) =>
      s + parseFloat(i.cantidad) * parseFloat(i.precio_unitario), 0);
    const total = subtotal - parseFloat(descuento);

    // Número de pedido
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const { count } = await supabase
      .from('br_pedidos').select('id', { count: 'exact', head: true });
    const num = ((count || 0) + 1).toString().padStart(4, '0');
    const numero_pedido = `PED-${fecha}-${num}`;

    const { data: pedido, error } = await supabase.from('br_pedidos').insert({
      numero_pedido, cliente_id, vendedor_id: req.user.id,
      fecha_entrega, hora_entrega, tipo, es_domicilio,
      subtotal, descuento: parseFloat(descuento), total,
      anticipo: parseFloat(anticipo), metodo_anticipo,
      direccion_entrega, referencia_dir, notas, notas_produccion,
    }).select().single();

    if (error) throw error;

    const itemsToInsert = items.map(i => ({
      pedido_id:       pedido.id,
      producto_id:     i.producto_id,
      cantidad:        parseFloat(i.cantidad),
      precio_unitario: parseFloat(i.precio_unitario),
      subtotal:        parseFloat(i.cantidad) * parseFloat(i.precio_unitario),
      personalizacion: i.personalizacion || null,
      imagen_ref_url:  i.imagen_ref_url  || null,
    }));

    await supabase.from('br_pedido_items').insert(itemsToInsert);

    // Crear alerta
    await supabase.from('alertas').insert({
      tipo:        'pedido',
      nivel:       'info',
      titulo:      `Nuevo pedido ${numero_pedido}`,
      descripcion: `Entrega: ${fecha_entrega}. Total: $${total.toLocaleString('es-CO')}`,
      referencia_id: pedido.id,
    });

    res.status(201).json(pedido);
  } catch (err) { next(err); }
};

const actualizar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const campos = req.body;
    delete campos.id; delete campos.numero_pedido; delete campos.saldo;

    const { data, error } = await supabase
      .from('br_pedidos').update(campos).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const cambiarEstado = async (req, res, next) => {
  try {
    const { estado } = req.body;
    const estadosValidos = ['pendiente','confirmado','en_produccion','listo','despachado','entregado','cancelado'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
    }

    const { data } = await supabase.from('br_pedidos')
      .update({ estado }).eq('id', req.params.id).select('numero_pedido, estado').single();

    // Crear alerta cuando esté listo
    if (estado === 'listo') {
      await supabase.from('alertas').insert({
        tipo: 'pedido', nivel: 'info',
        titulo: `Pedido ${data.numero_pedido} listo para entregar`,
        referencia_id: req.params.id,
      });
    }

    res.json({ ok: true, data });
  } catch (err) { next(err); }
};

const registrarAnticipo = async (req, res, next) => {
  try {
    const { monto, metodo } = req.body;
    const { data: pedido } = await supabase
      .from('br_pedidos').select('anticipo, total').eq('id', req.params.id).single();

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const nuevo_anticipo = parseFloat(pedido.anticipo) + parseFloat(monto);
    if (nuevo_anticipo > parseFloat(pedido.total)) {
      return res.status(400).json({ error: 'El anticipo no puede superar el total' });
    }

    await supabase.from('br_pedidos').update({
      anticipo: nuevo_anticipo,
      metodo_anticipo: metodo,
      ...(nuevo_anticipo >= pedido.total ? { estado: 'confirmado' } : {}),
    }).eq('id', req.params.id);

    res.json({ ok: true, nuevo_anticipo, saldo: pedido.total - nuevo_anticipo });
  } catch (err) { next(err); }
};

module.exports = { listar, proximos, obtener, crear, actualizar, cambiarEstado, registrarAnticipo };
