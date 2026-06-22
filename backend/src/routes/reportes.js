const express = require('express');
const { db } = require('../config/database');
const { autenticar: verificarToken } = require('../middleware/auth');
const logger = require('../config/logger');

const router = express.Router();
router.use(verificarToken);

// ── Helpers ──────────────────────────────────────────────────────────────────

// Verifica que la campaña pertenece al usuario autenticado
async function obtenerCampana(pool, campaignId, userId) {
  const [[campana]] = await pool.query(
    `SELECT c.*, cl.nombre AS lista_nombre, cl.id AS list_id_val,
            sc.host AS smtp_host, sc.from_email AS smtp_from_email
     FROM campaigns c
     LEFT JOIN contact_lists cl ON cl.id = c.list_id
     LEFT JOIN smtp_configs sc ON sc.id = c.smtp_config_id
     WHERE c.id = ? AND c.user_id = ?`,
    [campaignId, userId]
  );
  return campana;
}

// ── GET /api/reportes/general ─────────────────────────────────────────────────
// Dashboard global: métricas agregadas de todas las campañas del usuario
router.get('/general', async (req, res) => {
  try {
    const pool = db();
    const userId = req.usuario.id;

    const [[totales]] = await pool.query(
      `SELECT
         COUNT(*) AS total_campanas,
         SUM(total_envios) AS total_envios,
         SUM(enviados) AS total_enviados,
         SUM(fallidos) AS total_fallidos,
         SUM(abiertos) AS total_abiertos,
         SUM(clicks) AS total_clicks,
         COUNT(CASE WHEN estado = 'completada' THEN 1 END) AS completadas,
         COUNT(CASE WHEN estado = 'enviando' THEN 1 END) AS en_envio,
         COUNT(CASE WHEN estado = 'borrador' THEN 1 END) AS borradores
       FROM campaigns
       WHERE user_id = ?`,
      [userId]
    );

    // Últimas 6 campañas completadas para gráfica de tendencia
    const [ultimasCampanas] = await pool.query(
      `SELECT id, nombre,
              COALESCE(enviados, 0) AS enviados,
              COALESCE(abiertos, 0) AS abiertos,
              COALESCE(clicks, 0) AS clicks,
              COALESCE(fallidos, 0) AS fallidos,
              completada_en, created_at
       FROM campaigns
       WHERE user_id = ? AND estado = 'completada'
       ORDER BY completada_en DESC
       LIMIT 8`,
      [userId]
    );

    // Tasa de apertura promedio (solo campañas completadas con envíos)
    const [[promedios]] = await pool.query(
      `SELECT
         AVG(CASE WHEN enviados > 0 THEN (abiertos / enviados) * 100 ELSE 0 END) AS tasa_apertura_avg,
         AVG(CASE WHEN enviados > 0 THEN (clicks / enviados) * 100 ELSE 0 END) AS tasa_clicks_avg,
         AVG(CASE WHEN total_envios > 0 THEN (fallidos / total_envios) * 100 ELSE 0 END) AS tasa_error_avg
       FROM campaigns
       WHERE user_id = ? AND estado = 'completada' AND enviados > 0`,
      [userId]
    );

    // Actividad diaria (últimos 30 días)
    const [actividadDiaria] = await pool.query(
      `SELECT DATE(cs.enviado_en) AS fecha, COUNT(*) AS enviados
       FROM campaign_sends cs
       JOIN campaigns c ON c.id = cs.campaign_id
       WHERE c.user_id = ?
         AND cs.estado = 'enviado'
         AND cs.enviado_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(cs.enviado_en)
       ORDER BY fecha`,
      [userId]
    );

    res.json({
      totales: {
        total_campanas: Number(totales.total_campanas || 0),
        total_envios:   Number(totales.total_envios   || 0),
        total_enviados: Number(totales.total_enviados || 0),
        total_fallidos: Number(totales.total_fallidos || 0),
        total_abiertos: Number(totales.total_abiertos || 0),
        total_clicks:   Number(totales.total_clicks   || 0),
        completadas:    Number(totales.completadas    || 0),
        en_envio:       Number(totales.en_envio       || 0),
        borradores:     Number(totales.borradores     || 0),
      },
      promedios: {
        tasa_apertura: parseFloat(promedios?.tasa_apertura_avg || 0).toFixed(1),
        tasa_clicks:   parseFloat(promedios?.tasa_clicks_avg   || 0).toFixed(1),
        tasa_error:    parseFloat(promedios?.tasa_error_avg    || 0).toFixed(1),
      },
      ultimas_campanas: ultimasCampanas,
      actividad_diaria: actividadDiaria,
    });
  } catch (error) {
    logger.error('Error en reporte general:', error);
    res.status(500).json({ error: 'Error al obtener reporte general' });
  }
});

