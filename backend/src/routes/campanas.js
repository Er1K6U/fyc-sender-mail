const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');
const {
  encolarCampaña,
  pausarCampaña,
  reanudarCampaña,
  cancelarCampaña,
  estadisticasCola,
} = require('../services/queueService');
const logger = require('../config/logger');

const router = express.Router();
router.use(autenticar);

function validar(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

// ── GET /api/campanas ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const pool = db();
    const [campanas] = await pool.query(
      `SELECT c.id, c.nombre, c.asunto, c.from_nombre, c.from_email,
              c.estado, c.total_envios, c.enviados, c.fallidos, c.abiertos,
              c.clicks, c.programada_para, c.iniciada_en, c.completada_en,
              c.created_at,
              cl.nombre AS lista_nombre,
              t.nombre AS template_nombre,
              s.nombre AS smtp_nombre
       FROM campaigns c
       LEFT JOIN contact_lists cl ON cl.id = c.list_id
       LEFT JOIN templates t ON t.id = c.template_id
       LEFT JOIN smtp_configs s ON s.id = c.smtp_config_id
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.usuario.id]
    );
    res.json({ campanas });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/campanas/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      `SELECT c.*,
              cl.nombre AS lista_nombre, cl.total_contactos AS lista_total,
              t.nombre AS template_nombre,
              s.nombre AS smtp_nombre, s.limite_dia, s.enviados_hoy
       FROM campaigns c
       LEFT JOIN contact_lists cl ON cl.id = c.list_id
       LEFT JOIN templates t ON t.id = c.template_id
       LEFT JOIN smtp_configs s ON s.id = c.smtp_config_id
       WHERE c.id = ? AND c.user_id = ?`,
      [req.params.id, req.usuario.id]
    );
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });
    res.json({ campana });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/campanas ────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre es requerido'),
    body('asunto').trim().notEmpty().withMessage('El asunto es requerido'),
    body('from_nombre').trim().notEmpty().withMessage('El nombre del remitente es requerido'),
    body('from_email').isEmail().withMessage('El email del remitente es inválido'),
    body('list_id').isInt({ min: 1 }).toInt().withMessage('Debes seleccionar una lista'),
    body('smtp_config_id').isInt({ min: 1 }).toInt().withMessage('Debes seleccionar una cuenta SMTP'),
    body('html_content').notEmpty().withMessage('El contenido HTML es requerido'),
    body('template_id').optional().isInt().toInt(),
    body('emails_por_min').optional().isInt({ min: 1, max: 500 }).toInt(),
    body('emails_por_hora').optional().isInt({ min: 1, max: 10000 }).toInt(),
    body('pausa_entre_lotes_ms').optional().isInt({ min: 0 }).toInt(),
    body('programada_para').optional().isISO8601().toDate(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();
      const {
        nombre, asunto, from_nombre, from_email,
        list_id, smtp_config_id, html_content, template_id,
        emails_por_min, emails_por_hora, pausa_entre_lotes_ms,
        programada_para,
      } = req.body;

      // Verificar que la lista pertenece al usuario
      const [[lista]] = await pool.query(
        'SELECT id, activos FROM contact_lists WHERE id = ? AND user_id = ?',
        [list_id, req.usuario.id]
      );
      if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });

      // Verificar que el SMTP pertenece al usuario
      const [[smtp]] = await pool.query(
        'SELECT id FROM smtp_configs WHERE id = ? AND user_id = ? AND activo = 1',
        [smtp_config_id, req.usuario.id]
      );
      if (!smtp) return res.status(404).json({ error: 'Configuración SMTP no encontrada o inactiva' });

      const estado = programada_para ? 'programada' : 'borrador';

      const [result] = await pool.query(
        `INSERT INTO campaigns
           (user_id, nombre, asunto, from_nombre, from_email,
            list_id, smtp_config_id, html_content, template_id,
            emails_por_min, emails_por_hora, pausa_entre_lotes_ms,
            programada_para, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.usuario.id, nombre, asunto, from_nombre, from_email,
          list_id, smtp_config_id, html_content, template_id || null,
          emails_por_min || 20, emails_por_hora || 200,
          pausa_entre_lotes_ms || 3000,
          programada_para || null, estado,
        ]
      );

      const [[nueva]] = await pool.query(
        'SELECT id, nombre, asunto, estado, created_at FROM campaigns WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({ campana: nueva, mensaje: 'Campaña creada correctamente' });
    } catch (error) {
      next(error);
    }
  }
);

