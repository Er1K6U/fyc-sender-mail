const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');
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

// GET /api/plantillas - Plantillas visibles para el usuario
// El admin ve todas; el editor solo las suyas y las compartidas.
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const filtro = acceso.filtroVisibilidad(req.usuario, 't');
    const [plantillas] = await pool.query(
      `SELECT t.id, t.nombre, t.descripcion, t.asunto, t.thumbnail_url,
              t.created_at, t.updated_at, t.compartida, t.user_id,
              u.nombre AS creador_nombre,
              (t.user_id = ?) AS es_propia
       FROM templates t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE ${filtro.sql}
       ORDER BY t.updated_at DESC`,
      [req.usuario.id, ...filtro.params]
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

    // Barrera por ID: no basta con ocultarla del listado.
    const visible = await acceso.puedeVer('plantilla', Number(req.params.id), req.usuario);
    if (!visible) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const [[plantilla]] = await pool.query(
      `SELECT * FROM templates WHERE id = ?`,
      [req.params.id]
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
    // thumbnail_url omitido intencionalmente: Unlayer genera miniaturas Base64
    // que son demasiado largas para almacenar como URL en la BD
  ],
  validar,
  async (req, res, next) => {
    try {
      const { nombre, descripcion, asunto, html_content, json_design } = req.body;
      const pool = db();

      const [result] = await pool.query(
        `INSERT INTO templates (user_id, nombre, descripcion, asunto, html_content, json_design)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.usuario.id,
          nombre,
          descripcion || null,
          asunto || '',
          html_content,
          json_design ? JSON.stringify(json_design) : null,
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
    body('compartida').optional().isBoolean(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();

      // Solo el dueño o un admin: ver una plantilla compartida no da derecho
      // a modificarla.
      const puede = await acceso.puedeEditar('plantilla', Number(req.params.id), req.usuario);
      if (!puede) return res.status(404).json({ error: 'Plantilla no encontrada' });

      const campos = ['nombre', 'descripcion', 'asunto', 'html_content'];
      const sets = [];
      const valores = [];

      for (const campo of campos) {
        if (req.body[campo] !== undefined) {
          sets.push(`\`${campo}\` = ?`);
          valores.push(req.body[campo]);
        }
      }

      // Compartir es exclusivo del administrador.
      if (req.body.compartida !== undefined) {
        if (!acceso.esAdmin(req.usuario)) {
          return res.status(403).json({
            error: 'Solo un administrador puede compartir o dejar de compartir una plantilla',
          });
        }
        sets.push('`compartida` = ?');
        valores.push(req.body.compartida ? 1 : 0);
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

    const puede = await acceso.puedeEditar('plantilla', Number(req.params.id), req.usuario);
    if (!puede) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const [result] = await pool.query(
      'DELETE FROM templates WHERE id = ?',
      [req.params.id]
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

    // Basta con poder VERLA: duplicar una plantilla compartida es la vía
    // natural para partir de una corporativa. La copia nace privada y del
    // usuario que duplica.
    const visible = await acceso.puedeVer('plantilla', Number(req.params.id), req.usuario);
    if (!visible) return res.status(404).json({ error: 'Plantilla no encontrada' });

    const [[original]] = await pool.query(
      'SELECT * FROM templates WHERE id = ?',
      [req.params.id]
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
