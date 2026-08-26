const supabase = require('../../../config/supabase');
const { deducirInsumosReceta } = require('./helpers/deducirInsumosReceta');
const { fechaColombia, rangoDiaColombia } = require('../../../utils/fecha');

// ── GET /api/panaderia/ventas
const listar = async (req, res, next) => {
  try {
    const { fecha, desde, hasta, estado, cliente_id, metodo_pago, limit = 500, offset = 0 } = req.query;
    let query = supabase
      .from('br_ventas')
      .select(`
        id, numero_venta, fecha, total, subtotal, descuento,
        metodo_pago, estado, es_domicilio, notas,
        cliente:cliente_id(id, nombre, telefono),
        vendedor:vendedor_id(id, nombre),
        items:br_venta_items(cantidad, precio_unitario, subtotal, producto:producto_id(nombre))
      `, { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (fecha) {
      // Filtro por día exacto Colombia
      const { desde: desdeFecha, hasta: hastaFecha } = rangoDiaColombia(fecha);
      query = query.gte('fecha', desdeFecha).lte('fecha', hastaFecha);
    } else if (desde || hasta) {
      // Filtro por rango de fechas Colombia
      if (desde) {
        const { desde: desdeUTC } = rangoDiaColombia(desde);
        query = query.gte('fecha', desdeUTC);
      }
      if (hasta) {
        const { hasta: hastaUTC } = rangoDiaColombia(hasta);
        query = query.lte('fecha', hastaUTC);
      }
    }
    if (estado) query = query.eq('estado', estado);
    if (cliente_id) query = query.eq('cliente_id', cliente_id);
    if (metodo_pago) query = query.eq('metodo_pago', metodo_pago);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data || [], total: count ?? 0 });
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/ventas/:id
const obtener = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_ventas')
      .select(`
        *,
        cliente:cliente_id(*),
        vendedor:vendedor_id(id, nombre),
        items:br_venta_items(
          id, cantidad, precio_unitario, subtotal,
          producto:producto_id(id, nombre, unidad_venta, imagen_url)
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(data);
  } catch (err) { next(err); }
};

// ── POST /api/panaderia/ventas
const crear = async (req, res, next) => {
  try {
    const {
      cliente_id,
      items,          // [{ producto_id, cantidad, precio_unitario, descuento? }]
      metodo_pago = 'efectivo',
      descuento = 0,
      redondeo  = 0,  // ajuste por redondeo al multiplo de $50 mas cercano (COP)
      es_domicilio = false,
      notas,
      caja_id,
      idempotency_key,
    } = req.body;

    if (!items?.length) {
      return res.status(400).json({ error: 'Se requiere al menos un ítem' });
    }

    // Idempotencia: si ya existe una venta con este key, devolver la existente
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('br_ventas')
        .select('*, br_venta_items(*)')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle();
      if (existing) return res.status(200).json(existing);
    }

    // Calcular totales
    // redondeo puede ser positivo (se cobra un poco mas) o negativo (se cobra un poco menos)
    // para que el total siempre sea multiplo de $50 (moneda minima en Colombia)
    const subtotal  = items.reduce((s, i) => {
      const it_subtotal = parseFloat(i.cantidad) * parseFloat(i.precio_unitario);
      return s + it_subtotal - parseFloat(i.descuento || 0);
    }, 0);
    const redondeoVal = parseFloat(redondeo) || 0;
    const total       = subtotal - parseFloat(descuento) + redondeoVal;

    // Generar número de venta único usando fecha Colombia
    const hoy = fechaColombia();
    const { desde: desdeDia, hasta: hastaDia } = rangoDiaColombia(hoy);
    const fechaStr = hoy.replace(/-/g, '');
    const { count: ventasHoy } = await supabase
      .from('br_ventas')
      .select('*', { count: 'exact', head: true })
      .gte('fecha', desdeDia)
      .lte('fecha', hastaDia);
    // Añadir microsegundos al final para evitar colisiones bajo carga simultánea
    const seq  = ((ventasHoy || 0) + 1).toString().padStart(4, '0');
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const numero_venta = `VT-${fechaStr}-${seq}-${rand}`;

    const totalFinal = Math.max(0, total)

    // Insertar venta
    const { data: venta, error: ventaErr } = await supabase
      .from('br_ventas')
      .insert({
        numero_venta,
        cliente_id:      cliente_id || null,
        vendedor_id:     req.user.id,
        subtotal,
        descuento:       parseFloat(descuento),
        redondeo:        redondeoVal,
        total:           totalFinal,
        metodo_pago,
        es_domicilio,
        caja_id:         caja_id || null,
        notas,
        idempotency_key: idempotency_key || null,
        // Ventas a crédito inician con saldo_pendiente = total
        saldo_pendiente: metodo_pago === 'credito' ? totalFinal : null,
      })
      .select()
      .single();

    if (ventaErr) throw ventaErr;

    // Insertar items
    const itemsToInsert = items.map(i => ({
      venta_id:        venta.id,
      producto_id:     i.producto_id,
      cantidad:        parseFloat(i.cantidad),
      precio_unitario: parseFloat(i.precio_unitario),
      descuento:       parseFloat(i.descuento || 0),
      subtotal:        parseFloat(i.cantidad) * parseFloat(i.precio_unitario) - parseFloat(i.descuento || 0),
    }));

    const { error: itemsErr } = await supabase.from('br_venta_items').insert(itemsToInsert);
    if (itemsErr) throw itemsErr;

    // Actualizar stock: productos normales descuentan su stock_actual;
    // productos de categoría sin_stock_control (Preparaciones de Cafetería)
    // descuentan insumos de la receta en lugar del stock del producto.
    for (const item of items) {
      const { data: prod } = await supabase
        .from('br_productos')
        .select('categoria:categoria_id(sin_stock_control)')
        .eq('id', item.producto_id)
        .single();

      if (prod?.categoria?.sin_stock_control) {
        await deducirInsumosReceta(item.producto_id, parseFloat(item.cantidad));
      } else {
        await supabase.rpc('br_descontar_stock_producto', {
          p_producto_id: item.producto_id,
          p_cantidad:    parseFloat(item.cantidad),
        }); // ignoramos error de stock — no bloquear la venta
      }
    }

    // Actualizar caja del día
    if (caja_id) {
      await actualizarCaja(caja_id, total, metodo_pago);
    }

    // Si había una venta a crédito anterior con saldo_pendiente NULL (antes de migration 015),
    // ya fue corregida por la migration. Nuevas ventas crédito siempre tienen saldo_pendiente.

    res.status(201).json({ ...venta, items: itemsToInsert });
  } catch (err) { next(err); }
};

// ── POST /api/panaderia/ventas/:id/anular
// Solo admin_berlin / admin / super_admin
const anular = async (req, res, next) => {
  try {
    const { motivo } = req.body;

    if (!['super_admin', 'admin', 'admin_berlin'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'Solo el administrador puede anular facturas' });
    }

    // Cargar venta completa con items
    const { data: venta, error: ventaErr } = await supabase
      .from('br_ventas')
      .select(`
        id, numero_venta, fecha, total, subtotal, descuento, metodo_pago, estado, vendedor_id, notas,
        cliente:cliente_id(id, nombre),
        vendedor:vendedor_id(id, nombre),
        items:br_venta_items(
          id, cantidad, precio_unitario, subtotal, descuento, producto_id,
          producto:producto_id(id, nombre, tipo_producto, categoria:categoria_id(sin_stock_control))
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (ventaErr || !venta) return res.status(404).json({ error: 'Venta no encontrada' });
    if (venta.estado === 'anulada') return res.status(400).json({ error: 'Factura ya fue anulada' });

    const nota = motivo || `Anulada por ${req.user.nombre || 'Admin'} — ${fechaColombia()}`;

    // 1. Marcar venta como anulada
    await supabase.from('br_ventas')
      .update({ estado: 'anulada', notas: nota })
      .eq('id', req.params.id);

    // 2. Restaurar stock de productos normales
    // sin_stock_control: no restauramos insumos (reversión de receta es compleja)
    for (const item of venta.items || []) {
      const sinControl = item.producto?.categoria?.sin_stock_control;
      if (!sinControl) {
        const { data: prod } = await supabase
          .from('br_productos').select('stock_actual').eq('id', item.producto_id).single();
        if (prod) {
          await supabase.from('br_productos')
            .update({ stock_actual: (parseFloat(prod.stock_actual) || 0) + parseFloat(item.cantidad) })
            .eq('id', item.producto_id);
        }
      }
    }

    // 3. Movimiento contable de auditoría (excluido de KPIs — solo trazabilidad)
    const hoy = fechaColombia();
    await supabase.from('br_movimientos_contables').insert({
      fecha:           hoy,
      tipo:            'egreso',
      categoria:       'anulacion_venta',
      concepto:        `Anulación ${venta.numero_venta} — ${nota}`,
      monto:           parseFloat(venta.total),
      metodo_pago:     venta.metodo_pago || 'efectivo',
      referencia_tipo: 'venta',
      referencia_id:   venta.id,
      registrado_por:  req.user.id,
    });

    res.json({ ok: true, message: 'Factura anulada correctamente', venta: { ...venta, notas: nota } });
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/ventas/resumen
const resumenDia = async (req, res, next) => {
  try {
    const fecha = req.query.fecha || fechaColombia();
    const { desde, hasta } = rangoDiaColombia(fecha);
    const { data } = await supabase
      .from('br_ventas')
      .select('total, metodo_pago, estado')
      .gte('fecha', desde)
      .lte('fecha', hasta);

    const completadas = (data || []).filter(v => v.estado === 'completada');
    const totalVentas = completadas.reduce((s, v) => s + parseFloat(v.total), 0);
    const resumen = {
      total_ventas:       totalVentas,
      num_ventas:         completadas.length,
      efectivo:           completadas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + parseFloat(v.total), 0),
      transferencias:     completadas.filter(v => v.metodo_pago === 'transferencia').reduce((s, v) => s + parseFloat(v.total), 0),
      qr:                 completadas.filter(v => v.metodo_pago?.includes('qr')).reduce((s, v) => s + parseFloat(v.total), 0),
      credito:            completadas.filter(v => v.metodo_pago === 'credito').reduce((s, v) => s + parseFloat(v.total), 0),
      ticket_promedio:    completadas.length > 0 ? totalVentas / completadas.length : 0,
    };
    res.json(resumen);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/reportes/ventas-dia
// Retorna transacciones individuales del día: ventas + entregas de encargos/separes
const reporteDia = async (req, res, next) => {
  try {
    const fecha = req.query.fecha || fechaColombia();
    const { desde, hasta } = rangoDiaColombia(fecha);

    const [{ data: ventas, error }, { data: contables }] = await Promise.all([
      supabase
        .from('br_ventas')
        .select(`
          id, numero_venta, fecha, total, metodo_pago, estado, saldo_pendiente,
          cliente:cliente_id(id, nombre),
          vendedor:vendedor_id(id, nombre),
          items:br_venta_items(
            cantidad, precio_unitario, subtotal,
            producto:producto_id(nombre)
          )
        `)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .eq('estado', 'completada')
        .order('fecha', { ascending: false }),
      supabase
        .from('br_movimientos_contables')
        .select('id, fecha, concepto, monto, categoria, created_at, registrado_por:usuarios(id, nombre)')
        .eq('fecha', fecha)
        .in('categoria', ['encargo_entregado', 'anticipo_encargo', 'separe_entregado', 'anticipo_separe']),
    ]);

    if (error) throw error;

    // Adaptar movimientos contables al shape de VentaDia
    const extras = (contables || []).map(c => ({
      id:              c.id,
      numero_venta:    c.concepto || c.categoria,
      fecha:           c.created_at,
      total:           c.monto,
      metodo_pago:     c.categoria.includes('separe') ? 'separe' : 'encargo',
      estado:          'completada',
      saldo_pendiente: 0,
      cliente:         null,
      vendedor:        c.registrado_por,
      items:           [],
      _source:         'contable',
      _categoria:      c.categoria,
    }));

    const resultado = [...(ventas || []), ...extras].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );

    res.json(resultado);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/reportes/ventas-dia-productos
// Retorna ventas del día agrupadas por producto (para dashboard/planilla)
const reporteDiaProductos = async (req, res, next) => {
  try {
    const fecha = req.query.fecha || fechaColombia();
    const { desde, hasta } = rangoDiaColombia(fecha);

    const { data: ventas } = await supabase
      .from('br_ventas')
      .select('id')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .eq('estado', 'completada');

    if (!ventas?.length) return res.json([]);

    const { data: items } = await supabase
      .from('br_venta_items')
      .select('cantidad, precio_unitario, producto:producto_id(nombre)')
      .in('venta_id', ventas.map(v => v.id));

    const byProduct = {};
    (items || []).forEach(item => {
      const nombre = item.producto?.nombre ?? 'Producto';
      if (!byProduct[nombre]) byProduct[nombre] = { nombre, cantidad: 0, total: 0 };
      byProduct[nombre].cantidad += parseFloat(item.cantidad);
      byProduct[nombre].total   += parseFloat(item.cantidad) * parseFloat(item.precio_unitario);
    });

    res.json(Object.values(byProduct).sort((a, b) => b.total - a.total));
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/reportes/ventas-mes
const reporteMes = async (req, res, next) => {
  try {
    const hoyCol = fechaColombia();
    const year  = req.query.year  || hoyCol.substring(0, 4);
    const month = req.query.month || parseInt(hoyCol.substring(5, 7));
    // Rango completo del mes en UTC (Colombia)
    const { desde, hasta } = (() => {
      const y = parseInt(year), m = parseInt(month);
      const ini = new Date(Date.UTC(y, m - 1, 1, 5, 0, 0));
      const fin = new Date(Date.UTC(y, m, 1, 4, 59, 59, 999));
      return { desde: ini.toISOString(), hasta: fin.toISOString() };
    })();

    const { data } = await supabase
      .from('br_ventas')
      .select('fecha, total, metodo_pago, estado')
      .gte('fecha', desde).lte('fecha', hasta)
      .eq('estado', 'completada');

    // Agrupar por día
    const byDay = {};
    (data || []).forEach(v => {
      const d = v.fecha.split('T')[0];
      if (!byDay[d]) byDay[d] = { fecha: d, total: 0, num: 0 };
      byDay[d].total += parseFloat(v.total);
      byDay[d].num++;
    });

    res.json({
      dias:         Object.values(byDay).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      total_mes:    (data || []).reduce((s, v) => s + parseFloat(v.total), 0),
      num_ventas:   (data || []).length,
    });
  } catch (err) { next(err); }
};

// Helper interno
async function actualizarCaja(cajaId, total, metodo_pago) {
  if (metodo_pago === 'credito') {
    // Crédito: suma a total_ventas, num_ventas y total_credito
    // pero NO a efectivo/transferencia — el dinero no entra a caja de forma inmediata
    await supabase.rpc('br_incrementar_caja_credito', {
      p_caja_id: cajaId,
      p_valor:   total,
    })
    return
  }

  const campo = metodo_pago === 'efectivo' ? 'total_efectivo'
    : metodo_pago === 'transferencia'      ? 'total_transferencias'
    : metodo_pago.includes('qr')           ? 'total_qr'
    : 'total_efectivo';

  // Supabase RPC → usar destructuring, no .catch()
  await supabase.rpc('br_incrementar_caja', {
    p_caja_id: cajaId,
    p_campo:   campo,
    p_valor:   total,
  }); // ignoramos error de caja — no bloquear la venta
}

module.exports = { listar, obtener, crear, anular, resumenDia, reporteDia, reporteDiaProductos, reporteMes };