// ── PUT /api/campanas/:id ─────────────────────────────────────────────────────
router.put(
  '/:id',
  [
    param('id').isInt().toInt(),
    body('nombre').optional().trim().notEmpty(),
    body('asunto').optional().trim().notEmpty(),
    body('from_nombre').optional().trim().notEmpty(),
    body('from_email').optional().isEmail(),
    body('html_content').optional().notEmpty(),
    body('emails_por_min').optional().isInt({ min: 1, max: 500 }).toInt(),
    body('programada_para').optional().isISO8601().toDate(),
  ],
  validar,
  async (req, res, next) => {
    try {
      const pool = db();
      const [[campana]] = await pool.query(
        'SELECT id, estado FROM campaigns WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );
      if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });
      if (['enviando', 'completada'].includes(campana.estado)) {
        return res.status(409).json({ error: `No se puede editar una campaña en estado "${campana.estado}"` });
      }

      const editables = ['nombre', 'asunto', 'from_nombre', 'from_email', 'html_content',
        'emails_por_min', 'emails_por_hora', 'pausa_entre_lotes_ms', 'programada_para',
        'list_id', 'smtp_config_id', 'template_id'];
      const sets = [];
      const valores = [];

      for (const campo of editables) {
        if (req.body[campo] !== undefined) {
          sets.push(`\`${campo}\` = ?`);
          valores.push(req.body[campo]);
        }
      }

      if (sets.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

      valores.push(req.params.id);
      await pool.query(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`, valores);
      res.json({ mensaje: 'Campaña actualizada' });
    } catch (error) {
      next(error);
    }
  }
);

// ── DELETE /api/campanas/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      'SELECT estado FROM campaigns WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (campana.estado === 'enviando') {
      return res.status(409).json({ error: 'No se puede eliminar una campaña en curso. Paúsala primero.' });
    }

    await pool.query('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    res.json({ mensaje: 'Campaña eliminada' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/campanas/:id/iniciar ────────────────────────────────────────────
router.post('/:id/iniciar', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      `SELECT c.*, s.verificado, s.limite_dia, s.enviados_hoy
       FROM campaigns c
       JOIN smtp_configs s ON s.id = c.smtp_config_id
       WHERE c.id = ? AND c.user_id = ?`,
      [req.params.id, req.usuario.id]
    );

    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (!['borrador', 'programada', 'pausada'].includes(campana.estado)) {
      return res.status(409).json({ error: `No se puede iniciar una campaña en estado "${campana.estado}"` });
    }
    if (!campana.verificado) {
      return res.status(400).json({ error: 'La cuenta SMTP no está verificada. Prueba la conexión primero.' });
    }

    const disponibleHoy = campana.limite_dia - campana.enviados_hoy;
    if (disponibleHoy <= 0) {
      return res.status(400).json({
        error: `La cuenta SMTP alcanzó su límite diario (${campana.limite_dia} emails). Espera a mañana o usa otra cuenta.`,
      });
    }

    await pool.query(
      `UPDATE campaigns SET estado = 'enviando', iniciada_en = COALESCE(iniciada_en, NOW()) WHERE id = ?`,
      [req.params.id]
    );

    // Encolar en background (no awaitar para responder rápido al cliente)
    encolarCampaña(req.params.id).catch(err => {
      logger.error(`Error al encolar campaña ${req.params.id}:`, err);
      pool.query(`UPDATE campaigns SET estado = 'error' WHERE id = ?`, [req.params.id]);
    });

    res.json({ mensaje: 'Campaña iniciada. Los emails se están encolando.' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/campanas/:id/pausar ─────────────────────────────────────────────
router.post('/:id/pausar', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      'SELECT estado FROM campaigns WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (campana.estado !== 'enviando') {
      return res.status(409).json({ error: 'Solo se pueden pausar campañas en envío' });
    }

    await pausarCampaña(req.params.id);
    res.json({ mensaje: 'Campaña pausada' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/campanas/:id/reanudar ───────────────────────────────────────────
router.post('/:id/reanudar', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      'SELECT estado FROM campaigns WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (campana.estado !== 'pausada') {
      return res.status(409).json({ error: 'Solo se pueden reanudar campañas pausadas' });
    }

    reanudarCampaña(req.params.id).catch(err =>
      logger.error(`Error al reanudar campaña ${req.params.id}:`, err)
    );

    res.json({ mensaje: 'Campaña reanudada' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/campanas/:id/cancelar ───────────────────────────────────────────
router.post('/:id/cancelar', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      'SELECT estado FROM campaigns WHERE id = ? AND user_id = ?',
      [req.params.id, req.usuario.id]
    );
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    await cancelarCampaña(req.params.id);
    res.json({ mensaje: 'Campaña cancelada' });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/campanas/:id/sends ───────────────────────────────────────────────
// Historial de envíos individuales (paginado)
router.get(
  '/:id/sends',
  [
    param('id').isInt().toInt(),
    query('pagina').optional().isInt({ min: 1 }).toInt().default(1),
    query('por_pagina').optional().isInt({ min: 10, max: 200 }).toInt().default(50),
    query('estado').optional().isIn(['pendiente', 'enviado', 'fallido', 'rebotado']),
  ],
  validar,
  async (req, res, next) => {
    try {
      const { pagina = 1, por_pagina = 50, estado } = req.query;
      const pool = db();

      // Verificar pertenencia
      const [[campana]] = await pool.query(
        'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
        [req.params.id, req.usuario.id]
      );
      if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

      let where = 'cs.campaign_id = ?';
      const params = [req.params.id];
      if (estado) { where += ' AND cs.estado = ?'; params.push(estado); }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) as total FROM campaign_sends cs WHERE ${where}`,
        params
      );

      const offset = (pagina - 1) * por_pagina;
      const [sends] = await pool.query(
        `SELECT cs.id, cs.email, cs.estado, cs.intentos, cs.ultimo_error,
                cs.enviado_en, cs.created_at,
                c.nombre AS contacto_nombre
         FROM campaign_sends cs
         LEFT JOIN contacts c ON c.id = cs.contact_id
         WHERE ${where}
         ORDER BY cs.created_at ASC
         LIMIT ? OFFSET ?`,
        [...params, por_pagina, offset]
      );

      res.json({
        sends,
        paginacion: {
          total, pagina, por_pagina,
          total_paginas: Math.ceil(total / por_pagina),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── GET /api/campanas/:id/progreso ────────────────────────────────────────────
// Snapshot del progreso actual (para carga inicial antes de conectar Socket)
router.get('/:id/progreso', async (req, res, next) => {
  try {
    const pool = db();
    const [[campana]] = await pool.query(
      `SELECT enviados, fallidos, total_envios, estado, iniciada_en, completada_en
       FROM campaigns WHERE id = ? AND user_id = ?`,
      [req.params.id, req.usuario.id]
    );
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    const procesados = campana.enviados + campana.fallidos;
    const pendientes = campana.total_envios - procesados;

    // Velocidad reciente
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM campaign_sends
       WHERE campaign_id = ? AND estado = 'enviado'
       AND enviado_en >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
      [req.params.id]
    );
    const velocidadPorMin = Math.round((cnt || 0) / 5);

    res.json({
      ...campana,
      procesados,
      pendientes,
      porcentaje: campana.total_envios > 0
        ? Math.round((procesados / campana.total_envios) * 100)
        : 0,
      velocidad_por_min: velocidadPorMin,
      tiempo_restante_seg: velocidadPorMin > 0
        ? Math.ceil(pendientes / velocidadPorMin) * 60
        : null,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/campanas/cola/stats ──────────────────────────────────────────────
router.get('/cola/stats', async (req, res, next) => {
  try {
    const stats = await estadisticasCola();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
