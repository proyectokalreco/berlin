const supabase = require('../../../config/supabase');
const bcrypt   = require('bcryptjs');

// Cargo del empleado → rol del sistema
const CARGO_A_ROL = {
  panadero:       'panadero',
  cajero:         'cajero',
  vendedor:       'vendedor',
  domicilios:     'domiciliario',
  administrativo: 'admin_berlin',
  otro:           'vendedor',
};

const listar = async (req, res, next) => {
  try {
    const { activo = 'true', q } = req.query;
    let query = supabase
      .from('br_empleados')
      .select('*, usuario:usuario_id(id, email, rol, activo)')
      .eq('activo', activo !== 'false')
      .order('nombre');

    // admin_berlin solo ve su negocio
    if (req.user.rol === 'admin_berlin' && req.user.negocio_id) {
      query = query.eq('negocio_id', req.user.negocio_id);
    }

    if (q) query = query.or(`nombre.ilike.%${q}%,cedula.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
};

const crear = async (req, res, next) => {
  try {
    const {
      nombre, apellido, cedula, cargo, salario, fecha_ingreso,
      telefono, email, notas,
      // campos para crear usuario del sistema
      crear_usuario = false,
      usuario_email, usuario_password,
    } = req.body;

    // negocio_id: admin_berlin usa el suyo; super_admin/admin puede elegir
    const negocio_id = req.user.rol === 'admin_berlin'
      ? req.user.negocio_id
      : (req.body.negocio_id || req.user.negocio_id || null);

    let usuario_id = null;

    if (crear_usuario && usuario_email && usuario_password) {
      if (usuario_password.length < 8) {
        return res.status(422).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }

      // Verificar email único
      const { data: existing } = await supabase
        .from('usuarios').select('id').eq('email', usuario_email).maybeSingle();
      if (existing) {
        return res.status(409).json({ error: 'El email ya está registrado en el sistema' });
      }

      const rol = CARGO_A_ROL[cargo] || 'vendedor';
      const password_hash = await bcrypt.hash(usuario_password, 10);

      const { data: nuevoUsuario, error: uErr } = await supabase
        .from('usuarios')
        .insert({
          email: usuario_email,
          password_hash,
          nombre,
          apellido: apellido || null,
          telefono: telefono || null,
          rol,
          negocio_id,
          activo: true,
        })
        .select('id')
        .single();

      if (uErr) throw uErr;
      usuario_id = nuevoUsuario.id;
    }

    const { data, error } = await supabase
      .from('br_empleados')
      .insert({
        nombre, apellido, cedula, cargo,
        salario: parseFloat(salario) || 0,
        fecha_ingreso: fecha_ingreso || null,
        telefono, email, notas,
        negocio_id, usuario_id,
        activo: true,
      })
      .select('*, usuario:usuario_id(id, email, rol, activo)')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
};

const actualizar = async (req, res, next) => {
  try {
    const {
      nombre, apellido, cedula, cargo, salario, fecha_ingreso,
      telefono, email, notas, activo,
      // actualizar contraseña del usuario vinculado
      nueva_password,
    } = req.body;

    const updates = {
      nombre, apellido, cedula, cargo,
      salario: parseFloat(salario) || 0,
      fecha_ingreso: fecha_ingreso || null,
      telefono, email, notas,
    };
    if (activo !== undefined) updates.activo = activo;

    const { data: emp, error } = await supabase
      .from('br_empleados')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, usuario:usuario_id(id, email, rol, activo)')
      .single();

    if (error) throw error;

    // Si hay nueva contraseña y el empleado tiene usuario vinculado
    if (nueva_password && emp.usuario_id) {
      if (nueva_password.length < 8) {
        return res.status(422).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const password_hash = await bcrypt.hash(nueva_password, 10);
      await supabase.from('usuarios')
        .update({ password_hash, updated_at: new Date() })
        .eq('id', emp.usuario_id);
    }

    // Sincronizar cargo → rol si cambió el cargo y hay usuario
    if (cargo && emp.usuario_id) {
      const nuevoRol = CARGO_A_ROL[cargo];
      if (nuevoRol) {
        await supabase.from('usuarios')
          .update({ rol: nuevoRol, updated_at: new Date() })
          .eq('id', emp.usuario_id);
      }
    }

    res.json(emp);
  } catch (err) { next(err); }
};

const eliminar = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Solo roles con permiso de gestión de personal
    const rolesPermitidos = ['super_admin', 'admin', 'admin_berlin'];
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar empleados' });
    }

    // Obtener el empleado (con su usuario vinculado)
    const { data: emp, error: empErr } = await supabase
      .from('br_empleados')
      .select('id, nombre, usuario_id, negocio_id')
      .eq('id', id)
      .maybeSingle();

    if (empErr) throw empErr;
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    // admin_berlin solo puede eliminar empleados de su propio negocio
    if (req.user.rol === 'admin_berlin' && emp.negocio_id !== req.user.negocio_id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este empleado' });
    }

    // Proteger la cuenta del propio usuario que hace la petición
    if (emp.usuario_id && emp.usuario_id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de empleado' });
    }

    // Eliminar el registro de empleado
    const { error: delErr } = await supabase
      .from('br_empleados')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    // Si tenía usuario vinculado: desactivar (no borrar — preserva historial de ventas)
    if (emp.usuario_id) {
      await supabase
        .from('usuarios')
        .update({ activo: false, updated_at: new Date() })
        .eq('id', emp.usuario_id);
    }

    res.json({ ok: true, message: `Empleado "${emp.nombre}" eliminado correctamente` });
  } catch (err) { next(err); }
};

module.exports = { listar, crear, actualizar, eliminar };
