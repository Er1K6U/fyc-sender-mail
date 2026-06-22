const express = require('express');
const { db } = require('../config/database');
const logger = require('../config/logger');

const router = express.Router();

// Pixel transparente 1x1 en base64
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// ── GET /api/tracking/open/:sendId ───────────────────────────────────────────
// Tracking de apertura vía pixel invisible
router.get('/open/:sendId', async (req, res) => {
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL_GIF.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
  });
  res.end(PIXEL_GIF);

  // Registrar apertura en background (no bloquear la respuesta)
  setImmediate(async () => {
    try {
      const pool = db();
      const [[send]] = await pool.query(
        'SELECT campaign_id FROM campaign_sends WHERE id = ?',
        [req.params.sendId]
      );
      if (!send) return;

      // Evitar duplicados de apertura (solo primera cuenta)
      const [[ya]] = await pool.query(
        `SELECT id FROM email_events
         WHERE send_id = ? AND tipo = 'apertura' LIMIT 1`,
        [req.params.sendId]
      );
      if (ya) return;

      await pool.query(
        `INSERT INTO email_events (campaign_id, send_id, tipo, ip, user_agent)
         VALUES (?, ?, 'apertura', ?, ?)`,
        [
          send.campaign_id,
          req.params.sendId,
          req.ip,
          req.headers['user-agent']?.slice(0, 500) || null,
        ]
      );

      // Incrementar contador en campaña
      await pool.query(
        'UPDATE campaigns SET abiertos = abiertos + 1 WHERE id = ?',
        [send.campaign_id]
      );
    } catch (err) {
      logger.debug('Error en tracking de apertura:', err.message);
    }
  });
});

// ── GET /api/tracking/click/:sendId ──────────────────────────────────────────
// Tracking de clicks — redirige a la URL real
router.get('/click/:sendId', async (req, res) => {
  const { url } = req.query;
  const destino = url ? decodeURIComponent(url) : '/';

  // Validar URL básicamente antes de redirigir
  if (url && !url.startsWith('http')) {
    return res.redirect(302, '/');
  }

  res.redirect(302, destino);

  setImmediate(async () => {
    try {
      const pool = db();
      const [[send]] = await pool.query(
        'SELECT campaign_id FROM campaign_sends WHERE id = ?',
        [req.params.sendId]
      );
      if (!send) return;

      await pool.query(
        `INSERT INTO email_events (campaign_id, send_id, tipo, url_click, ip, user_agent)
         VALUES (?, ?, 'click', ?, ?, ?)`,
        [send.campaign_id, req.params.sendId, destino?.slice(0, 2000), req.ip,
         req.headers['user-agent']?.slice(0, 500) || null]
      );

      await pool.query(
        'UPDATE campaigns SET clicks = clicks + 1 WHERE id = ?',
        [send.campaign_id]
      );
    } catch (err) {
      logger.debug('Error en tracking de click:', err.message);
    }
  });
});

// ── GET /api/tracking/unsub/:sendId ──────────────────────────────────────────
// Desuscripción desde link en email
router.get('/unsub/:sendId', async (req, res) => {
  try {
    const pool = db();
    const [[send]] = await pool.query(
      `SELECT cs.email, cs.campaign_id, c.list_id
       FROM campaign_sends cs
       JOIN campaigns c ON c.id = cs.campaign_id
       WHERE cs.id = ?`,
      [req.params.sendId]
    );

    if (!send) {
      return res.status(404).send('<h2>Enlace de desuscripción inválido</h2>');
    }

    // Agregar a lista negra global
    await pool.query(
      `INSERT IGNORE INTO unsubscribes (email, motivo, campaign_id) VALUES (?, 'link', ?)`,
      [send.email, send.campaign_id]
    );

    // Marcar en la tabla contacts
    await pool.query(
      `UPDATE contacts SET suscrito = 0, fecha_unsub = NOW()
       WHERE email = ? AND list_id = ?`,
      [send.email, send.list_id]
    );

    // Actualizar contador de la lista
    await pool.query(
      `UPDATE contact_lists
       SET activos = (SELECT COUNT(*) FROM contacts WHERE list_id = ? AND suscrito = 1)
       WHERE id = ?`,
      [send.list_id, send.list_id]
    );

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Desuscrito</title>
        <style>
          body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;}
          .card{text-align:center;padding:2rem;max-width:400px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);}
          .icon{font-size:3rem;margin-bottom:1rem;}
          h1{color:#1f2937;font-size:1.5rem;margin-bottom:.5rem;}
          p{color:#6b7280;font-size:.9rem;}
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>Te has desuscrito</h1>
          <p>El email <strong>${send.email}</strong> ha sido eliminado de nuestra lista de envíos.</p>
          <p style="margin-top:1rem;font-size:.8rem;">Si fue un error, contáctanos directamente.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error('Error en desuscripción:', error);
    res.status(500).send('<h2>Error al procesar la desuscripción</h2>');
  }
});

// ── GET /api/tracking/online/:sendId ─────────────────────────────────────────
// Ver email en navegador
router.get('/online/:sendId', async (req, res) => {
  try {
    const pool = db();
    const [[send]] = await pool.query(
      `SELECT cs.email, c.html_content, c.asunto, cs.campaign_id
       FROM campaign_sends cs
       JOIN campaigns c ON c.id = cs.campaign_id
       WHERE cs.id = ?`,
      [req.params.sendId]
    );

    if (!send) return res.status(404).send('<p>Email no encontrado</p>');

    const html = send.html_content
      .replace(/\{\{email\}\}/gi, send.email)
      .replace(/\{\{link_ver_online\}\}/gi, '#');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).send('<p>Error al cargar el email</p>');
  }
});

module.exports = router;
