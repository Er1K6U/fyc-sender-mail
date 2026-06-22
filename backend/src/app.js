const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFound } = require('./middleware/errorHandler');

// Rutas
const authRoutes = require('./routes/auth');
const smtpRoutes = require('./routes/smtp');
const listasRoutes = require('./routes/listas');
const contactosRoutes = require('./routes/contactos');
const plantillasRoutes = require('./routes/plantillas');
const uploadsRoutes = require('./routes/uploads');
const campanasRoutes = require('./routes/campanas');
const trackingRoutes = require('./routes/tracking');
const reportesRoutes = require('./routes/reportes');

const app = express();

// ─── Seguridad ──────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false, // El frontend gestiona su propio CSP
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.APP_URL
    : ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

// ─── Rate limiting ──────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Intenta en 15 minutos.' },
});

app.use('/api/', limiter);
app.use('/api/auth/login', limiterLogin);

// ─── Middlewares generales ──────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── Archivos estáticos ─────────────────────────────────────
// Imágenes y archivos subidos
app.use('/uploads', express.static(path.join(__dirname, '../../uploads'), {
  maxAge: '7d',
}));

// En producción, servir el build del frontend
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
}

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/smtp', smtpRoutes);
app.use('/api/listas', listasRoutes);
app.use('/api/contactos', contactosRoutes);
app.use('/api/plantillas', plantillasRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/campanas', campanasRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/reportes', reportesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// SPA fallback en producción
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    }
  });
}

// ─── Manejo de errores ───────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
