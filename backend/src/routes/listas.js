const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar, soloAdmin } = require('../middleware/auth');
const acceso = require('../services/accesoService');

const router = express.Router();
router.use(autenticar);

function validar(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

// GET /api/listas - Listas visibles para el usuario
// El admin ve todas; el editor solo las suyas y las marcadas como compartidas.
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const filtro = acceso.filtroVisibilidad(req.usuario, 'cl');
    const [listas] = await pool.query(
      `SELECT cl.id, cl.nombre, cl.descripcion, cl.total_contactos, cl.activos,
              cl.created_at, cl.compartida, cl.user_id,
              u.nombre AS creador_nombre,
              (cl.user_id = ?) AS es_propia
       FROM contact_lists cl
       LEFT JOIN users u ON u.id = cl.user_id
       WHERE ${filtro.sql}
       ORDER BY cl.created_at DESC`,
      [req.usuario.id, ...filtro.params]
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
    body('compartida').optional().isBoolean(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();

      // Ver algo compartido no autoriza a editarlo: solo su dueño o un admin.
      const puede = await acceso.puedeEditar('lista', Number(req.params.id), req.usuario);
      if (!puede) {
        return res.status(404).json({ error: 'Lista no encontrada' });
      }

      const { nombre, descripcion, compartida } = req.body;
      const sets = [];
      const valores = [];
      if (nombre) { sets.push('nombre = ?'); valores.push(nombre); }
      if (descripcion !== undefined) { sets.push('descripcion = ?'); valores.push(descripcion); }

      // Marcar o desmarcar como compartida es exclusivo del administrador.
      if (compartida !== undefined) {
        if (!acceso.esAdmin(req.usuario)) {
          return res.status(403).json({
            error: 'Solo un administrador puede compartir o dejar de compartir una lista',
          });
        }
        sets.push('compartida = ?');
        valores.push(compartida ? 1 : 0);
      }

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
// Restringido a administradores: como las listas son compartidas, borrar una
// arrastra todos sus contactos y afecta al trabajo del resto de usuarios.
// Los editores sí pueden crear listas, importar y borrar contactos sueltos.
router.delete('/:id', soloAdmin, async (req, res, next) => {
  try {
    const pool = db();
    const [result] = await pool.query(
      'DELETE FROM contact_lists WHERE id = ?',
      [req.params.id]
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

    const visible = await acceso.puedeVer('lista', Number(req.params.id), req.usuario);
    if (!visible) return res.status(404).json({ error: 'Lista no encontrada' });

    const [[lista]] = await pool.query(
      `SELECT cl.*,
              COUNT(c.id) AS total_real,
              SUM(c.suscrito = 1) AS suscritos,
              SUM(c.suscrito = 0) AS desuscritos,
              SUM(c.email_valido = 0) AS invalidos
       FROM contact_lists cl
       LEFT JOIN contacts c ON c.list_id = cl.id
       WHERE cl.id = ?
       GROUP BY cl.id`,
      [req.params.id]
    );
    if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
    res.json({ stats: lista });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
