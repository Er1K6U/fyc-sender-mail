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
  ],
  validarCampos,
  async (req, res, next) => {
    try {
      const { emails_por_min, emails_por_hora, pausa_entre_lotes_ms, jitter_pct, warmup_activo } = req.body;

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
        ...(warmup_activo !== undefined ? { warmup_activo: warmup_activo ? 1 : 0 } : {}),
      });

      const throttle = await settingsService.getThrottle();
      res.json({ throttle, mensaje: 'Configuración de envío actualizada' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
