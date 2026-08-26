const express   = require('express');
const supabase  = require('../../config/supabase');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Solo el endpoint genérico de preferencias por usuario (usado por el
// Dashboard para "Reordenar" módulos) — clonado de kalreco/modules/panel/routes.js.
// El resto de ese módulo (dashboard central, gestión global de usuarios,
// alertas multi-negocio) no aplica acá: Berlín es un solo negocio.

// ── GET /api/panel/me/preferencias
router.get('/me/preferencias', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('usuarios').select('preferencias').eq('id', req.user.id).single();
    if (error) throw error;
    res.json(data?.preferencias ?? {});
  } catch (err) { next(err); }
});

// ── PATCH /api/panel/me/preferencias  { clave, valor }
router.patch('/me/preferencias', async (req, res, next) => {
  try {
    const { clave, valor } = req.body;
    if (!clave) return res.status(400).json({ error: 'clave es obligatorio' });
    const { data: current } = await supabase
      .from('usuarios').select('preferencias').eq('id', req.user.id).single();
    const nuevasPref = { ...(current?.preferencias ?? {}), [clave]: valor };
    const { error } = await supabase
      .from('usuarios').update({ preferencias: nuevasPref }).eq('id', req.user.id);
    if (error) throw error;
    res.json(nuevasPref);
  } catch (err) { next(err); }
});

module.exports = router;