// ── GET /api/reportes/campana/:id ─────────────────────────────────────────────
// Resumen completo de una campaña: stats + breakdown + top URLs
router.get('/campana/:id', async (req, res) => {
  try {
    const pool = db();
    const campana = await obtenerCampana(pool, req.params.id, req.usuario.id);
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    // Desglose de estados de envío
    const [estadosSends] = await pool.query(
      `SELECT estado, COUNT(*) AS total
       FROM campaign_sends WHERE campaign_id = ?
       GROUP BY estado`,
      [campana.id]
    );

    // Desglose de eventos
    const [eventos] = await pool.query(
      `SELECT tipo, COUNT(*) AS total
       FROM email_events WHERE campaign_id = ?
       GROUP BY tipo`,
      [campana.id]
    );

    // Top 10 URLs más clickeadas
    const [topUrls] = await pool.query(
      `SELECT url_click AS url, COUNT(*) AS total
       FROM email_events
       WHERE campaign_id = ? AND tipo = 'click' AND url_click IS NOT NULL
       GROUP BY url_click
       ORDER BY total DESC
       LIMIT 10`,
      [campana.id]
    );

    // Timeline: envíos por día
    const [timelineEnvios] = await pool.query(
      `SELECT DATE(enviado_en) AS fecha,
              SUM(CASE WHEN estado = 'enviado'  THEN 1 ELSE 0 END) AS enviados,
              SUM(CASE WHEN estado = 'fallido'  THEN 1 ELSE 0 END) AS fallidos,
              SUM(CASE WHEN estado = 'rebotado' THEN 1 ELSE 0 END) AS rebotados
       FROM campaign_sends
       WHERE campaign_id = ? AND enviado_en IS NOT NULL
       GROUP BY DATE(enviado_en)
       ORDER BY fecha`,
      [campana.id]
    );

    // Timeline: eventos por día
    const [timelineEventos] = await pool.query(
      `SELECT DATE(created_at) AS fecha, tipo, COUNT(*) AS total
       FROM email_events
       WHERE campaign_id = ?
       GROUP BY DATE(created_at), tipo
       ORDER BY fecha`,
      [campana.id]
    );

    // Merge de timelines por fecha
    const fechasMap = {};
    for (const row of timelineEnvios) {
      const f = row.fecha?.toISOString?.()?.slice(0, 10) || String(row.fecha);
      fechasMap[f] = {
        fecha: f,
        enviados: Number(row.enviados || 0),
        fallidos: Number(row.fallidos || 0),
        rebotados: Number(row.rebotados || 0),
        aperturas: 0,
        clicks: 0,
      };
    }
    for (const row of timelineEventos) {
      const f = row.fecha?.toISOString?.()?.slice(0, 10) || String(row.fecha);
      if (!fechasMap[f]) fechasMap[f] = { fecha: f, enviados: 0, fallidos: 0, rebotados: 0, aperturas: 0, clicks: 0 };
      if (row.tipo === 'apertura') fechasMap[f].aperturas += Number(row.total || 0);
      if (row.tipo === 'click')    fechasMap[f].clicks    += Number(row.total || 0);
    }
    const timeline = Object.values(fechasMap).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Tasas calculadas
    const enviados = Number(campana.enviados || 0);
    const tasaApertura = enviados > 0 ? ((campana.abiertos / enviados) * 100).toFixed(1) : '0.0';
    const tasaClick    = enviados > 0 ? ((campana.clicks   / enviados) * 100).toFixed(1) : '0.0';
    const tasaError    = campana.total_envios > 0
      ? ((campana.fallidos / campana.total_envios) * 100).toFixed(1) : '0.0';
    const tasaNoEntregado = campana.total_envios > 0
      ? (((campana.fallidos) / campana.total_envios) * 100).toFixed(1) : '0.0';

    res.json({
      campana: {
        id: campana.id,
        nombre: campana.nombre,
        asunto: campana.asunto,
        from_nombre: campana.from_nombre,
        from_email: campana.from_email,
        estado: campana.estado,
        lista_nombre: campana.lista_nombre,
        smtp_host: campana.smtp_host,
        total_envios: Number(campana.total_envios || 0),
        enviados:     Number(campana.enviados     || 0),
        fallidos:     Number(campana.fallidos     || 0),
        abiertos:     Number(campana.abiertos     || 0),
        clicks:       Number(campana.clicks       || 0),
        programada_para: campana.programada_para,
        iniciada_en:    campana.iniciada_en,
        completada_en:  campana.completada_en,
        created_at:     campana.created_at,
      },
      tasas: {
        apertura: tasaApertura,
        click:    tasaClick,
        error:    tasaError,
        no_entregado: tasaNoEntregado,
      },
      estados_sends: estadosSends,
      eventos,
      top_urls: topUrls,
      timeline,
    });
  } catch (error) {
    logger.error('Error en reporte de campaña:', error);
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
});

// ── GET /api/reportes/campana/:id/aperturas ───────────────────────────────────
router.get('/campana/:id/aperturas', async (req, res) => {
  try {
    const pool = db();
    const campana = await obtenerCampana(pool, req.params.id, req.usuario.id);
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    const pagina    = Math.max(1, parseInt(req.query.pagina || '1'));
    const porPagina = Math.min(100, parseInt(req.query.por_pagina || '50'));
    const offset    = (pagina - 1) * porPagina;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT cs.id) AS total
       FROM campaign_sends cs
       JOIN email_events ee ON ee.send_id = cs.id AND ee.tipo = 'apertura'
       WHERE cs.campaign_id = ?`,
      [campana.id]
    );

    const [rows] = await pool.query(
      `SELECT cs.id AS send_id, cs.email,
              co.nombre, co.empresa,
              MIN(ee.created_at) AS primera_apertura,
              COUNT(ee.id)       AS total_aperturas,
              ee.ip, ee.user_agent
       FROM campaign_sends cs
       JOIN email_events ee ON ee.send_id = cs.id AND ee.tipo = 'apertura'
       LEFT JOIN contacts co ON co.id = cs.contact_id
       WHERE cs.campaign_id = ?
       GROUP BY cs.id, cs.email, co.nombre, co.empresa, ee.ip, ee.user_agent
       ORDER BY primera_apertura DESC
       LIMIT ? OFFSET ?`,
      [campana.id, porPagina, offset]
    );

    res.json({ total: Number(total), pagina, por_pagina: porPagina, aperturas: rows });
  } catch (error) {
    logger.error('Error en aperturas:', error);
    res.status(500).json({ error: 'Error al obtener aperturas' });
  }
});

// ── GET /api/reportes/campana/:id/clicks ─────────────────────────────────────
router.get('/campana/:id/clicks', async (req, res) => {
  try {
    const pool = db();
    const campana = await obtenerCampana(pool, req.params.id, req.usuario.id);
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    const pagina    = Math.max(1, parseInt(req.query.pagina || '1'));
    const porPagina = Math.min(100, parseInt(req.query.por_pagina || '50'));
    const offset    = (pagina - 1) * porPagina;

    // Clicks por contacto
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT cs.id) AS total
       FROM campaign_sends cs
       JOIN email_events ee ON ee.send_id = cs.id AND ee.tipo = 'click'
       WHERE cs.campaign_id = ?`,
      [campana.id]
    );

    const [rows] = await pool.query(
      `SELECT cs.id AS send_id, cs.email,
              co.nombre, co.empresa,
              MIN(ee.created_at) AS primer_click,
              COUNT(ee.id)       AS total_clicks,
              GROUP_CONCAT(DISTINCT ee.url_click ORDER BY ee.created_at SEPARATOR '|||') AS urls
       FROM campaign_sends cs
       JOIN email_events ee ON ee.send_id = cs.id AND ee.tipo = 'click'
       LEFT JOIN contacts co ON co.id = cs.contact_id
       WHERE cs.campaign_id = ?
       GROUP BY cs.id, cs.email, co.nombre, co.empresa
       ORDER BY total_clicks DESC, primer_click DESC
       LIMIT ? OFFSET ?`,
      [campana.id, porPagina, offset]
    );

    // Limpiar GROUP_CONCAT a arrays
    const clicksLimpios = rows.map(r => ({
      ...r,
      urls: r.urls ? r.urls.split('|||').filter(Boolean) : [],
    }));

    // Top URLs (breakdown global)
    const [topUrls] = await pool.query(
      `SELECT url_click AS url, COUNT(*) AS total,
              COUNT(DISTINCT send_id) AS contactos_unicos
       FROM email_events
       WHERE campaign_id = ? AND tipo = 'click' AND url_click IS NOT NULL
       GROUP BY url_click
       ORDER BY total DESC
       LIMIT 20`,
      [campana.id]
    );

    res.json({ total: Number(total), pagina, por_pagina: porPagina, clicks: clicksLimpios, top_urls: topUrls });
  } catch (error) {
    logger.error('Error en clicks:', error);
    res.status(500).json({ error: 'Error al obtener clicks' });
  }
});

