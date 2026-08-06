const express = require('express');
const { db } = require('../config/database');
const { autenticar } = require('../middleware/auth');
const acceso = require('../services/accesoService');
const logger = require('../config/logger');

const router = express.Router();
router.use(autenticar);

/**
 * GET /api/dashboard/stats
 *
 * Métricas de portada, con el mismo criterio de visibilidad que el resto:
 *   - admin  → todo, de todos los usuarios
 *   - editor → sus campañas, y los contactos de las listas que puede ver
 *              (propias más compartidas)
 *
 * Las campañas no son compartibles: un editor ve las suyas. Los contactos sí,
 * porque siguen la visibilidad de su lista.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const pool = db();
    const esAdmin = acceso.esAdmin(req.usuario);
    const userId = req.usuario.id;

    // Filtro de campañas según rol (misma regla que el resto de la aplicación).
    const filtro = acceso.filtroCampana(req.usuario, 'c');
    const filtroCampanas = `AND ${filtro.sql}`;
    const paramsCampanas = filtro.params;

    // ── Contactos visibles ──
    // Siguen la visibilidad de su lista, no la del propio contacto.
    const [[contactos]] = esAdmin
      ? await pool.query('SELECT COUNT(*) AS total FROM contacts')
      : await pool.query(
          `SELECT COUNT(*) AS total
           FROM contacts co
           JOIN contact_lists cl ON cl.id = co.list_id
           WHERE cl.user_id = ? OR cl.compartida = 1`,
          [userId]
        );

    // ── Agregados de campañas ──
    // Una sola pasada sobre `campaigns`, que es pequeña. Deliberadamente NO se
    // agrega sobre campaign_sends: esa tabla crece sin límite por el soft delete
    // y no hace falta para estas cifras.
    const [[agregados]] = await pool.query(
      `SELECT
         COUNT(CASE WHEN c.enviados > 0 THEN 1 END) AS campanas_enviadas,
         COALESCE(SUM(c.enviados), 0) AS total_enviados,
         COALESCE(SUM(c.abiertos), 0) AS total_abiertos,
         COALESCE(SUM(CASE WHEN c.enviados > 0 THEN c.enviados END), 0) AS base_apertura
       FROM campaigns c
       WHERE c.deleted_at IS NULL ${filtroCampanas}`,
      paramsCampanas
    );

    // Tasa de apertura global: aperturas sobre correos entregados. Se calcula
    // sobre los totales, no promediando porcentajes de campañas, para que una
    // campaña de 5 correos no pese lo mismo que una de 5.000.
    const baseApertura = Number(agregados?.base_apertura || 0);
    const tasaApertura = baseApertura > 0
      ? Math.round((Number(agregados.total_abiertos) / baseApertura) * 1000) / 10
      : 0;

    // ── Campañas recientes ──
    const [recientes] = await pool.query(
      `SELECT c.id, c.nombre, c.estado, c.enviados, c.total_envios, c.created_at
       FROM campaigns c
       WHERE c.deleted_at IS NULL ${filtroCampanas}
       ORDER BY c.created_at DESC
       LIMIT 5`,
      paramsCampanas
    );

    res.json({
      total_contactos: Number(contactos?.total || 0),
      total_campanas: Number(agregados?.campanas_enviadas || 0),
      total_enviados: Number(agregados?.total_enviados || 0),
      tasa_apertura_promedio: tasaApertura,
      campanas_recientes: recientes,
      // Permite a la interfaz aclarar el alcance de lo que se está viendo.
      alcance: esAdmin ? 'global' : 'propio',
    });
  } catch (error) {
    logger.error('Error en stats del dashboard:', error);
    next(error);
  }
});

module.exports = router;
