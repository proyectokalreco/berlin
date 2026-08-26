const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const supabase  = require('../../config/supabase');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// ⚠️ Roles permitidos a entrar por este login — Berlín es un negocio
// aislado: SOLO admin_berlin + super_admin (soporte de plataforma).
// A diferencia del login compartido de Kalreco, acá el candado va explícito
// en el backend (no solo en el frontend) — así ningún otro rol con
// negocio_id NULL (ej. admin_grupo) puede entrar aunque adivine la URL.
const ROLES_PERMITIDOS = ['super_admin', 'admin_berlin'];

// ── POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', details: errors.array() });
  }

  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from('usuarios')
    .select('id, email, password_hash, nombre, apellido, rol, negocio_id, activo, avatar_url')
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  if (!user.activo) {
    return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
  }

  // Candado de negocio: solo super_admin / admin_berlin entran por este login.
  if (!ROLES_PERMITIDOS.includes(user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso a este negocio.' });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  await supabase.from('usuarios').update({ ultimo_acceso: new Date() }).eq('id', user.id);

  let negocio = null;
  if (user.negocio_id) {
    const { data } = await supabase
      .from('negocios').select('id, nombre, tipo, slug, color').eq('id', user.negocio_id).single();
    negocio = data;
  }

  const payload = { userId: user.id, rol: user.rol, negocio_id: user.negocio_id };

  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

  await supabase.from('refresh_tokens').insert({
    usuario_id: user.id,
    token:      refreshToken,
    expira_en:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const { password_hash, ...userSafe } = user;

  res.json({
    user:   { ...userSafe, negocio },
    tokens: { accessToken, refreshToken },
  });
});

// ── POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const { data: storedToken } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token', refreshToken)
      .eq('usuario_id', decoded.userId)
      .single();

    if (!storedToken || new Date(storedToken.expira_en) < new Date()) {
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    }

    if (!ROLES_PERMITIDOS.includes(decoded.rol)) {
      return res.status(403).json({ error: 'No tienes acceso a este negocio.' });
    }

    const payload     = { userId: decoded.userId, rol: decoded.rol, negocio_id: decoded.negocio_id };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });

    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Refresh token inválido' });
  }
});

// ── PUT /api/auth/perfil
router.put('/perfil', authenticate, [
  body('nombre').optional().trim().isLength({ min: 1 }),
  body('apellido').optional().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('password_nueva').optional().isLength({ min: 6 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: 'Datos inválidos' });

    const { nombre, apellido, email, password_actual, password_nueva } = req.body;
    const userId = req.user.id;

    if (password_nueva) {
      if (!password_actual) return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' });
      const { data: u } = await supabase.from('usuarios').select('password_hash').eq('id', userId).single();
      const ok = await bcrypt.compare(password_actual, u?.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    if (email) {
      const { data: existing } = await supabase.from('usuarios')
        .select('id').eq('email', email).neq('id', userId).maybeSingle();
      if (existing) return res.status(400).json({ error: 'El correo ya está registrado por otro usuario' });
    }

    const updates = {};
    if (nombre)              updates.nombre        = nombre;
    if (apellido !== undefined && apellido !== null) updates.apellido = apellido;
    if (email)               updates.email         = email;
    if (password_nueva)      updates.password_hash = await bcrypt.hash(password_nueva, 10);

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada que actualizar' });

    const { data: updated, error } = await supabase.from('usuarios')
      .update(updates).eq('id', userId)
      .select('id, email, nombre, apellido, rol, negocio_id, avatar_url').single();
    if (error) throw error;

    res.json({ user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// ── POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await supabase.from('refresh_tokens').delete().eq('token', refreshToken);
  }
  res.json({ message: 'Sesión cerrada correctamente' });
});

// ── GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { data: user } = await supabase
    .from('usuarios')
    .select('id, email, nombre, apellido, rol, negocio_id, avatar_url, ultimo_acceso')
    .eq('id', req.user.id)
    .single();

  let negocio = null;
  if (user?.negocio_id) {
    const { data } = await supabase
      .from('negocios').select('id, nombre, tipo, slug, color').eq('id', user.negocio_id).single();
    negocio = data;
  }

  res.json({ user: { ...user, negocio } });
});

module.exports = router;
