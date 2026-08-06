const { db } = require('../config/database');
const settingsService = require('./settingsService');
const logger = require('../config/logger');

/**
 * Telemetría de envío en tiempo real.
 *
 * Todo se calcula al vuelo: no hay estado persistido ni columnas nuevas. Las
 * consultas son las mismas que ya usa la compuerta horaria, así que lo que se
 * muestra es exactamente lo que decide el ritmo, no una aproximación paralela.
 *
 * El servidor envía INSTANTES ABSOLUTOS, nunca cuentas atrás: el cliente las
 * calcula solo. Así un contador fluido no cuesta tráfico por segundo.
 */

// Motivos de espera, en el orden de prioridad con que se evalúan.
const MOTIVOS = {
  PAUSA_PROVEEDOR: 'pausa_proveedor',
  CORTE_FALLOS: 'corte_fallos',
  PAUSA_MANUAL: 'pausa_manual',
  LIMITE_CAMPANA: 'limite_campana',
  LIMITE_CUENTA: 'limite_cuenta',
  ESPACIADO: 'espaciado',
  INACTIVA: 'inactiva',
};

/**
 * Instante en que Bull tiene programado el próximo envío de esta campaña.
 *
 * Se lee de la cola en vez de estimarlo: si hay trabajos atascados o la cola va
 * retrasada, una estimación mentiría justo cuando más falta que acierte.
 * Los trabajos aplazados vienen ordenados por instante de disparo, así que basta
 * mirar los primeros.
 *
 * @returns {number|null} timestamp en ms, o null si no se encontró
 */
async function proximoEnvioDesdeBull(campaignId, limite = 60) {
  try {
    // require diferido: queueService importa este módulo y se formaría un ciclo.
    const { inicializarCola } = require('./queueService');
    const cola = await inicializarCola();
    const jobs = await cola.getDelayed(0, limite - 1);
    return elegirProximoJob(jobs, campaignId);
  } catch (error) {
    logger.warn(`No se pudo leer el próximo envío de la cola: ${error.message}`);
    return null;
  }
}

/**
 * De una lista de trabajos aplazados, el instante de disparo más próximo que
 * pertenezca a esta campaña.
 *
 * Bull ordena el conjunto de aplazados por instante de disparo, que calcula como
 * `timestamp` (creación) + `opts.delay`. Función pura para poder probarla sin
 * Redis.
 *
 * @returns {number|null} timestamp en ms, o null si ninguno es de esta campaña
 */
function elegirProximoJob(jobs, campaignId) {
  let proximo = null;
  for (const job of jobs || []) {
    if (!job || Number(job.data?.campaignId) !== Number(campaignId)) continue;
    const disparaEn = Number(job.timestamp || 0) + Number(job.opts?.delay || 0);
    if (!Number.isFinite(disparaEn)) continue;
    if (proximo === null || disparaEn < proximo) proximo = disparaEn;
  }
  return proximo;
}

/**
 * Estimación de respaldo cuando la cola no da respuesta: último envío correcto
 * más el espaciado configurado.
 */
function estimarProximoEnvio(ultimoEnvio, espaciadoMs) {
  if (!ultimoEnvio) return null;
  const base = new Date(ultimoEnvio).getTime() + espaciadoMs;
  return Math.max(base, Date.now());
}

/**
 * Snapshot completo de telemetría de una campaña.
 * @returns {Object|null} null si la campaña no existe
 */