// ── GET /api/reportes/campana/:id/no-entregados ───────────────────────────────
router.get('/campana/:id/no-entregados', async (req, res) => {
  try {
    const pool = db();
    const campana = await obtenerCampana(pool, req.params.id, req.usuario.id);
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    const pagina    = Math.max(1, parseInt(req.query.pagina || '1'));
    const porPagina = Math.min(100, parseInt(req.query.por_pagina || '50'));
    const offset    = (pagina - 1) * porPagina;
    const filtro    = req.query.estado || ''; // 'fallido' | 'rebotado' | ''

    const condEstado = filtro ? 'AND cs.estado = ?' : "AND cs.estado IN ('fallido','rebotado')";
    const params     = filtro
      ? [campana.id, filtro, porPagina, offset]
      : [campana.id, porPagina, offset];

    const countParams = filtro ? [campana.id, filtro] : [campana.id];

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM campaign_sends cs
       WHERE cs.campaign_id = ? ${condEstado}`,
      countParams
    );

    const [rows] = await pool.query(
      `SELECT cs.id AS send_id, cs.email, cs.estado, cs.intentos,
              cs.ultimo_error, cs.enviado_en,
              co.nombre, co.empresa
       FROM campaign_sends cs
       LEFT JOIN contacts co ON co.id = cs.contact_id
       WHERE cs.campaign_id = ? ${condEstado}
       ORDER BY cs.enviado_en DESC
       LIMIT ? OFFSET ?`,
      params
    );

    res.json({ total: Number(total), pagina, por_pagina: porPagina, sends: rows });
  } catch (error) {
    logger.error('Error en no-entregados:', error);
    res.status(500).json({ error: 'Error al obtener no entregados' });
  }
});

// ── GET /api/reportes/campana/:id/exportar ────────────────────────────────────
// Descarga el reporte completo en CSV
router.get('/campana/:id/exportar', async (req, res) => {
  try {
    const pool = db();
    const campana = await obtenerCampana(pool, req.params.id, req.usuario.id);
    if (!campana) return res.status(404).json({ error: 'Campaña no encontrada' });

    const [rows] = await pool.query(
      `SELECT
         cs.email,
         COALESCE(co.nombre, '') AS nombre,
         COALESCE(co.empresa, '') AS empresa,
         cs.estado,
         COALESCE(cs.enviado_en, '') AS enviado_en,
         cs.intentos,
         COALESCE(cs.ultimo_error, '') AS ultimo_error,
         MAX(CASE WHEN ee.tipo = 'apertura' THEN ee.created_at ELSE NULL END) AS primera_apertura,
         COUNT(DISTINCT CASE WHEN ee.tipo = 'click'    THEN ee.id ELSE NULL END) AS total_clicks,
         COUNT(DISTINCT CASE WHEN ee.tipo = 'apertura' THEN ee.id ELSE NULL END) AS total_aperturas
       FROM campaign_sends cs
       LEFT JOIN contacts co ON co.id = cs.contact_id
       LEFT JOIN email_events ee ON ee.send_id = cs.id
       WHERE cs.campaign_id = ?
       GROUP BY cs.id, cs.email, co.nombre, co.empresa,
                cs.estado, cs.enviado_en, cs.intentos, cs.ultimo_error
       ORDER BY cs.enviado_en DESC`,
      [campana.id]
    );

    // Generar CSV manualmente
    const escapar = (v) => {
      const str = String(v ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const encabezado = [
      'Email', 'Nombre', 'Empresa', 'Estado', 'Enviado el',
      'Intentos', 'Error', 'Primera apertura', 'Total aperturas', 'Total clicks',
    ];

    const lineas = [
      encabezado.join(','),
      ...rows.map(r => [
        r.email, r.nombre, r.empresa, r.estado,
        r.enviado_en ? new Date(r.enviado_en).toLocaleString('es-ES') : '',
        r.intentos,
        r.ultimo_error,
        r.primera_apertura ? new Date(r.primera_apertura).toLocaleString('es-ES') : '',
        r.total_aperturas,
        r.total_clicks,
      ].map(escapar).join(',')),
    ];

    const nombreArchivo = `reporte_${campana.nombre.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    // BOM para que Excel abra bien con tildes
    res.send('﻿' + lineas.join('\r\n'));
  } catch (error) {
    logger.error('Error al exportar CSV:', error);
    res.status(500).json({ error: 'Error al exportar reporte' });
  }
});

module.exports = router;
