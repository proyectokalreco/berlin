// ============================================================
// productos.controller.js
// ============================================================
const supabase = require('../../../config/supabase');

const listar = async (req, res, next) => {
  try {
    const { categoria_id, activo = 'true', q, limit = 500 } = req.query;
    let query = supabase.from('br_productos')
      .select(`*, categoria:categoria_id(id, nombre, color, sin_stock_control)`)
      .eq('activo', activo === 'true')
      .order('nombre');

    if (categoria_id) query = query.eq('categoria_id', categoria_id);
    if (q) query = query.ilike('nombre', `%${q}%`);

    const { data, error } = await query.limit(parseInt(limit));
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const obtener = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_productos')
      .select(`*, categoria:categoria_id(*), receta:br_recetas(*)`)
      .eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_productos').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizar = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('br_productos')
      .update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const desactivar = async (req, res, next) => {
  try {
    await supabase.from('br_productos').update({ activo: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const listarCategorias = async (req, res, next) => {
  try {
    const { data } = await supabase
      .from('br_categorias')
      .select('*, productos:br_productos(count)')
      .eq('activo', true)
      .order('orden');
    res.json(data || []);
  } catch (err) { next(err); }
};

const crearCategoria = async (req, res, next) => {
  try {
    const { nombre, emoji, color, orden } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const { data, error } = await supabase
      .from('br_categorias')
      .insert({ nombre: nombre.trim(), emoji: emoji || null, color: color || null, orden: orden || 0, activo: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizarCategoria = async (req, res, next) => {
  try {
    const { nombre, emoji, color, orden } = req.body;
    const updates = {};
    if (nombre !== undefined) updates.nombre = nombre.trim();
    if (emoji   !== undefined) updates.emoji  = emoji || null;
    if (color   !== undefined) updates.color  = color || null;
    if (orden   !== undefined) updates.orden  = orden;
    const { data, error } = await supabase
      .from('br_categorias')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

const eliminarCategoria = async (req, res, next) => {
  try {
    // Verificar si tiene productos activos
    const { count } = await supabase
      .from('br_productos')
      .select('id', { count: 'exact', head: true })
      .eq('categoria_id', req.params.id)
      .eq('activo', true);
    if (count > 0) {
      return res.status(409).json({
        error: `Esta categoría tiene ${count} producto(s). Reasígnalos antes de eliminarla.`
      });
    }
    await supabase.from('br_categorias').update({ activo: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

const topProductos = async (req, res, next) => {
  try {
    const desde = req.query.desde || new Date(Date.now() - 30*24*3600*1000).toISOString().split('T')[0];
    const { data } = await supabase.from('br_venta_items')
      .select(`
        cantidad, subtotal,
        producto:producto_id(id, nombre, precio_venta, imagen_url)
      `)
      .gte('created_at', `${desde}T00:00:00`);

    // Agregar por producto
    const agg = {};
    (data || []).forEach(i => {
      const k = i.producto?.id;
      if (!k) return;
      if (!agg[k]) agg[k] = { producto: i.producto, total_unidades: 0, total_ventas: 0 };
      agg[k].total_unidades += parseFloat(i.cantidad);
      agg[k].total_ventas   += parseFloat(i.subtotal);
    });

    res.json(Object.values(agg).sort((a, b) => b.total_ventas - a.total_ventas).slice(0, 10));
  } catch (err) { next(err); }
};

// ── GET /reportes/rentabilidad ────────────────────────────────
// Retorna todos los productos activos con precio_venta, costo_real
// (calculado desde su receta con el 40% configurado) y margen %.
const rentabilidad = async (req, res, next) => {
  try {
    // Obtener % costos operativos de configuración (default 40)
    const { data: cfg } = await supabase
      .from('br_configuracion')
      .select('valor')
      .eq('clave', 'pct_costos_operativos')
      .maybeSingle()
    const pct = parseFloat(cfg?.valor ?? '40') / 100

    // Productos activos con su receta (si tiene)
    const { data: productos } = await supabase
      .from('br_productos')
      .select(`
        id, nombre, precio_venta, tipo_producto, imagen_url,
        recetas:br_recetas(id, costo_calculado, rendimiento)
      `)
      .eq('activo', true)
      .order('nombre')

    const resultado = (productos || []).map(p => {
      const receta  = p.recetas?.[0] ?? null
      let costoBase = 0
      let costoReal = 0

      if (p.tipo_producto === 'receta' && receta) {
        const rend   = parseFloat(receta.rendimiento) || 1
        costoBase    = parseFloat(receta.costo_calculado || 0) / rend
        costoReal    = costoBase * (1 + pct)
      }

      const pv     = parseFloat(p.precio_venta) || 0
      const margen = pv > 0 && costoReal > 0
        ? Math.round(((pv - costoReal) / pv) * 100)
        : null

      return {
        id:           p.id,
        nombre:       p.nombre,
        tipo:         p.tipo_producto,
        precio_venta: pv,
        costo_base:   Math.round(costoBase),
        costo_real:   Math.round(costoReal),
        margen_pct:   margen,
        tiene_receta: !!receta,
      }
    })

    res.json(resultado)
  } catch (err) { next(err) }
}

module.exports = {
  listar, obtener, crear, actualizar, desactivar,
  listarCategorias, crearCategoria, actualizarCategoria, eliminarCategoria,
  topProductos, rentabilidad,
};
