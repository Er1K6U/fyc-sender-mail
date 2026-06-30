const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar, soloAdmin } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas de gestión de usuarios requieren admin.
router.use(autenticar, soloAdmin);

function validarCampos(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

/**
 * Cuenta los administradores activos. Sirve para impedir quedarse sin admin.
 */
async function contarAdminsActivos(pool, excluyendoId = null) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users
     WHERE rol = 'admin' AND activo = 1 ${excluyendoId ? 'AND id <> ?' : ''}`,
    excluyendoId ? [excluyendoId] : []
  );
  return row.total;
}

// ── GET /api/usuarios ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, activo, ultimo_login, created_at
       FROM users ORDER BY created_at ASC`
    );
    res.json({ usuarios: rows });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/usuarios ────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre es requerido'),
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
    body('rol').isIn(['admin', 'editor']).withMessage('Rol inválido'),
  ],
  validarCampos,
  async (req, res, next) => {
    try {
      const { nombre, email, password, rol } = req.body;
      const pool = db();

      const [existentes] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existentes.length > 0) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
      }

      const hash = await bcrypt.hash(password, 12);
      const [result] = await pool.query(
        'INSERT INTO users (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
        [nombre, email, hash, rol]
      );

      const [[usuario]] = await pool.query(
        'SELECT id, nombre, email, rol, activo, ultimo_login, created_at FROM users WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({ usuario, mensaje: 'Usuario creado correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// ── PUT /api/usuarios/:id ─────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('nombre').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('email').optional().isEmail().normalizeEmail().withMessage('Email inválido'),
    body('rol').optional().isIn(['admin', 'editor']).withMessage('Rol inválido'),
  ],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const id = req.params.id;
      const { nombre, email, rol } = req.body;

      const [[usuario]] = await pool.query('SELECT id, rol, activo FROM users WHERE id = ?', [id]);
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

      // No permitir degradar al último admin activo
      if (rol && rol !== 'admin' && usuario.rol === 'admin' && usuario.activo) {
        const admins = await contarAdminsActivos(pool, id);
        if (admins === 0) {
          return res.status(409).json({ error: 'No puedes quitar el rol admin al último administrador activo' });
        }
      }

      // Verificar email único si cambia
      if (email) {
        const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id]);
        if (dup.length > 0) {
          return res.status(409).json({ error: 'Ya existe otro usuario con ese email' });
        }
      }

      const sets = [];
      const valores = [];
      if (nombre !== undefined) { sets.push('nombre = ?'); valores.push(nombre); }
      if (email !== undefined) { sets.push('email = ?'); valores.push(email); }
      if (rol !== undefined) { sets.push('rol = ?'); valores.push(rol); }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
      }

      valores.push(id);
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, valores);

      const [[actualizado]] = await pool.query(
        'SELECT id, nombre, email, rol, activo, ultimo_login, created_at FROM users WHERE id = ?',
        [id]
      );
      res.json({ usuario: actualizado, mensaje: 'Usuario actualizado' });
    } catch (error) {
      next(error);
    }
  }
);

// ── PATCH /api/usuarios/:id/activo ───────────────────────────────────────────
router.patch(
  '/:id/activo',
  [param('id').isInt().toInt(), body('activo').isBoolean().withMessage('activo debe ser booleano')],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const id = req.params.id;
      const activo = req.body.activo ? 1 : 0;

      if (id === req.usuario.id && !activo) {
        return res.status(409).json({ error: 'No puedes desactivar tu propia cuenta' });
      }

      const [[usuario]] = await pool.query('SELECT id, rol, activo FROM users WHERE id = ?', [id]);
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

      // No desactivar al último admin activo
      if (!activo && usuario.rol === 'admin' && usuario.activo) {
        const admins = await contarAdminsActivos(pool, id);
        if (admins === 0) {
          return res.status(409).json({ error: 'No puedes desactivar al último administrador activo' });
        }
      }

      // Al desactivar, invalidar la sesión (refresh token)
      await pool.query(
        `UPDATE users SET activo = ?, refresh_token = ${activo ? 'refresh_token' : 'NULL'} WHERE id = ?`,
        [activo, id]
      );

      res.json({ mensaje: activo ? 'Usuario activado' : 'Usuario desactivado' });
    } catch (error) {
      next(error);
    }
  }
);

// ── PUT /api/usuarios/:id/password ───────────────────────────────────────────
router.put(
  '/:id/password',
  [
    param('id').isInt().toInt(),
    body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  ],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const id = req.params.id;

      const [[usuario]] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

      const hash = await bcrypt.hash(req.body.password, 12);
      // Resetear refresh token fuerza re-login con la nueva clave
      await pool.query('UPDATE users SET password_hash = ?, refresh_token = NULL WHERE id = ?', [hash, id]);

      res.json({ mensaje: 'Contraseña restablecida correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// ── DELETE /api/usuarios/:id ──────────────────────────────────────────────────
router.delete('/:id', [param('id').isInt().toInt()], validarCampos, async (req, res, next) => {
  try {
    const pool = db();
    const id = req.params.id;

    if (id === req.usuario.id) {
      return res.status(409).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    const [[usuario]] = await pool.query('SELECT id, rol, activo FROM users WHERE id = ?', [id]);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (usuario.rol === 'admin' && usuario.activo) {
      const admins = await contarAdminsActivos(pool, id);
      if (admins === 0) {
        return res.status(409).json({ error: 'No puedes eliminar al último administrador activo' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