async function obtenerSnapshot(campaignId) {
  const pool = db();

  const [[camp]] = await pool.query(
    `SELECT c.id, c.estado, c.emails_por_min, c.emails_por_hora,
            c.pausa_motivo, c.reanudar_en, c.pausas_por_limite,
            c.ultimo_error_smtp, c.fallos_consecutivos, c.smtp_config_id,
            s.nombre AS smtp_nombre
     FROM campaigns c
     LEFT JOIN smtp_configs s ON s.id = c.smtp_config_id
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    [campaignId]
  );
  if (!camp) return null;

  const throttle = await settingsService.getThrottle();

  // Topes efectivos: el global actúa como techo sobre el de la campaña.
  const limiteCampanaHora = Math.min(
    camp.emails_por_hora || throttle.emails_por_hora,
    throttle.emails_por_hora
  );
  const limiteCuentaHora = throttle.emails_por_hora;
  const porMinConfigurado = Math.min(
    camp.emails_por_min || throttle.emails_por_min,
    throttle.emails_por_min
  );

  // Espaciado real que aplica el encolado, incluido el tope por hora.
  const espaciadoMs = Math.max(
    Math.ceil(60_000 / Math.max(1, porMinConfigurado)),
    limiteCampanaHora > 0 ? Math.ceil(3_600_000 / limiteCampanaHora) : 0
  );

  // ── Ventana móvil de 60 minutos ──
  const [[ventanaCampana]] = await pool.query(
    `SELECT COUNT(*) AS usados, MAX(enviado_en) AS ultimo
     FROM campaign_sends
     WHERE campaign_id = ? AND estado = 'enviado'
       AND enviado_en >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [campaignId]
  );

  let ventanaCuenta = { usados: 0 };
  if (camp.smtp_config_id) {
    const [[fila]] = await pool.query(
      `SELECT COUNT(*) AS usados
       FROM campaign_sends
       WHERE smtp_config_id = ? AND estado = 'enviado'
         AND enviado_en >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [camp.smtp_config_id]
    );
    ventanaCuenta = fila || { usados: 0 };
  }

  const usadosCampana = Number(ventanaCampana?.usados || 0);
  const usadosCuenta = Number(ventanaCuenta?.usados || 0);

  // ── Ritmo real de los últimos 5 minutos ──
  const [[reciente]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM campaign_sends
     WHERE campaign_id = ? AND estado = 'enviado'
       AND enviado_en >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
    [campaignId]
  );
  const realPorMin = Number(reciente?.cnt || 0) / 5;

  // ── Último envío correcto, para el respaldo del contador ──
  const [[ultimo]] = await pool.query(
    `SELECT MAX(enviado_en) AS ultimo_envio FROM campaign_sends
     WHERE campaign_id = ? AND estado = 'enviado'`,
    [campaignId]
  );

  // ── Motivo de la espera ──
  // Se evalúa por prioridad: primero los estados que detienen la campaña,
  // después los topes de ventana, y si nada bloquea es el espaciado normal.
  let motivo = MOTIVOS.ESPACIADO;
  let proximoEnvioEn = null;

  if (camp.estado === 'pausada') {
    if (camp.pausa_motivo === 'limite_smtp') {
      motivo = MOTIVOS.PAUSA_PROVEEDOR;
      proximoEnvioEn = camp.reanudar_en ? new Date(camp.reanudar_en).getTime() : null;
    } else if (camp.pausa_motivo === 'fallos_consecutivos') {
      motivo = MOTIVOS.CORTE_FALLOS;   // no se reanuda sola
    } else {
      motivo = MOTIVOS.PAUSA_MANUAL;
    }
  } else if (camp.estado !== 'enviando') {
    motivo = MOTIVOS.INACTIVA;
  } else if (usadosCampana >= limiteCampanaHora && limiteCampanaHora > 0) {
    motivo = MOTIVOS.LIMITE_CAMPANA;
  } else if (usadosCuenta >= limiteCuentaHora && limiteCuentaHora > 0) {
    motivo = MOTIVOS.LIMITE_CUENTA;
  }

  // El instante del próximo envío solo tiene sentido si va a enviar.
  if (camp.estado === 'enviando') {
    proximoEnvioEn = await proximoEnvioDesdeBull(campaignId);
    if (proximoEnvioEn === null) {
      proximoEnvioEn = estimarProximoEnvio(ultimo?.ultimo_envio, espaciadoMs);
    }
  }

  const porHoraConfigurado = limiteCampanaHora;
  const realPorHora = usadosCampana;

  return {
    campaignId: camp.id,
    estado: camp.estado,
    generado_en: Date.now(),

    espera: {
      motivo,
      proximo_envio_en: proximoEnvioEn,
      // El contador de reanudación solo aplica a la pausa por proveedor.
      reanudar_en: camp.reanudar_en ? new Date(camp.reanudar_en).getTime() : null,
    },

    ventana: {
      campana: {
        usados: usadosCampana,
        limite: limiteCampanaHora,
        porcentaje: limiteCampanaHora > 0
          ? Math.min(100, Math.round((usadosCampana / limiteCampanaHora) * 100)) : 0,
      },
      cuenta: {
        nombre: camp.smtp_nombre || null,
        usados: usadosCuenta,
        limite: limiteCuentaHora,
        porcentaje: limiteCuentaHora > 0
          ? Math.min(100, Math.round((usadosCuenta / limiteCuentaHora) * 100)) : 0,
      },
    },

    ritmo: {
      real_por_min: Math.round(realPorMin * 10) / 10,
      configurado_por_min: porMinConfigurado,
      real_por_hora: realPorHora,
      configurado_por_hora: porHoraConfigurado,
      // Negativo = va más lento de lo configurado.
      desviacion_pct: porMinConfigurado > 0
        ? Math.round(((realPorMin - porMinConfigurado) / porMinConfigurado) * 100)
        : 0,
    },

    pausa: camp.pausa_motivo === 'limite_smtp' ? {
      numero: Number(camp.pausas_por_limite || 0),
      reanudar_en: camp.reanudar_en ? new Date(camp.reanudar_en).getTime() : null,
      ultimo_error: camp.ultimo_error_smtp || null,
    } : null,

    corte: camp.pausa_motivo === 'fallos_consecutivos' ? {
      fallos_consecutivos: Number(camp.fallos_consecutivos || 0),
      ultimo_error: camp.ultimo_error_smtp || null,
    } : null,
  };
}

module.exports = {
  obtenerSnapshot,
  MOTIVOS,
  proximoEnvioDesdeBull,
  elegirProximoJob,      // exportada para pruebas
  estimarProximoEnvio,
};
