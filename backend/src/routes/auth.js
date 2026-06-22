const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

function generarTokens(userId) {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
  ],
  async (req, res, next) => {
    try {
      const errores = validationResult(req);
      if (!errores.isEmpty()) {
        return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
      }

      const { email, password } = req.body;
      const pool = db();

      const [rows] = await pool.query(
        'SELECT id, nombre, email, password_hash, rol, activo FROM users WHERE email = ?',
        [email]
      );

      if (rows.length === 0) {
        // Respuesta genérica para no revelar si el email existe
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const usuario = rows[0];

      if (!usuario.activo) {
        return res.status(401).json({ error: 'Cuenta desactivada' });
      }

      const passwordValida = await bcrypt.compare(password, usuario.password_hash);
      if (!passwordValida) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const { accessToken, refreshToken } = generarTokens(usuario.id);

      // Guardar refresh token hasheado en DB
      const refreshHash = await bcrypt.hash(refreshToken, 10);
      await pool.query(
        'UPDATE users SET refresh_token = ?, ultimo_login = NOW() WHERE id = ?',
        [refreshHash, usuario.id]
      );

      res.json({
        accessToken,
        refreshToken,
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token requerido' });
    }

    let payload;
    try {
      payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    }

    const pool = db();
    const [rows] = await pool.query(
      'SELECT id, refresh_token, activo FROM users WHERE id = ?',
      [payload.userId]
    );

    if (rows.length === 0 || !rows[0].activo) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    const tokenValido = await bcrypt.compare(refreshToken, rows[0].refresh_token || '');
    if (!tokenValido) {
      return res.status(401).json({ error: 'Refresh token no coincide' });
    }

    const tokens = generarTokens(payload.userId);
    const nuevoHash = await bcrypt.hash(tokens.refreshToken, 10);
    await pool.query('UPDATE users SET refresh_token = ? WHERE id = ?', [
      nuevoHash,
      payload.userId,
    ]);

    res.json(tokens);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', autenticar, async (req, res, next) => {
  try {
    await db().query('UPDATE users SET refresh_token = NULL WHERE id = ?', [
      req.usuario.id,
    ]);
    res.json({ mensaje: 'Sesión cerrada correctamente' });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

// PUT /api/auth/cambiar-password
router.put(
  '/cambiar-password',
  autenticar,
  [
    body('passwordActual').notEmpty().withMessage('Contraseña actual requerida'),
    body('passwordNueva')
      .isLength({ min: 8 })
      .withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
  ],
  async (req, res, next) => {
    try {
      const errores = validationResult(req);
      if (!errores.isEmpty()) {
        return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
      }

      const { passwordActual, passwordNueva } = req.body;
      const pool = db();

      const [rows] = await pool.query(
        'SELECT password_hash FROM users WHERE id = ?',
        [req.usuario.id]
      );

      const valida = await bcrypt.compare(passwordActual, rows[0].password_hash);
      if (!valida) {
        return res.status(401).json({ error: 'Contraseña actual incorrecta' });
      }

      const nuevoHash = await bcrypt.hash(passwordNueva, 12);
      await pool.query(
        'UPDATE users SET password_hash = ?, refresh_token = NULL WHERE id = ?',
        [nuevoHash, req.usuario.id]
      );

      res.json({ mensaje: 'Contraseña actualizada. Por favor inicia sesión de nuevo.' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
