const express = require('express');
const { body, validationResult } = require('express-validator');
const { autenticar, soloAdmin } = require('../middleware/auth');
const settingsService = require('../services/settingsService');

const router = express.Router();
router.use(autenticar, soloAdmin);

function validarCampos(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({ error: 'Datos inválidos', detalles: errores.array() });
  }
  next();
}

// ── GET /api/settings/throttle ────────────────────────────────────────────────
router.get('/throttle', async (req, res, next) => {
  try {
    const throttle = await settingsService.getThrottle();
    res.json({ throttle });
  } catch (error) {
    next(error);
  }
});

// ── PUT /api/settings/throttle ────────────────────────────────────────────────
router.put(
  '/throttle',
  [
    body('emails_por_min').isInt({ min: 1, max: 1000 }).withMessage('Emails por minuto: 1-1000'),
    body('emails_por_hora').isInt({ min: 1, max: 50000 }).withMessage('Emails por hora: 1-50000'),
    body('pausa_entre_lotes_ms').isInt({ min: 0, max: 600000 }).withMessage('Pausa: 0-600000 ms'),
    body('jitter_pct').isInt({ min: 0, max: 100 }).withMessage('Jitter: 0-100%'),
    body('warmup_activo').optional().isBoolean(),
    body('smtp_max_connections').isInt({ min: 1, max: 10 })
      .withMessage('Conexiones SMTP: 1-10 (recomendado 1-2 para Gmail)'),
    body('smtp_max_messages').isInt({ min: 1, max: 500 })
      .withMessage('Mensajes por conexión: 1-500 (recomendado 50)'),
    body('pausa_limite_base_min').isInt({ min: 1, max: 240 })
      .withMessage('Pausa base tras error 454: 1-240 minutos'),
  ],
  validarCampos,
  async (req, res, next) => {
    try {
      const {
        emails_por_min, emails_por_hora, pausa_entre_lotes_ms, jitter_pct, warmup_activo,
        smtp_max_connections, smtp_max_messages, pausa_limite_base_min,
      } = req.body;

      // Coherencia: emails_por_hora no debería ser menor que emails_por_min
      if (emails_por_hora < emails_por_min) {
        return res.status(422).json({
          error: 'El límite por hora no puede ser menor que el límite por minuto',
        });
      }

      await settingsService.setVarias({
        throttle_emails_por_min: emails_por_min,
        throttle_emails_por_hora: emails_por_hora,
        throttle_pausa_entre_lotes_ms: pausa_entre_lotes_ms,
        throttle_jitter_pct: jitter_pct,
        smtp_max_connections,
        smtp_max_messages,
        pausa_limite_base_min,
        ...(warmup_activo !== undefined ? { warmup_activo: warmup_activo ? 1 : 0 } : {}),
      });

      const throttle = await settingsService.getThrottle();
      res.json({
        throttle,
        mensaje: 'Configuración de envío actualizada. Los cambios de pooling SMTP ' +
                 'se aplican a las campañas que se inicien a partir de ahora.',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
