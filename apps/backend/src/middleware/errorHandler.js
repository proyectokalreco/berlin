const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // Errores de validación de express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ error: 'Datos inválidos', details: err.errors });
  }

  // Error de PostgreSQL / Supabase
  if (err.code) {
    switch (err.code) {
      case '23505': // unique violation
        return res.status(409).json({ error: 'Registro duplicado', detail: err.detail });
      case '23503': // foreign key violation
        return res.status(400).json({ error: 'Referencia inválida', detail: err.detail });
      case '42P01': // undefined table
        return res.status(500).json({ error: 'Error de base de datos' });
      default:
        return res.status(500).json({ error: 'Error de base de datos', code: err.code });
    }
  }

  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(status).json({
    error:   message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
