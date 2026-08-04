const express = require('express');
const { query, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { autenticar, soloAdmin } = require('../middleware/auth');
const { ETIQUETAS } = require('../services/auditService');
const logger = require('../config/logger');

const router = express.Router();

// Toda la auditoría es material sensible: solo administradores.
router.use(autenticar, soloAdmin);

function validarCampos(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Parámetros inválidos', detalles: errores.array() });
  }
  next();
}

// Rango por defecto: últimos 30 días.
function resolverRango(req) {
  const hoy = new Date();
  const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);

  const desde = req.query.desde || iso(hace30);
  const hasta = req.query.hasta || iso(hoy);
  // 'hasta' es inclusivo: se compara contra el final de ese día.
  return { desde, hasta, hastaFin: `${hasta} 23:59:59` };
}

const REGLAS_RANGO = [
  query('desde').optional().isISO8601().withMessage('Fecha "desde" inválida (YYYY-MM-DD)'),
  query('hasta').optional().isISO8601().withMessage('Fecha "hasta" inválida (YYYY-MM-DD)'),
];

// ── GET /api/auditoria/resumen ────────────────────────────────────────────────
// Totales de envío por periodo. Incluye campañas eliminadas (soft delete).
router.get(
  '/resumen',
  [...REGLAS_RANGO, query('agrupacion').optional().isIn(['dia', 'mes'])],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const { desde, hasta, hastaFin } = resolverRango(req);
      const agrupacion = req.query.agrupacion === 'mes' ? 'mes' : 'dia';

      const expresionPeriodo = agrupacion === 'mes'
        ? "DATE_FORMAT(cs.enviado_en, '%Y-%m')"
        : 'DATE(cs.enviado_en)';

      // Serie por periodo. Se cuentan los sends reales, no los contadores de
      // la campaña: es el dato por correo y sobrevive al soft delete.
      const [serie] = await pool.query(
        `SELECT ${expresionPeriodo} AS periodo,
                COUNT(*) AS enviados,
                COUNT(DISTINCT cs.campaign_id) AS campanas,
                COUNT(DISTINCT cs.smtp_config_id) AS cuentas_smtp
         FROM campaign_sends cs
         WHERE cs.estado = 'enviado'
           AND cs.enviado_en BETWEEN ? AND ?
         GROUP BY periodo
         ORDER BY periodo`,
        [desde, hastaFin]
      );

      // Totales acumulados del rango completo.
      const [[totales]] = await pool.query(
        `SELECT
           COUNT(CASE WHEN cs.estado = 'enviado'  THEN 1 END) AS enviados,
           COUNT(CASE WHEN cs.estado = 'fallido'  THEN 1 END) AS fallidos,
           COUNT(CASE WHEN cs.estado = 'rebotado' THEN 1 END) AS rebotados,
           COUNT(DISTINCT cs.campaign_id) AS campanas_implicadas
         FROM campaign_sends cs
         WHERE cs.enviado_en BETWEEN ? AND ?`,
        [desde, hastaFin]
      );

      // Cuántas de esas campañas están eliminadas (evidencia preservada).
      const [[eliminadas]] = await pool.query(
        `SELECT COUNT(DISTINCT c.id) AS total
         FROM campaigns c
         JOIN campaign_sends cs ON cs.campaign_id = c.id
         WHERE c.deleted_at IS NOT NULL
           AND cs.enviado_en BETWEEN ? AND ?`,
        [desde, hastaFin]
      );

      res.json({
        rango: { desde, hasta, agrupacion },
        serie: serie.map(r => ({
          periodo: r.periodo instanceof Date
            ? r.periodo.toISOString().slice(0, 10)
            : String(r.periodo),
          enviados: Number(r.enviados || 0),
          campanas: Number(r.campanas || 0),
          cuentas_smtp: Number(r.cuentas_smtp || 0),
        })),
        totales: {
          enviados: Number(totales?.enviados || 0),
          fallidos: Number(totales?.fallidos || 0),
          rebotados: Number(totales?.rebotados || 0),
          campanas_implicadas: Number(totales?.campanas_implicadas || 0),
          campanas_eliminadas: Number(eliminadas?.total || 0),
        },
      });
    } catch (error) {
      logger.error('Error en resumen de auditoría:', error);
      next(error);
    }
  }
);

