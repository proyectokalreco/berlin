const supabase = require('../../../../config/supabase');

/**
 * Para productos de categorías sin_stock_control (ej: Preparaciones de Cafetería):
 * busca la receta del producto y descuenta insumos proporcional a la cantidad vendida.
 * Los insumos marcados como es_gratis (ej: Agua) se omiten.
 *
 * @param {string} producto_id
 * @param {number} cantidad  - unidades vendidas
 */
async function deducirInsumosReceta(producto_id, cantidad) {
  const { data: receta } = await supabase
    .from('br_recetas')
    .select(`
      rendimiento,
      ingredientes:br_receta_ingredientes(
        cantidad,
        insumo:insumo_id(id, nombre, stock_actual, es_gratis)
      )
    `)
    .eq('producto_id', producto_id)
    .eq('activo', true)
    .maybeSingle();

  if (!receta?.ingredientes?.length) return;

  const rendimiento = parseFloat(receta.rendimiento) || 1;
  const factor = parseFloat(cantidad) / rendimiento;

  for (const ing of receta.ingredientes) {
    if (!ing.insumo) continue;
    if (ing.insumo.es_gratis) continue; // Agua u otros gratuitos — no afectar inventario

    const stockActual = parseFloat(ing.insumo.stock_actual) || 0;
    const aDescontar  = parseFloat(ing.cantidad) * factor;
    const stockNuevo  = Math.max(0, stockActual - aDescontar);

    await supabase
      .from('br_insumos')
      .update({ stock_actual: stockNuevo })
      .eq('id', ing.insumo.id);
  }
}

module.exports = { deducirInsumosReceta };
