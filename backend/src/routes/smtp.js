const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');
const { verificarConexion } = require('../services/smtpService');

const router = express.Router();
router.use(autenticar);

function validarCampos(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

const reglasSmtp = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido'),
  body('host').trim().notEmpty().withMessage('El host es requerido'),
  body('puerto').isInt({ min: 1, max: 65535 }).withMessage('Puerto inválido'),
  body('usuario').trim().isEmail().withMessage('El usuario debe ser un email válido'),
  body('password').notEmpty().withMessage('La contraseña/App Password es requerida'),
  body('from_nombre').trim().notEmpty().withMessage('El nombre del remitente es requerido'),
  body('from_email').isEmail().withMessage('El email del remitente es inválido'),
  body('limite_dia').optional().isInt({ min: 1 }).withMessage('Límite diario inválido'),
];

// GET /api/smtp - Listar configuraciones SMTP del usuario
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const [rows] = await pool.query(
      `SELECT id, nombre, host, puerto, seguro, usuario, from_nombre, from_email,
              limite_dia, enviados_hoy, activo, verificado, created_at
       FROM smtp_configs WHERE user_id = ? ORDER BY created_at DESC`,
      [req.usuario.id]
    );
    // No devolver passwords nunca
    res.json({ smtp_configs: rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/smtp - Crear configuración SMTP
router.post('/', reglasSmtp, validarCampos, async (req, res, next) => {
  try {
    const { nombre, host, puerto, seguro, usuario, password, from_nombre, from_email, limite_dia } = req.body;
    const pool = db();

    const [result] = await pool.query(
      `INSERT INTO smtp_configs (user_id, nombre, host, puerto, seguro, usuario, password,
                                  from_nombre, from_email, limite_dia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.usuario.id,
        nombre,
        host || 'smtp.gmail.com',
        puerto || 587,
        seguro ? 1 : 0,
        usuario,
        password, // En producción se recomienda encriptar con AES
        from_nombre,
        from_email,
        limite_dia || 500,
      ]
    );

    const [nuevaConfig] = await pool.query(
      `SELECT id, nombre, host, puerto, seguro, usuario, from_nombre, from_email,
              limite_dia, activo, verificado FROM smtp_configs WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ smtp_config: nuevaConfig[0], mensaje: 'Configuración SMTP creada' });
  } catch (error) {
    next(error);
  }
});

// PUT /api/smtp/:id - Actualizar configuración SMTP
router.put(
  '/:id',
  [param('id').isInt().toInt(), ...reglasSmtp.map(r => r.optional())],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const [existente] = await pool.query(
        'SELECT id FROM smtp_configs WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );
      if (existente.length === 0) {
        return res.status(404).json({ error: 'Configuración no encontrada' });
      }

      const campos = req.body;
      const actualizables = ['nombre', 'host', 'puerto', 'seguro', 'usuario', 'from_nombre', 'from_email', 'limite_dia', 'activo'];
      const sets = [];
      const valores = [];

      for (const campo of actualizables) {
        if (campos[campo] !== undefined) {
          sets.push(`\`${campo}\` = ?`);
          valores.push(campos[campo]);
        }
      }

      // Actualizar password solo si se proporcionó
      if (campos.password) {
        sets.push('`password` = ?');
        valores.push(campos.password);
        sets.push('`verificado` = 0'); // Resetear verificación
      }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
      }

      valores.push(req.params.id);
      await pool.query(`UPDATE smtp_configs SET ${sets.join(', ')} WHERE id = ?`, valores);

      res.json({ mensaje: 'Configuración actualizada correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/smtp/:id - Eliminar configuración SMTP
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [result] = await pool.query(
      'DELETE FROM smtp_configs WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    res.json({ mensaje: 'Configuración eliminada' });
  } catch (error) {
    next(error);
  }
});

// POST /api/smtp/:id/test - Probar conexión SMTP
router.post(
  '/:id/test',
  [
    param('id').isInt().toInt(),
    body('email_destino').isEmail().withMessage('Proporciona un email válido para la prueba'),
  ],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const [rows] = await pool.query(
        'SELECT * FROM smtp_configs WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Configuración no encontrada' });
      }

      const config = rows[0];
      const resultado = await verificarConexion(config, req.body.email_destino);

      if (resultado.ok) {
        await pool.query(
          'UPDATE smtp_configs SET verificado = 1 WHERE id = ?',
          [req.params.id]
        );
      }

      res.json(resultado);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/smtp/:id/stats - Estadísticas de uso de una cuenta SMTP
router.get('/:id/stats', async (req, res, next) => {
  try {
    const pool = db();
    const [rows] = await pool.query(
      `SELECT s.id, s.nombre, s.limite_dia, s.enviados_hoy, s.fecha_reset,
              COUNT(cs.id) as total_enviados_historico
       FROM smtp_configs s
       LEFT JOIN campaigns c ON c.smtp_config_id = s.id
       LEFT JOIN campaign_sends cs ON cs.campaign_id = c.id AND cs.estado = 'enviado'
       WHERE s.id = ? AND s.user_id = ?
       GROUP BY s.id`,
      [req.params.id, req.usuario.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }

    const stats = rows[0];
    const porcentajeUsado = stats.limite_dia > 0
      ? Math.round((stats.enviados_hoy / stats.limite_dia) * 100)
      : 0;

    res.json({
      ...stats,
      porcentaje_usado: porcentajeUsado,
      disponibles_hoy: Math.max(0, stats.limite_dia - stats.enviados_hoy),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
