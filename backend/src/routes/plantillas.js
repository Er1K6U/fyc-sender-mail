const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

function validar(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

// GET /api/plantillas - Listar plantillas del usuario
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const [plantillas] = await pool.query(
      `SELECT id, nombre, descripcion, asunto, thumbnail_url, created_at, updated_at
       FROM templates
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
      [req.usuario.id]
    );
    res.json({ plantillas });
  } catch (error) {
    next(error);
  }
});

// GET /api/plantillas/:id - Obtener plantilla completa (con HTML y JSON)
router.get('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [[plantilla]] = await pool.query(
      `SELECT * FROM templates WHERE id = ? AND user_id = ?`,
      [req.params.id, req.usuario.id]
    );
    if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ plantilla });
  } catch (error) {
    next(error);
  }
});

// POST /api/plantillas - Crear nueva plantilla
router.post(
  '/',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre es requerido'),
    body('html_content').notEmpty().withMessage('El contenido HTML es requerido'),
    body('asunto').optional().trim(),
    body('descripcion').optional().trim(),
    body('json_design').optional(),
    body('thumbnail_url').optional().isURL(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const { nombre, descripcion, asunto, html_content, json_design, thumbnail_url } = req.body;
      const pool = db();

      const [result] = await pool.query(
        `INSERT INTO templates (user_id, nombre, descripcion, asunto, html_content, json_design, thumbnail_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.usuario.id,
          nombre,
          descripcion || null,
          asunto || '',
          html_content,
          json_design ? JSON.stringify(json_design) : null,
          thumbnail_url || null,
        ]
      );

      const [[nueva]] = await pool.query(
        'SELECT id, nombre, descripcion, asunto, thumbnail_url, created_at FROM templates WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({ plantilla: nueva, mensaje: 'Plantilla guardada correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/plantillas/:id - Actualizar plantilla
router.put(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('nombre').optional().trim().notEmpty(),
    body('html_content').optional().notEmpty(),
    body('asunto').optional().trim(),
    body('descripcion').optional().trim(),
    body('json_design').optional(),
    body('thumbnail_url').optional(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();
      const [[existente]] = await pool.query(
        'SELECT id FROM templates WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );
      if (!existente) return res.status(404).json({ error: 'Plantilla no encontrada' });

      const campos = ['nombre', 'descripcion', 'asunto', 'html_content', 'thumbnail_url'];
      const sets = [];
      const valores = [];

      for (const campo of campos) {
        if (req.body[campo] !== undefined) {
          sets.push(`\`${campo}\` = ?`);
          valores.push(req.body[campo]);
        }
      }

      if (req.body.json_design !== undefined) {
        sets.push('`json_design` = ?');
        valores.push(req.body.json_design ? JSON.stringify(req.body.json_design) : null);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

      valores.push(req.params.id);
      await pool.query(`UPDATE templates SET ${sets.join(', ')} WHERE id = ?`, valores);

      res.json({ mensaje: 'Plantilla actualizada correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/plantillas/:id - Eliminar plantilla
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [result] = await pool.query(
      'DELETE FROM templates WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Plantilla no encontrada' });
    res.json({ mensaje: 'Plantilla eliminada' });
  } catch (error) {
    next(error);
  }
});

// POST /api/plantillas/:id/duplicar - Duplicar plantilla
router.post('/:id/duplicar', async (req, res, next) => {
  try {
    const pool = db();
    const [[original]] = await pool.query(
      'SELECT * FROM templates WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!original) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const [result] = await pool.query(
      `INSERT INTO templates (user_id, nombre, descripcion, asunto, html_content, json_design)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.usuario.id,
        `${original.nombre} (copia)`,
        original.descripcion,
        original.asunto,
        original.html_content,
        original.json_design,
      ]
    );

    const [[copia]] = await pool.query(
      'SELECT id, nombre, descripcion, asunto, thumbnail_url, created_at FROM templates WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ plantilla: copia, mensaje: 'Plantilla duplicada' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
