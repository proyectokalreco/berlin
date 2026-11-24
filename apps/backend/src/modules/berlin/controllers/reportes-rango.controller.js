const supabase = require('../../../config/supabase');
const { rangoDiaColombia } = require('../../../utils/fecha');

// Reportes por rango de fechas (2026-11-24): productos vendidos y movimiento de inventario.
// Solo lectura: no tocan ventas, stock ni caja.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function leerRango(req, res) {
  const { desde, hasta } = req.query;
  if (!FECHA_RE.test(desde || '') || !FECHA_RE.test(hasta || '') || desde > hasta) {
    res.status(400).json({ error: 'Rango de fechas inválido (desde/hasta YYYY-MM-DD)' });
    return null;
  }
  return { desde, hasta };
}

// Día siguiente (YYYY-MM-DD) para filtrar columnas cuyo tipo no se conoce con "fecha < día siguiente".
function diaSiguiente(f) {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// PostgREST corta en 1000 filas por consulta: se pagina hasta traer todo el rango.
async function traerTodo(construir) {
  const PAG = 1000;
  const out = [];
  for (let desde = 0; ; desde += PAG) {
    const { data, error } = await construir().range(desde, desde + PAG - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAG) break;
  }
  return out;
}

// ── GET /berlin/reportes/productos-vendidos?desde&hasta
// Lista completa de productos vendidos en el rango (ventas completadas; las anuladas no cuentan).
// Se separa lo vendido a crédito, que aún no es dinero cobrado.
const productosVendidos = async (req, res, next) => {
  try {
    const r = leerRango(req, res); if (!r) return;
    const ini = rangoDiaColombia(r.desde).desde;
    const fin = rangoDiaColombia(r.hasta).hasta;

    const items = await traerTodo(() => supabase
      .from('br_venta_items')
      .select('cantidad, subtotal, producto:producto_id(id, nombre), venta:venta_id!inner(fecha, estado, metodo_pago)')
      .eq('venta.estado', 'completada')
      .gte('venta.fecha', ini)
      .lte('venta.fecha', fin));

    const agg = new Map();
    for (const i of items) {
      const p = i.producto;
      if (!p) continue;
      const a = agg.get(p.id) || { producto_id: p.id, nombre: p.nombre, cantidad: 0, total: 0, total_credito: 0 };
      const sub = parseFloat(i.subtotal) || 0;
      a.cantidad += parseFloat(i.cantidad) || 0;
      a.total    += sub;
      if (i.venta?.metodo_pago === 'credito') a.total_credito += sub;
      agg.set(p.id, a);
    }
    res.json(Array.from(agg.values()).sort((a, b) => b.cantidad - a.cantidad || b.total - a.total));
  } catch (err) { next(err); }
};

// ── GET /berlin/reportes/movimiento-inventario?desde&hasta
// Entradas y salidas de inventario en el rango. No existe un kardex único de productos, así que se
// arma desde las fuentes que sí guardan fecha:
//   Productos  entradas: facturas de proveedor, planilla de producción
//              salidas : ventas completadas, mermas
//   Insumos    entradas/salidas/ajustes: kardex br_movimientos_insumos, entradas por factura de proveedor
// LÍMITE: el consumo de insumos por planilla y por productos sin control de stock no se registra
// con fecha en ninguna tabla, por eso no aparece como salida de insumos.
const movimientoInventario = async (req, res, next) => {
  try {
    const r = leerRango(req, res); if (!r) return;
    const ini = rangoDiaColombia(r.desde).desde;
    const fin = rangoDiaColombia(r.hasta).hasta;
    const sig = diaSiguiente(r.hasta);

    const [facItems, planItems, ventaItems, mermas, kardex] = await Promise.all([
      traerTodo(() => supabase.from('br_factura_proveedor_items')
        .select('cantidad, producto_id, insumo_id, descripcion, producto:producto_id(nombre), insumo:insumo_id(nombre, unidad_medida), factura:factura_id!inner(fecha, estado, numero_factura)')
        .gte('factura.fecha', r.desde).lt('factura.fecha', sig)),
      traerTodo(() => supabase.from('br_planilla_items')
        .select('cantidad_producida, producto:producto_id(nombre), planilla:planilla_id!inner(fecha)')
        .gte('planilla.fecha', r.desde).lte('planilla.fecha', r.hasta)),
      traerTodo(() => supabase.from('br_venta_items')
        .select('cantidad, producto:producto_id(nombre), venta:venta_id!inner(fecha, estado, numero_venta)')
        .eq('venta.estado', 'completada').gte('venta.fecha', ini).lte('venta.fecha', fin)),
      traerTodo(() => supabase.from('br_mermas')
        .select('cantidad, fecha, motivo, producto:producto_id(nombre)')
        .gte('fecha', r.desde).lte('fecha', r.hasta)),
      traerTodo(() => supabase.from('br_movimientos_insumos')
        .select('tipo, cantidad, motivo, created_at, insumo:insumo_id(nombre, unidad_medida)')
        .gte('created_at', ini).lte('created_at', fin)),
    ]);

    const filas = [];
    const push = (fecha, item_tipo, nombre, unidad, entrada, salida, origen, detalle) =>
      filas.push({ fecha, item_tipo, nombre: nombre || '—', unidad: unidad || '', entrada, salida, origen, detalle: detalle || '' });

    for (const i of facItems) {
      const est = (i.factura?.estado || '').toLowerCase();
      if (est === 'cancelada' || est === 'anulada') continue;
      const cant = parseFloat(i.cantidad) || 0;
      const det = i.factura?.numero_factura ? `Factura ${i.factura.numero_factura}` : 'Factura proveedor';
      if (i.producto_id) push(i.factura.fecha, 'Producto', i.producto?.nombre || i.descripcion, '', cant, 0, 'Compra a proveedor', det);
      else if (i.insumo_id) push(i.factura.fecha, 'Insumo', i.insumo?.nombre || i.descripcion, i.insumo?.unidad_medida, cant, 0, 'Compra a proveedor', det);
    }
    for (const i of planItems) {
      push(i.planilla.fecha, 'Producto', i.producto?.nombre, '', parseFloat(i.cantidad_producida) || 0, 0, 'Producción', 'Planilla');
    }
    for (const i of ventaItems) {
      push(i.venta.fecha, 'Producto', i.producto?.nombre, '', 0, parseFloat(i.cantidad) || 0, 'Venta', i.venta.numero_venta ? `Venta ${i.venta.numero_venta}` : '');
    }
    for (const m of mermas) {
      push(m.fecha, 'Producto', m.producto?.nombre, '', 0, parseFloat(m.cantidad) || 0, 'Merma', m.motivo);
    }
    for (const k of kardex) {
      const cant = parseFloat(k.cantidad) || 0;
      const esEntrada = k.tipo === 'entrada' || (k.tipo === 'ajuste' && cant >= 0);
      const origen = k.tipo === 'entrada' ? 'Entrada manual' : k.tipo === 'ajuste' ? 'Ajuste de inventario' : (k.tipo || 'Kardex');
      push(k.created_at, 'Insumo', k.insumo?.nombre, k.insumo?.unidad_medida,
        esEntrada ? Math.abs(cant) : 0, esEntrada ? 0 : Math.abs(cant), origen, k.motivo);
    }

    filas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

    const por = new Map();
    for (const f of filas) {
      const k = `${f.item_tipo}|${f.nombre}`;
      const a = por.get(k) || { item_tipo: f.item_tipo, nombre: f.nombre, unidad: f.unidad, entradas: 0, salidas: 0 };
      a.entradas += f.entrada; a.salidas += f.salida;
      por.set(k, a);
    }
    const resumen = Array.from(por.values())
      .map(a => ({ ...a, neto: a.entradas - a.salidas }))
      .sort((a, b) => a.item_tipo.localeCompare(b.item_tipo) || a.nombre.localeCompare(b.nombre));

    res.json({ desde: r.desde, hasta: r.hasta, resumen, filas });
  } catch (err) { next(err); }
};

module.exports = { productosVendidos, movimientoInventario };
