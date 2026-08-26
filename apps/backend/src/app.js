require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes     = require('./modules/auth/routes');
const berlinRoutes = require('./modules/berlin/routes');
const errorHandler   = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 4001;

// ── Seguridad
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5174',
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));

// ── Rate limiting — login/auth: estricto; API: generoso (polling cada 15s)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  message:  { error: 'Demasiados intentos de acceso. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 2000,
  message:  { error: 'Demasiadas solicitudes. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logs
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Health check
app.get('/health', (req, res) => {
  res.json({
    status:      'ok',
    negocio:     'berlin',
    version:     '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp:   new Date().toISOString(),
  });
});

// ── Rutas API — SOLO auth + berlin (backend dedicado, no comparte
// proceso ni rutas con kalreco_backend)
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/berlin', apiLimiter,  berlinRoutes);

// ── 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Error handler global
app.use(errorHandler);

// ── Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🍺 Berlín API corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
  console.log(`📡 Health: http://localhost:${PORT}/health\n`);
});

module.exports = app;
