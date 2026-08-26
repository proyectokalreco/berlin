// ============================================================
// mojes.controller.js — Panadería de Tulio
// El Moje es la unidad de producción: fórmula + lote.
//
// Flujo:
//   POST /mojes         → Registro (antes del horno) — NO toca inventario
//   PATCH /mojes/:id/validar → Validación (al salir del horno) — Cascada Kardex
// ============================================================
const supabase = require('../../../config/supabase');

// ── Helper: número de moje automático
const generarNumeroMoje = async () => {
  const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('br_mojes')
    .select('id', { count: 'exact', head: true })
    .gte('fecha_registro', inicio.toISOString());
  const seq = ((data?.length ?? 0) + 1).toString().padStart(3, '0');
  return `MJ-${fecha}-${seq}`;
};

// ── GET /api/panaderia/mojes
// Filtros opcionales: fecha, estado, limit
const listar = async (req, res, next) => {
  try {
    const { fecha, estado, limit = 50 } = req.query;
    const diaFiltro = fecha || new Date().toISOString().split('T')[0];

    let q = supabase
      .from('br_mojes')
      .select(`
        id, numero_moje, estado,
        cantidad_esperada, cantidad_real,
        tiene_incidencia, descripcion_incidencia, cantidad_merma,
        instrucciones_extra,
        costo_produccion,
        fecha_registro, fecha_validacion,
        receta:receta_id (
          id, nombre, rendimiento, temperatura_horno, tiempo_horno_min, instrucciones,
          producto:producto_id (id, nombre, imagen_url, unidad_venta)
        ),
        usuario_registro:usuario_registro_id   (id, nombre, apellido),
        usuario_validacion:usuario_validacion_id (id, nombre, apellido)
      `)
      .order('fecha_registro', { ascending: false })
      .limit(parseInt(limit));

    // Filtrar por fecha del día
    q = q
      .gte('fecha_registro', `${diaFiltro}T00:00:00`)
      .lte('fecha_registro', `${diaFiltro}T23:59:59`);

    if (estado) q = q.eq('estado', estado);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

// ── POST /api/panaderia/mojes
// Crea el Registro del Moje (antes del horno).
// En este momento NO se toca ningún inventario.
const crear = async (req, res, next) => {
  try {
    const {
      receta_id,
      cantidad_esperada,
      instrucciones_extra,
      negocio_id,
    } = req.body;

    if (!receta_id)         return res.status(400).json({ error: 'receta_id es requerido' });
    if (!cantidad_esperada) return res.status(400).json({ error: 'cantidad_esperada es requerido' });

    // Verificar que la receta existe
    const { data: receta, error: recetaErr } = await supabase
      .from('br_recetas')
      .select('id, nombre, rendimiento, producto_id')
      .eq('id', receta_id)
      .single();
    if (recetaErr || !receta) return res.status(404).json({ error: 'Receta no encontrada' });

    const numero_moje = await generarNumeroMoje();

    const { data, error } = await supabase
      .from('br_mojes')
      .insert({
        numero_moje,
        receta_id,
        cantidad_esperada: parseInt(cantidad_esperada),
        instrucciones_extra: instrucciones_extra || null,
        negocio_id:          negocio_id || null,
        usuario_registro_id: req.user.id,
        estado: 'pendiente',
      })
      .select(`
        id, numero_moje, estado, cantidad_esperada, instrucciones_extra,
        fecha_registro,
        receta:receta_id (id, nombre, rendimiento,
          producto:producto_id (id, nombre, unidad_venta)
        ),
        usuario_registro:usuario_registro_id (id, nombre)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/mojes/:id
// Retorna el moje completo con receta + ingredientes + movimientos
const obtener = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('br_mojes')
      .select(`
        *,
        receta:receta_id (
          id, nombre, rendimiento, temperatura_horno, tiempo_horno_min, instrucciones, costo_calculado,
          producto:producto_id (id, nombre, unidad_venta, precio_venta),
          ingredientes:br_receta_ingredientes (
            id, cantidad, unidad,
            insumo:insumo_id (id, nombre, unidad_medida, costo_unitario, stock_actual)
          )
        ),
        usuario_registro:usuario_registro_id   (id, nombre, apellido),
        usuario_validacion:usuario_validacion_id (id, nombre, apellido)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Moje no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
};

// ── PATCH /api/panaderia/mojes/:id/validar
// EL CORAZÓN DEL SISTEMA: El Efecto Dominó de la Validación.
//
// Al validar, ejecuta la función SQL validar_moje() que:
//   1. Descuenta ingredientes del Almacén de Materia Prima
//   2. Registra movimientos en Kardex (br_movimientos_insumos)
//   3. Suma productos terminados al stock
//   4. Calcula costo de producción automáticamente
const validar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      cantidad_real,
      tiene_incidencia    = false,
      descripcion_incidencia,
      cantidad_merma      = 0,
    } = req.body;

    if (cantidad_real === undefined || cantidad_real === null) {
      return res.status(400).json({ error: 'cantidad_real es requerido' });
    }
    if (cantidad_real < 0) {
      return res.status(400).json({ error: 'cantidad_real no puede ser negativo' });
    }

    // Verificar estado del moje
    const { data: moje } = await supabase
      .from('br_mojes')
      .select('id, estado, numero_moje')
      .eq('id', id)
      .single();

    if (!moje) return res.status(404).json({ error: 'Moje no encontrado' });
    if (moje.estado !== 'pendiente') {
      return res.status(400).json({
        error: `El moje ya fue procesado. Estado actual: ${moje.estado}`,
      });
    }

    // Llamar al RPC que ejecuta la cascada atómica
    const { data: resultado, error: rpcError } = await supabase.rpc('br_validar_moje', {
      p_moje_id:                id,
      p_cantidad_real:          parseInt(cantidad_real),
      p_tiene_incidencia:       Boolean(tiene_incidencia),
      p_descripcion_incidencia: descripcion_incidencia || null,
      p_cantidad_merma:         parseInt(cantidad_merma) || 0,
      p_usuario_id:             req.user.id,
    });

    if (rpcError) throw rpcError;

    // Retornar el moje actualizado
    const { data: mojeActualizado } = await supabase
      .from('br_mojes')
      .select(`
        id, numero_moje, estado, cantidad_esperada, cantidad_real,
        tiene_incidencia, descripcion_incidencia, cantidad_merma,
        costo_produccion, fecha_registro, fecha_validacion,
        receta:receta_id (nombre, producto:producto_id (nombre))
      `)
      .eq('id', id)
      .single();

    res.json({
      ...resultado,
      moje: mojeActualizado,
    });
  } catch (err) { next(err); }
};

// ── GET /api/panaderia/mojes/resumen
// Resumen del día para el dashboard de Panadería de Tulio
const resumenDia = async (req, res, next) => {
  try {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

    const { data: mojes } = await supabase
      .from('br_mojes')
      .select('estado, cantidad_esperada, cantidad_real, costo_produccion, tiene_incidencia')
      .gte('fecha_registro', `${fecha}T00:00:00`)
      .lte('fecha_registro', `${fecha}T23:59:59`);

    const todos        = mojes || [];
    const pendientes   = todos.filter(m => m.estado === 'pendiente');
    const validados    = todos.filter(m => m.estado === 'validado');
    const incidencias  = todos.filter(m => m.estado === 'con_incidencia');
    const producidos   = [...validados, ...incidencias]
      .reduce((s, m) => s + (m.cantidad_real || 0), 0);
    const costo_total  = todos.reduce((s, m) => s + parseFloat(m.costo_produccion || 0), 0);

    res.json({
      total_mojes:   todos.length,
      pendientes:    pendientes.length,
      validados:     validados.length,
      incidencias:   incidencias.length,
      total_producido: producidos,
      costo_total,
      fecha,
    });
  } catch (err) { next(err); }
};

module.exports = { listar, crear, obtener, validar, resumenDia };