// ── GET /api/auditoria/eventos ────────────────────────────────────────────────
// Historial de eventos del audit_log, paginado.
router.get('/eventos', REGLAS_RANGO, validarCampos, async (req, res, next) => {
  try {
    const pool = db();
    const { desde, hasta, hastaFin } = resolverRango(req);
    const pagina = Math.max(1, parseInt(req.query.pagina || '1'));
    const porPagina = Math.min(200, Math.max(1, parseInt(req.query.por_pagina || '50')));
    const offset = (pagina - 1) * porPagina;
    const evento = req.query.evento || '';

    const filtroEvento = evento ? 'AND a.evento = ?' : '';
    const paramsBase = evento ? [desde, hastaFin, evento] : [desde, hastaFin];

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_log a
       WHERE a.created_at BETWEEN ? AND ? ${filtroEvento}`,
      paramsBase
    );

    // LEFT JOIN a campaigns solo para saber si sigue eliminada; el audit_log
    // es autosuficiente gracias a los snapshots.
    const [eventos] = await pool.query(
      `SELECT a.id, a.evento, a.campaign_id, a.campaign_nombre,
              a.user_id, a.user_nombre, a.user_email,
              a.smtp_config_id, a.smtp_nombre, a.smtp_from_email,
              a.enviados, a.fallidos, a.total_envios,
              a.detalle, a.ip, a.created_at,
              (c.id IS NULL) AS campana_inexistente,
              (c.deleted_at IS NOT NULL) AS campana_eliminada
       FROM audit_log a
       LEFT JOIN campaigns c ON c.id = a.campaign_id
       WHERE a.created_at BETWEEN ? AND ? ${filtroEvento}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...paramsBase, porPagina, offset]
    );

    res.json({
      total: Number(total),
      pagina,
      por_pagina: porPagina,
      eventos: eventos.map(e => ({
        ...e,
        evento_label: ETIQUETAS[e.evento] || e.evento,
        campana_eliminada: !!e.campana_eliminada,
        campana_inexistente: !!e.campana_inexistente,
      })),
    });
  } catch (error) {
    logger.error('Error en eventos de auditoría:', error);
    next(error);
  }
});

// ── GET /api/auditoria/smtp ───────────────────────────────────────────────────
// Cuadre de consumo por cuenta SMTP en el periodo.
router.get('/smtp', REGLAS_RANGO, validarCampos, async (req, res, next) => {
  try {
    const pool = db();
    const { desde, hasta, hastaFin } = resolverRango(req);

    // Conteo real: un registro por correo aceptado por el servidor SMTP.
    // Es lo que consume cuota del proveedor.
    const [porCuenta] = await pool.query(
      `SELECT cs.smtp_config_id,
              COALESCE(s.nombre, '(cuenta eliminada)') AS smtp_nombre,
              s.from_email,
              s.limite_dia,
              s.enviados_hoy,
              s.fecha_reset,
              COUNT(CASE WHEN cs.estado = 'enviado' THEN 1 END) AS enviados_periodo,
              COUNT(CASE WHEN cs.estado = 'fallido' THEN 1 END) AS fallidos_periodo,
              COUNT(DISTINCT cs.campaign_id) AS campanas
       FROM campaign_sends cs
       LEFT JOIN smtp_configs s ON s.id = cs.smtp_config_id
       WHERE cs.enviado_en BETWEEN ? AND ?
       GROUP BY cs.smtp_config_id, s.nombre, s.from_email, s.limite_dia,
                s.enviados_hoy, s.fecha_reset
       ORDER BY enviados_periodo DESC`,
      [desde, hastaFin]
    );

    // Enviados HOY según los registros reales, para contrastar con el contador
    // enviados_hoy de smtp_configs y detectar desviaciones.
    const [hoyReal] = await pool.query(
      `SELECT smtp_config_id, COUNT(*) AS enviados_hoy_real
       FROM campaign_sends
       WHERE estado = 'enviado' AND DATE(enviado_en) = CURDATE()
       GROUP BY smtp_config_id`
    );
    const mapaHoy = Object.fromEntries(
      hoyReal.map(r => [r.smtp_config_id, Number(r.enviados_hoy_real || 0)])
    );

    res.json({
      rango: { desde, hasta },
      cuentas: porCuenta.map(c => {
        const contador = Number(c.enviados_hoy || 0);
        const real = mapaHoy[c.smtp_config_id] || 0;
        return {
          smtp_config_id: c.smtp_config_id,
          smtp_nombre: c.smtp_nombre,
          from_email: c.from_email,
          limite_dia: Number(c.limite_dia || 0),
          enviados_periodo: Number(c.enviados_periodo || 0),
          fallidos_periodo: Number(c.fallidos_periodo || 0),
          campanas: Number(c.campanas || 0),
          // Cuadre del día en curso
          enviados_hoy_contador: contador,
          enviados_hoy_real: real,
          descuadre_hoy: contador - real,
        };
      }),
    });
  } catch (error) {
    logger.error('Error en cuadre SMTP:', error);
    next(error);
  }
});

