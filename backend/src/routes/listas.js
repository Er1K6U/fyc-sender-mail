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

// GET /api/listas - Listar todas las listas del usuario
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const [listas] = await pool.query(
      `SELECT id, nombre, descripcion, total_contactos, activos, created_at
       FROM contact_lists
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.usuario.id]
    );
    res.json({ listas });
  } catch (error) {
    next(error);
  }
});

// POST /api/listas - Crear lista
router.post(
  '/',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre de la lista es requerido'),
    body('descripcion').optional().trim(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const { nombre, descripcion } = req.body;
      const pool = db();

      const [result] = await pool.query(
        'INSERT INTO contact_lists (user_id, nombre, descripcion) VALUES (?, ?, ?)',
        [req.usuario.id, nombre, descripcion || null]
      );

      const [nueva] = await pool.query(
        'SELECT * FROM contact_lists WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({ lista: nueva[0], mensaje: 'Lista creada correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/listas/:id - Actualizar lista
router.put(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('nombre').optional().trim().notEmpty(),
    body('descripcion').optional().trim(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();
      const [existente] = await pool.query(
        'SELECT id FROM contact_lists WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );
      if (existente.length === 0) {
        return res.status(404).json({ error: 'Lista no encontrada' });
      }

      const { nombre, descripcion } = req.body;
      const sets = [];
      const valores = [];
      if (nombre) { sets.push('nombre = ?'); valores.push(nombre); }
      if (descripcion !== undefined) { sets.push('descripcion = ?'); valores.push(descripcion); }
      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

      valores.push(req.params.id);
      await pool.query(`UPDATE contact_lists SET ${sets.join(', ')} WHERE id = ?`, valores);
      res.json({ mensaje: 'Lista actualizada' });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/listas/:id - Eliminar lista (y sus contactos por CASCADE)
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [result] = await pool.query(
      'DELETE FROM contact_lists WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Lista no encontrada' });
    }
    res.json({ mensaje: 'Lista eliminada' });
  } catch (error) {
    next(error);
  }
});

// GET /api/listas/:id/stats - Estadísticas de una lista
router.get('/:id/stats', async (req, res, next) => {
  try {
    const pool = db();
    const [[lista]] = await pool.query(
      `SELECT cl.*,
              COUNT(c.id) AS total_real,
              SUM(c.suscrito = 1) AS suscritos,
              SUM(c.suscrito = 0) AS desuscritos,
              SUM(c.email_valido = 0) AS invalidos
       FROM contact_lists cl
       LEFT JOIN contacts c ON c.list_id = cl.id
       WHERE cl.id = ? AND cl.user_id = ?
       GROUP BY cl.id`,
      [req.params.id, req.usuario.id]
    );
    if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
    res.json({ stats: lista });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
