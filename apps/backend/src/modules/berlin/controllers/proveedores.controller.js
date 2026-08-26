const supabase = require('../../../config/supabase');

// ── Proveedores CRUD ──────────────────────────────────────────
const listar = async (req, res, next) => {
  try {
    const { q } = req.query;
    let query = supabase.from('br_proveedores').select('*').eq('activo', true).order('nombre');
    if (q) query = query.or(`nombre.ilike.%${q}%,nit.ilike.%${q}%,contacto.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const { nombre, nit, contacto, telefono, email, direccion, notas } = req.body;
    const { data, error } = await supabase
      .from('br_proveedores')
      .insert({ nombre, nit, contacto, telefono, email, direccion, notas, activo: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizar = async (req, res, next) => {
  try {
    const { nombre, nit, contacto, telefono, email, direccion, notas, activo } = req.body;
    const { data, error } = await supabase
      .from('br_proveedores')
      .update({ nombre, nit, contacto, telefono, email, direccion, notas, activo })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

// ── Facturas de proveedores ───────────────────────────────────
const listarFacturas = async (req, res, next) => {
  try {
    const { proveedor_id, estado, limit = 50 } = req.query;
    let q = supabase
      .from('br_facturas_proveedor')
      .select('*, proveedor:proveedor_id(id, nombre), items:br_factura_proveedor_items(*)')
      .order('fecha', { ascending: false })
      .limit(parseInt(limit));
    if (proveedor_id) q = q.eq('proveedor_id', proveedor_id);
    if (estado)       q = q.eq('estado', estado);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const buscarItems = async (req, res, next) => {
  try {
    const { q = '', limit = 10 } = req.query;
    const like = `%${q}%`;
    const [{ data: prods }, { data: insumos }] = await Promise.all([
      supabase.from('br_productos')
        .select('id, nombre, precio_venta, stock_actual, tipo_producto')
        .ilike('nombre', like).eq('activo', true).limit(parseInt(limit)),
      supabase.from('br_insumos')
        .select('id, nombre, costo_unitario, stock_actual, unidad_medida')
        .ilike('nombre', like).eq('activo', true).limit(parseInt(limit)),
    ]);
    const resultados = [
      ...(prods || []).map(p => ({ ...p, _tipo: 'producto', precio_ref: p.precio_venta })),
      ...(insumos || []).map(i => ({ ...i, _tipo: 'insumo', precio_ref: i.costo_unitario })),
    ];
    res.json(resultados);
  } catch (err) { next(err); }
};

// ── Pedidos a proveedores ─────────────────────────────────────
const listarPedidos = async (req, res, next) => {
  try {
    const { estado } = req.query;
    let q = supabase
      .from('br_pedidos_proveedor')
      .select('*, proveedor:proveedor_id(id, nombre, telefono)')
      .order('created_at', { ascending: false });
    if (estado) q = q.eq('estado', estado);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const crearPedido = async (req, res, next) => {
  try {
    const {
      proveedor_id, numero_pedido, descripcion, estado = 'pendiente',
      fecha_pedido, fecha_entrega_esperada, items = [], valor_total, notas,
    } = req.body;
    const { data, error } = await supabase
      .from('br_pedidos_proveedor')
      .insert({
        proveedor_id, numero_pedido, descripcion, estado,
        fecha_pedido: fecha_pedido || new Date().toISOString().split('T')[0],
        fecha_entrega_esperada: fecha_entrega_esperada || null,
        items, valor_total: parseFloat(valor_total) || 0, notas,
        registrado_por: req.user.id,
      })
      .select('*, proveedor:proveedor_id(id, nombre)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const eliminarPedido = async (req, res, next) => {
  try {
    const { error } = await supabase.from('br_pedidos_proveedor').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const actualizarPedido = async (req, res, next) => {
  try {
    const {
      estado, fecha_recibido, fecha_entrega_esperada,
      descripcion, notas, items, valor_total,
    } = req.body;
    const updates = {};
    if (estado              !== undefined) updates.estado               = estado;
    if (fecha_recibido      !== undefined) updates.fecha_recibido       = fecha_recibido;
    if (fecha_entrega_esperada !== undefined) updates.fecha_entrega_esperada = fecha_entrega_esperada;
    if (descripcion         !== undefined) updates.descripcion          = descripcion;
    if (notas               !== undefined) updates.notas                = notas;
    if (items               !== undefined) updates.items                = items;
    if (valor_total         !== undefined) updates.valor_total          = parseFloat(valor_total) || 0;

    const { data, error } = await supabase
      .from('br_pedidos_proveedor')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, proveedor:proveedor_id(id, nombre)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

// ── Compras (facturas mejoradas) ──────────────────────────────
const crearFactura = async (req, res, next) => {
  try {
    const { proveedor_id, numero_factura, fecha, fecha_vencimiento, tipo_cuenta = 'pagar', iva_pct = 0, items = [], notas, estado: estadoParam } = req.body;
    const hoy = new Date().toISOString().split('T')[0];
    // 'pagada' en tipo_cuenta = factura ya pagada al recibirla
    const estadoFinal = estadoParam || (tipo_cuenta === 'pagada' ? 'pagada' : 'pendiente');
    const tipoCuentaReal = tipo_cuenta === 'pagada' ? 'pagar' : tipo_cuenta;

    const subtotal = items.reduce((s, i) => s + parseFloat(i.precio_unitario) * parseFloat(i.cantidad), 0);
    const iva      = subtotal * (parseFloat(iva_pct) || 0) / 100;
    const total    = subtotal + iva;

    // Obtener turno activo
    const { data: turno } = await supabase
      .from('br_turnos_caja')
      .select('id')
      .eq('fecha', fecha || hoy)
      .eq('estado', 'abierto')
      .maybeSingle();

    const { data: factura, error: fErr } = await supabase
      .from('br_facturas_proveedor')
      .insert({
        proveedor_id, numero_factura,
        fecha:            fecha || hoy,
        fecha_vencimiento: fecha_vencimiento || null,
        tipo_cuenta:      tipoCuentaReal,
        subtotal,
        iva,
        total,
        notas,
        estado:          estadoFinal,
        turno_id:        turno?.id ?? null,
        registrado_por:  req.user.id,
      })
      .select()
      .single();
    if (fErr) throw fErr;

    // Insertar items y actualizar stock
    if (items.length > 0) {
      const rows = items.map(i => ({
        factura_id:      factura.id,
        descripcion:     i.descripcion,
        cantidad:        parseFloat(i.cantidad),
        precio_unitario: parseFloat(i.precio_unitario),
        precio_venta:    parseFloat(i.precio_venta)   || 0,
        subtotal:        parseFloat(i.precio_unitario) * parseFloat(i.cantidad),
        insumo_id:       i.insumo_id   || null,
        producto_id:     i.producto_id || null,
      }));
      await supabase.from('br_factura_proveedor_items').insert(rows);

      // Actualizar stock de insumos y productos vinculados
      for (const item of items) {
        if (item.insumo_id) {
          const { data: ins } = await supabase
            .from('br_insumos').select('stock_actual').eq('id', item.insumo_id).single();
          if (ins) {
            await supabase.from('br_insumos')
              .update({ stock_actual: parseFloat(ins.stock_actual) + parseFloat(item.cantidad) })
              .eq('id', item.insumo_id);
          }
        }
        // Productos terminados recibidos de proveedor (compra_venta) → sumar a inventario
        if (item.producto_id) {
          await supabase.rpc('br_ajustar_stock_producto', {
            p_id:    item.producto_id,
            p_delta: parseFloat(item.cantidad),
          });
        }
      }
    }

    // Libro contable
    await supabase.from('br_movimientos_contables').insert({
      tipo:            'egreso',
      categoria:       'compra_proveedor',
      concepto:        `Factura proveedor ${numero_factura || factura.id.slice(0, 8)}`,
      monto:           total,
      metodo_pago:     'efectivo',
      referencia_tipo: 'factura_proveedor',
      referencia_id:   factura.id,
      turno_id:        turno?.id ?? null,
      registrado_por:  req.user.id,
    });

    res.status(201).json(factura);
  } catch (err) { next(err); }
};

const actualizarFactura = async (req, res, next) => {
  try {
    const { estado, notas, fecha_vencimiento, numero_factura, fecha, proveedor_id, iva_pct, items } = req.body;
    const updates = {};
    if (estado !== undefined)             updates.estado = estado;
    if (notas !== undefined)              updates.notas = notas;
    if (numero_factura !== undefined)     updates.numero_factura = numero_factura;
    if (fecha_vencimiento !== undefined)  updates.fecha_vencimiento = fecha_vencimiento || null;
    if (fecha !== undefined)             updates.fecha = fecha;
    if (proveedor_id !== undefined)      updates.proveedor_id = proveedor_id;

    // Si vienen items, reemplazarlos y recalcular totales
    if (Array.isArray(items) && items.length > 0) {
      const subtotal = items.reduce((s, i) => s + parseFloat(i.precio_unitario || 0) * parseFloat(i.cantidad || 1), 0);
      const iva      = subtotal * (parseFloat(iva_pct || '0')) / 100;
      updates.subtotal = subtotal;
      updates.iva      = iva;
      updates.total    = subtotal + iva;

      await supabase.from('br_factura_proveedor_items').delete().eq('factura_id', req.params.id);
      const rows = items.map(i => ({
        factura_id:      req.params.id,
        descripcion:     i.descripcion || '—',
        cantidad:        parseFloat(i.cantidad) || 1,
        precio_unitario: parseFloat(i.precio_unitario) || 0,
        subtotal:        parseFloat(i.precio_unitario || 0) * parseFloat(i.cantidad || 1),
        insumo_id:       i.insumo_id   || null,
        producto_id:     i.producto_id || null,
      }));
      if (rows.length > 0) await supabase.from('br_factura_proveedor_items').insert(rows);
    }

    const { data, error } = await supabase
      .from('br_facturas_proveedor')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, proveedor:proveedor_id(id, nombre), items:br_factura_proveedor_items(*)')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const eliminarFactura = async (req, res, next) => {
  try {
    await supabase.from('br_factura_proveedor_items').delete().eq('factura_id', req.params.id);
    const { error } = await supabase.from('br_facturas_proveedor').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const pagarFactura = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_facturas_proveedor')
      .update({ estado: 'pagada' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const listarCuentasPorPagar = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_facturas_proveedor')
      .select('*, proveedor:proveedor_id(id, nombre, telefono)')
      .eq('estado', 'pendiente')
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const listarCuentasPorCobrar = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_ventas')
      .select('id, created_at, total, saldo_pendiente, metodo_pago, cliente:cliente_id(id, nombre, telefono)')
      .eq('metodo_pago', 'credito')
      .gt('saldo_pendiente', 0)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

module.exports = {
  listar, crear, actualizar,
  listarFacturas, crearFactura, actualizarFactura, eliminarFactura, pagarFactura,
  buscarItems,
  listarCuentasPorPagar, listarCuentasPorCobrar,
  listarPedidos, crearPedido, actualizarPedido, eliminarPedido,
};
