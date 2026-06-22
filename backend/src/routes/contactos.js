const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');
const { subirCSV } = require('../config/multer');
const {
  leerArchivo,
  procesarContactos,
  insertarContactos,
  limpiarArchivo,
} = require('../services/importService');

const router = express.Router();
router.use(autenticar);

function validar(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contactos?list_id=&q=&pagina=&por_pagina=&estado=
// Listar contactos con búsqueda y paginación
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  [
    query('list_id').optional().isInt().toInt(),
    query('pagina').optional().isInt({ min: 1 }).toInt().default(1),
    query('por_pagina').optional().isInt({ min: 5, max: 200 }).toInt().default(50),
    query('q').optional().trim(),
    query('estado').optional().isIn(['todos', 'validos', 'invalidos', 'desuscritos']),
  ],
  validar,
  async (req, res, next) => {
    try {
      const {
        list_id,
        q,
        pagina = 1,
        por_pagina = 50,
        estado = 'todos',
      } = req.query;

      const pool = db();
      const params = [req.usuario.id];
      let where = 'c.user_id = ?';

      if (list_id) {
        where += ' AND c.list_id = ?';
        params.push(list_id);
      } else {
        // Solo mostrar contactos de listas del usuario
        where += ' AND c.list_id IN (SELECT id FROM contact_lists WHERE user_id = ?)';
        params.push(req.usuario.id);
      }

      if (q) {
        where += ' AND (c.email LIKE ? OR c.nombre LIKE ? OR c.empresa LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like);
      }

      if (estado === 'validos') {
        where += ' AND c.email_valido = 1 AND c.suscrito = 1';
      } else if (estado === 'invalidos') {
        where += ' AND c.email_valido = 0';
      } else if (estado === 'desuscritos') {
        where += ' AND c.suscrito = 0';
      }

      // Total para paginación
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) as total FROM contacts c WHERE ${where}`,
        params
      );

      const offset = (pagina - 1) * por_pagina;
      const [contactos] = await pool.query(
        `SELECT c.id, c.nombre, c.email, c.empresa, c.email_valido, c.suscrito,
                c.fecha_unsub, c.created_at,
                cl.nombre AS lista_nombre
         FROM contacts c
         LEFT JOIN contact_lists cl ON cl.id = c.list_id
         WHERE ${where}
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, por_pagina, offset]
      );

      res.json({
        contactos,
        paginacion: {
          total,
          pagina,
          por_pagina,
          total_paginas: Math.ceil(total / por_pagina),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contactos - Agregar contacto manual
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('list_id').isInt({ min: 1 }).toInt().withMessage('list_id requerido'),
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('nombre').optional().trim(),
    body('empresa').optional().trim(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const { list_id, email, nombre, empresa } = req.body;
      const pool = db();

      // Verificar que la lista pertenece al usuario
      const [[lista]] = await pool.query(
        'SELECT id FROM contact_lists WHERE id = ? AND user_id = ?',
        [list_id, req.usuario.id]
      );
      if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });

      // Verificar que no está en lista negra
      const [[unsub]] = await pool.query(
        'SELECT id FROM unsubscribes WHERE email = ?',
        [email]
      );
      if (unsub) {
        return res.status(409).json({ error: 'Este email está en la lista de desuscripciones' });
      }

      const [result] = await pool.query(
        `INSERT INTO contacts (list_id, user_id, nombre, email, empresa)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), empresa = VALUES(empresa)`,
        [list_id, req.usuario.id, nombre || email.split('@')[0], email, empresa || null]
      );

      // Actualizar contadores de la lista
      await actualizarContadores(pool, list_id);

      const [[contacto]] = await pool.query('SELECT * FROM contacts WHERE id = ?', [
        result.insertId || (await pool.query('SELECT id FROM contacts WHERE list_id=? AND email=?', [list_id, email]))[0][0]?.id,
      ]);

      res.status(201).json({ contacto, mensaje: 'Contacto agregado correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/contactos/:id - Editar contacto
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('nombre').optional().trim(),
    body('empresa').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();
      const [[contacto]] = await pool.query(
        'SELECT * FROM contacts WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );
      if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

      const { nombre, empresa, email } = req.body;
      const sets = [];
      const valores = [];

      if (nombre !== undefined) { sets.push('nombre = ?'); valores.push(nombre); }
      if (empresa !== undefined) { sets.push('empresa = ?'); valores.push(empresa); }
      if (email !== undefined) {
        sets.push('email = ?');
        valores.push(email);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

      valores.push(req.params.id);
      await pool.query(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, valores);
      res.json({ mensaje: 'Contacto actualizado' });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/contactos/:id - Eliminar contacto
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [[contacto]] = await pool.query(
      'SELECT list_id FROM contacts WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

    await pool.query('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    await actualizarContadores(pool, contacto.list_id);
    res.json({ mensaje: 'Contacto eliminado' });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/contactos (bulk) - Eliminar múltiples contactos
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/', [body('ids').isArray({ min: 1 })], validar, async (req, res, next) => {
  try {
    const { ids } = req.body;
    const pool = db();

    // Obtener list_ids afectados antes de borrar
    const [afectados] = await pool.query(
      `SELECT DISTINCT list_id FROM contacts WHERE id IN (?) AND user_id = ?`,
      [ids, req.usuario.id]
    );

    await pool.query(
      'DELETE FROM contacts WHERE id IN (?) AND user_id = ?',
      [ids, req.usuario.id]
    );

    for (const { list_id } of afectados) {
      await actualizarContadores(pool, list_id);
    }

    res.json({ mensaje: `${ids.length} contacto(s) eliminado(s)` });
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contactos/importar/preview - Previsualizar archivo antes de importar
// ─────────────────────────────────────────────────────────────────────────────
router.post('/importar/preview', subirCSV.single('archivo'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }

  try {
    const { headers, filas, total } = leerArchivo(req.file.path);

    // Devolver primeras 5 filas como preview
    res.json({
      archivo_id: req.file.filename,
      headers,
      preview: filas.slice(0, 5),
      total,
      mensaje: `Archivo leído: ${total} filas encontradas`,
    });
  } catch (error) {
    limpiarArchivo(req.file?.path);
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contactos/importar/ejecutar - Ejecutar importación con mapeo
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/importar/ejecutar',
  [
    body('archivo_id').notEmpty().withMessage('archivo_id requerido'),
    body('list_id').isInt({ min: 1 }).toInt().withMessage('list_id requerido'),
    body('mapeo.email').notEmpty().withMessage('Debes mapear la columna de email'),
  ],
  validar,
  async (req, res, next) => {
    const path = require('path');
    const { UPLOAD_PATH } = require('../config/multer');

    try {
      const { archivo_id, list_id, mapeo } = req.body;
      const pool = db();

      // Verificar que la lista pertenece al usuario
      const [[lista]] = await pool.query(
        'SELECT id, nombre FROM contact_lists WHERE id = ? AND user_id = ?',
        [list_id, req.usuario.id]
      );
      if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });

      // Verificar que el archivo existe
      const rutaArchivo = path.join(UPLOAD_PATH, archivo_id);
      if (!require('fs').existsSync(rutaArchivo)) {
        return res.status(404).json({ error: 'Archivo no encontrado. Vuelve a subir el archivo.' });
      }

      // Leer y procesar
      const { filas } = leerArchivo(rutaArchivo);
      const { validos, invalidos, duplicados } = procesarContactos(filas, mapeo);

      // Insertar en DB
      const { insertados } = await insertarContactos(pool, list_id, req.usuario.id, validos);

      // Limpiar archivo temporal
      limpiarArchivo(rutaArchivo);

      res.json({
        mensaje: `Importación completada en lista "${lista.nombre}"`,
        resumen: {
          total_filas: filas.length,
          insertados,
          duplicados_archivo: duplicados.length,
          invalidos: invalidos.length,
          omitidos_duplicados_db: validos.length - insertados,
        },
        errores: invalidos.slice(0, 20), // primeros 20 errores como muestra
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contactos/:id/desuscribir - Desuscribir manualmente
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/desuscribir', async (req, res, next) => {
  try {
    const pool = db();
    const [[contacto]] = await pool.query(
      'SELECT * FROM contacts WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!contacto) return res.status(404).json({ error: 'Contacto no encontrado' });

    await pool.query(
      'UPDATE contacts SET suscrito = 0, fecha_unsub = NOW() WHERE id = ?',
      [req.params.id]
    );

    // Añadir a lista negra global
    await pool.query(
      `INSERT IGNORE INTO unsubscribes (email, motivo) VALUES (?, 'manual')`,
      [contacto.email]
    );

    await actualizarContadores(pool, contacto.list_id);
    res.json({ mensaje: 'Contacto desuscrito' });
  } catch (error) {
    next(error);
  }
});

async function actualizarContadores(pool, listId) {
  await pool.query(
    `UPDATE contact_lists
     SET total_contactos = (SELECT COUNT(*) FROM contacts WHERE list_id = ?),
         activos = (SELECT COUNT(*) FROM contacts WHERE list_id = ? AND suscrito = 1)
     WHERE id = ?`,
    [listId, listId, listId]
  );
}

module.exports = router;