// ── GET /api/auditoria/exportar ───────────────────────────────────────────────
// CSV como evidencia. tipo=eventos (audit_log) | envios (detalle por correo)
router.get(
  '/exportar',
  [...REGLAS_RANGO, query('tipo').optional().isIn(['eventos', 'envios'])],
  validarCampos,
  async (req, res, next) => {
    try {
      const pool = db();
      const { desde, hasta, hastaFin } = resolverRango(req);
      const tipo = req.query.tipo === 'envios' ? 'envios' : 'eventos';

      const escapar = (v) => {
        const str = String(v ?? '');
        return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const fecha = (v) => (v ? new Date(v).toLocaleString('es-ES') : '');

      let encabezado, filas;

      if (tipo === 'eventos') {
        const [rows] = await pool.query(
          `SELECT a.created_at, a.evento, a.campaign_id, a.campaign_nombre,
                  a.user_nombre, a.user_email, a.smtp_nombre, a.smtp_from_email,
                  a.enviados, a.fallidos, a.total_envios, a.ip,
                  (c.id IS NULL)             AS campana_inexistente,
                  (c.deleted_at IS NOT NULL) AS campana_eliminada
           FROM audit_log a
           LEFT JOIN campaigns c ON c.id = a.campaign_id
           WHERE a.created_at BETWEEN ? AND ?
           ORDER BY a.created_at ASC, a.id ASC`,
          [desde, hastaFin]
        );

        encabezado = [
          'Fecha y hora', 'Evento', 'ID campaña', 'Campaña', 'Estado campaña',
          'Usuario', 'Email usuario', 'Cuenta SMTP', 'Remitente',
          'Enviados', 'Fallidos', 'Total previsto', 'IP',
        ];
        filas = rows.map(r => [
          fecha(r.created_at),
          ETIQUETAS[r.evento] || r.evento,
          r.campaign_id ?? '',
          r.campaign_nombre ?? '',
          r.campana_inexistente ? 'Purgada' : (r.campana_eliminada ? 'Eliminada' : 'Activa'),
          r.user_nombre ?? '',
          r.user_email ?? '',
          r.smtp_nombre ?? '',
          r.smtp_from_email ?? '',
          r.enviados, r.fallidos, r.total_envios,
          r.ip ?? '',
        ]);
      } else {
        const [rows] = await pool.query(
          `SELECT cs.enviado_en, cs.email, cs.estado, cs.intentos,
                  cs.campaign_id,
                  c.nombre AS campana_nombre,
                  (c.deleted_at IS NOT NULL) AS campana_eliminada,
                  COALESCE(s.nombre, '(cuenta eliminada)') AS smtp_nombre,
                  s.from_email,
                  COALESCE(cs.ultimo_error, '') AS ultimo_error
           FROM campaign_sends cs
           LEFT JOIN campaigns c    ON c.id = cs.campaign_id
           LEFT JOIN smtp_configs s ON s.id = cs.smtp_config_id
           WHERE cs.enviado_en BETWEEN ? AND ?
           ORDER BY cs.enviado_en ASC`,
          [desde, hastaFin]
        );

        encabezado = [
          'Fecha y hora', 'Email destino', 'Estado', 'Intentos',
          'ID campaña', 'Campaña', 'Campaña eliminada',
          'Cuenta SMTP', 'Remitente', 'Error',
        ];
        filas = rows.map(r => [
          fecha(r.enviado_en),
          r.email, r.estado, r.intentos,
          r.campaign_id ?? '',
          r.campana_nombre ?? '(campaña purgada)',
          r.campana_eliminada ? 'Sí' : 'No',
          r.smtp_nombre ?? '',
          r.from_email ?? '',
          r.ultimo_error,
        ]);
      }

      const lineas = [
        encabezado.join(','),
        ...filas.map(f => f.map(escapar).join(',')),
      ];

      const nombreArchivo = `auditoria_${tipo}_${desde}_a_${hasta}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      // BOM para que Excel respete las tildes
      res.send('﻿' + lineas.join('\r\n'));
    } catch (error) {
      logger.error('Error al exportar auditoría:', error);
      next(error);
    }
  }
);

module.exports = router;
