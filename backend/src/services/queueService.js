const Bull = require('bull');
const { v4: uuid } = require('uuid');
const { db } = require('../config/database');
const { getRedisOpciones } = require('../config/redis');
const { crearTransporter, enviarEmail } = require('./smtpService');
const socketService = require('./socketService');
const logger = require('../config/logger');

// ── Cola principal de envío de emails ────────────────────────────────────────
let emailQueue = null;

// Mapa de transporters activos por smtp_config_id (reutilizados entre jobs)
const transporterCache = new Map();

function getOrCreateTransporter(smtpConfig) {
  const cacheKey = smtpConfig.id;
  if (!transporterCache.has(cacheKey)) {
    transporterCache.set(cacheKey, crearTransporter(smtpConfig));
  }
  return transporterCache.get(cacheKey);
}

/**
 * Inicializa la cola Bull. Se llama una vez al arrancar el servidor.
 */
function inicializarCola() {
  if (emailQueue) return emailQueue;

  const redisOpts = getRedisOpciones();

  emailQueue = new Bull('email-sending', {
    redis: redisOpts,
    defaultJobOptions: {
      removeOnComplete: 100, // mantener últimos 100 jobs completados
      removeOnFail: 200,
    },
  });

  // Registrar el procesador de jobs
  emailQueue.process('send-email', 5, procesarEnvio); // 5 workers concurrentes

  // Eventos globales de la cola
  emailQueue.on('error', (error) => {
    logger.error('Error en cola Bull:', error.message);
  });

  emailQueue.on('failed', async (job, error) => {
    logger.warn(`Job ${job.id} falló (intento ${job.attemptsMade}): ${error.message}`);
  });

  logger.info('✅ Cola Bull email-sending inicializada');
  return emailQueue;
}

// ── Procesador individual de cada email ──────────────────────────────────────
async function procesarEnvio(job) {
  const {
    campaignId, sendId, contactId,
    email, nombre, empresa,
    htmlTemplate, asunto,
    fromNombre, fromEmail,
    smtpConfig, appUrl,
  } = job.data;

  const pool = db();

  try {
    // Verificar que el send no esté ya enviado (anti-duplicado en reintentos)
    const [[send]] = await pool.query(
      'SELECT estado FROM campaign_sends WHERE id = ?',
      [sendId]
    );
    if (!send || send.estado === 'enviado') {
      return { skipped: true, motivo: 'Ya enviado' };
    }

    // Verificar que la campaña no esté pausada o cancelada
    const [[camp]] = await pool.query(
      'SELECT estado FROM campaigns WHERE id = ?',
      [campaignId]
    );
    if (!camp || !['enviando'].includes(camp.estado)) {
      return { skipped: true, motivo: `Campaña en estado: ${camp?.estado}` };
    }

    // Verificar lista negra
    const [[unsub]] = await pool.query(
      'SELECT id FROM unsubscribes WHERE email = ?',
      [email]
    );
    if (unsub) {
      await marcarEnvio(pool, sendId, 'fallido', 'Email en lista de desuscripciones');
      await actualizarContadoresCampaña(pool, campaignId, 'fallido');
      socketService.emitirEnvioActualizado(campaignId, {
        sendId, email, estado: 'fallido', motivo: 'Desuscrito',
      });
      return { skipped: true, motivo: 'Desuscrito' };
    }

    // Reemplazar variables dinámicas en el HTML
    const fecha = new Date().toLocaleDateString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const unsubUrl = `${appUrl}/api/tracking/unsub/${sendId}`;
    const verOnlineUrl = `${appUrl}/api/tracking/online/${sendId}`;

    const html = htmlTemplate
      .replace(/\{\{nombre\}\}/gi, nombre || email.split('@')[0])
      .replace(/\{\{email\}\}/gi, email)
      .replace(/\{\{empresa\}\}/gi, empresa || '')
      .replace(/\{\{fecha\}\}/gi, fecha)
      .replace(/\{\{año\}\}/gi, new Date().getFullYear().toString())
      .replace(/\{\{mes\}\}/gi, new Date().toLocaleString('es-ES', { month: 'long' }))
      .replace(/\{\{asunto\}\}/gi, asunto)
      .replace(/\{\{from_nombre\}\}/gi, fromNombre)
      .replace(/\{\{link_unsub\}\}/gi, unsubUrl)
      .replace(/\{\{link_ver_online\}\}/gi, verOnlineUrl);

    // Agregar pixel de tracking de apertura + link de unsub si no están en el HTML
    const pixelUrl = `${appUrl}/api/tracking/open/${sendId}`;
    const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
    const unsubFooter = html.includes('{{link_unsub}}') ? '' :
      `<div style="text-align:center;padding:10px;font-size:11px;color:#888;">
        <a href="${unsubUrl}" style="color:#888;">Cancelar suscripción</a>
      </div>`;

    const htmlFinal = html.replace('</body>', `${trackingPixel}${unsubFooter}</body>`);

    // Generar Message-ID único
    const messageId = `<${uuid()}@${fromEmail.split('@')[1]}>`;

    // Enviar
    const transporter = getOrCreateTransporter(smtpConfig);
    const resultado = await enviarEmail(transporter, {
      fromNombre,
      fromEmail,
      to: email,
      subject: asunto,
      html: htmlFinal,
      messageId,
      unsubscribeUrl: unsubUrl,
    });

    if (resultado.ok) {
      await marcarEnvio(pool, sendId, 'enviado', null, messageId);
      await actualizarContadoresCampaña(pool, campaignId, 'enviado');

      // Incrementar contador SMTP del día
      await pool.query(
        `UPDATE smtp_configs SET enviados_hoy = enviados_hoy + 1,
         fecha_reset = CURDATE() WHERE id = ?`,
        [smtpConfig.id]
      );

      socketService.emitirEnvioActualizado(campaignId, {
        sendId, email, estado: 'enviado',
      });
    } else {
      throw new Error(resultado.error);
    }

    // Emitir progreso actualizado
    await emitirProgresoActual(pool, campaignId);

    return { ok: true, messageId: resultado.messageId };

  } catch (error) {
    const esUltimoIntento = job.attemptsMade >= job.opts.attempts - 1;

    if (esUltimoIntento) {
      await marcarEnvio(pool, sendId, 'fallido', error.message);
      await actualizarContadoresCampaña(pool, campaignId, 'fallido');
      socketService.emitirEnvioActualizado(campaignId, {
        sendId, email, estado: 'fallido', motivo: error.message,
      });
      await emitirProgresoActual(pool, campaignId);
    }

    throw error; // Bull reintentará
  }
}

// ── Funciones auxiliares ──────────────────────────────────────────────────────

async function marcarEnvio(pool, sendId, estado, error = null, messageId = null) {
  await pool.query(
    `UPDATE campaign_sends
     SET estado = ?, ultimo_error = ?, message_id = ?,
         enviado_en = ?, intentos = intentos + 1
     WHERE id = ?`,
    [estado, error, messageId, estado === 'enviado' ? new Date() : null, sendId]
  );
}

async function actualizarContadoresCampaña(pool, campaignId, resultado) {
  const campo = resultado === 'enviado' ? 'enviados' : 'fallidos';
  await pool.query(
    `UPDATE campaigns SET ${campo} = ${campo} + 1 WHERE id = ?`,
    [campaignId]
  );
}

async function emitirProgresoActual(pool, campaignId) {
  const [[camp]] = await pool.query(
    'SELECT enviados, fallidos, total_envios, iniciada_en FROM campaigns WHERE id = ?',
    [campaignId]
  );
  if (!camp) return;

  const procesados = camp.enviados + camp.fallidos;
  const pendientes = camp.total_envios - procesados;

  // Calcular velocidad (emails/min en los últimos 5 minutos)
  const [[velocidadRow]] = await pool.query(
    `SELECT COUNT(*) as cnt FROM campaign_sends
     WHERE campaign_id = ? AND estado = 'enviado'
     AND enviado_en >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
    [campaignId]
  );
  const emailsUltimos5min = velocidadRow?.cnt || 0;
  const velocidadPorMin = Math.round(emailsUltimos5min / 5);

  // Tiempo estimado restante
  const tiempoRestanteSeg = velocidadPorMin > 0
    ? Math.ceil(pendientes / velocidadPorMin) * 60
    : null;

  socketService.emitirProgreso(campaignId, {
    total: camp.total_envios,
    enviados: camp.enviados,
    fallidos: camp.fallidos,
    procesados,
    pendientes,
    porcentaje: camp.total_envios > 0 ? Math.round((procesados / camp.total_envios) * 100) : 0,
    velocidad_por_min: velocidadPorMin,
    tiempo_restante_seg: tiempoRestanteSeg,
  });

  // Detectar si la campaña se completó
  if (pendientes === 0 && procesados === camp.total_envios && camp.total_envios > 0) {
    await pool.query(
      `UPDATE campaigns SET estado = 'completada', completada_en = NOW() WHERE id = ? AND estado = 'enviando'`,
      [campaignId]
    );
    socketService.emitirCompletada(campaignId, {
      total: camp.total_envios,
      enviados: camp.enviados,
      fallidos: camp.fallidos,
    });
    socketService.emitirLog(campaignId, 'success', `Campaña completada. ${camp.enviados} enviados, ${camp.fallidos} fallidos.`);

    // Limpiar transporter del cache
    transporterCache.clear();
  }
}

// ── API pública del servicio de cola ─────────────────────────────────────────

/**
 * Encola todos los envíos de una campaña.
 * Crea los registros en campaign_sends (si no existen) y los agrega a Bull.
 */
async function encolarCampaña(campaignId) {
  const pool = db();
  const cola = inicializarCola();

  const [[campaña]] = await pool.query(
    `SELECT c.*, s.* ,
            s.id AS smtp_id, s.usuario AS smtp_usuario, s.password AS smtp_password,
            s.host AS smtp_host, s.puerto AS smtp_puerto, s.seguro AS smtp_seguro,
            s.from_nombre, s.from_email, s.limite_dia, s.enviados_hoy
     FROM campaigns c
     LEFT JOIN smtp_configs s ON s.id = c.smtp_config_id
     WHERE c.id = ?`,
    [campaignId]
  );

  if (!campaña) throw new Error('Campaña no encontrada');
  if (campaña.estado !== 'enviando' && campaña.estado !== 'programada') {
    throw new Error(`No se puede encolar una campaña en estado: ${campaña.estado}`);
  }

  const smtpConfig = {
    id: campaña.smtp_id,
    host: campaña.smtp_host,
    puerto: campaña.smtp_puerto,
    seguro: campaña.smtp_seguro,
    usuario: campaña.smtp_usuario,
    password: campaña.smtp_password,
    from_nombre: campaña.from_nombre,
    from_email: campaña.from_email,
    limite_dia: campaña.limite_dia,
    enviados_hoy: campaña.enviados_hoy,
  };

  // Obtener contactos activos no enviados aún
  const [contactos] = await pool.query(
    `SELECT c.id, c.email, c.nombre, c.empresa
     FROM contacts c
     WHERE c.list_id = ?
       AND c.suscrito = 1
       AND c.email_valido = 1
       AND c.email NOT IN (SELECT email FROM unsubscribes)
       AND c.id NOT IN (
         SELECT contact_id FROM campaign_sends
         WHERE campaign_id = ? AND estado IN ('enviado', 'pendiente')
       )`,
    [campaña.list_id, campaignId]
  );

  if (contactos.length === 0) {
    await pool.query(
      `UPDATE campaigns SET estado = 'completada', completada_en = NOW() WHERE id = ?`,
      [campaignId]
    );
    socketService.emitirCompletada(campaignId, { total: 0, enviados: 0, fallidos: 0 });
    return { encolados: 0 };
  }

  // Crear registros campaign_sends en batch (IGNORE duplicados)
  const valores = contactos.map(c => [campaignId, c.id, c.email, 'pendiente']);
  await pool.query(
    `INSERT IGNORE INTO campaign_sends (campaign_id, contact_id, email, estado) VALUES ?`,
    [valores]
  );

  // Actualizar total_envios en la campaña
  await pool.query(
    `UPDATE campaigns SET total_envios = ?, estado = 'enviando', iniciada_en = COALESCE(iniciada_en, NOW())
     WHERE id = ?`,
    [campaña.total_envios + contactos.length || contactos.length, campaignId]
  );

  // Obtener los send_ids recién creados
  const [sends] = await pool.query(
    `SELECT cs.id as sendId, cs.email, c.nombre, c.empresa
     FROM campaign_sends cs
     JOIN contacts c ON c.id = cs.contact_id
     WHERE cs.campaign_id = ? AND cs.estado = 'pendiente'`,
    [campaignId]
  );

  // Configurar throttle: emails por minuto
  const emailsPorMin = campaña.emails_por_min || parseInt(process.env.DEFAULT_EMAILS_PER_MINUTE) || 20;
  const delayMs = Math.ceil(60000 / emailsPorMin); // ms entre emails

  // Agregar jobs a Bull con delay escalonado para respetar throttle
  const jobsPromises = sends.map((send, index) =>
    cola.add('send-email', {
      campaignId,
      sendId: send.sendId,
      contactId: send.contact_id,
      email: send.email,
      nombre: send.nombre,
      empresa: send.empresa,
      htmlTemplate: campaña.html_content,
      asunto: campaña.asunto,
      fromNombre: campaña.from_nombre,
      fromEmail: campaña.from_email,
      smtpConfig,
      appUrl: process.env.APP_URL || 'http://localhost:3001',
    }, {
      delay: index * delayMs,
      attempts: parseInt(process.env.DEFAULT_RETRY_ATTEMPTS) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.DEFAULT_RETRY_DELAY_MS) || 5000,
      },
      jobId: `send_${campaignId}_${send.sendId}`, // idempotencia
    })
  );

  await Promise.all(jobsPromises);

  // Actualizar total_envios final
  await pool.query(
    `UPDATE campaigns SET total_envios = ? WHERE id = ?`,
    [sends.length, campaignId]
  );

  socketService.emitirLog(campaignId, 'info',
    `${sends.length} emails encolados. Velocidad: ${emailsPorMin}/min.`
  );

  logger.info(`Campaña ${campaignId}: ${sends.length} emails encolados a ${emailsPorMin}/min`);
  return { encolados: sends.length };
}

/**
 * Pausa una campaña: marca estado, los jobs pendientes en Bull se ignoran
 * porque el procesador verifica el estado antes de enviar.
 */
async function pausarCampaña(campaignId) {
  const pool = db();
  await pool.query(
    `UPDATE campaigns SET estado = 'pausada' WHERE id = ? AND estado = 'enviando'`,
    [campaignId]
  );
  socketService.emitirPausada(campaignId);
  socketService.emitirLog(campaignId, 'warning', 'Campaña pausada por el usuario.');
}

/**
 * Reanuda una campaña pausada reencolando los pendientes.
 */
async function reanudarCampaña(campaignId) {
  const pool = db();
  await pool.query(
    `UPDATE campaigns SET estado = 'enviando' WHERE id = ? AND estado = 'pausada'`,
    [campaignId]
  );
  return encolarCampaña(campaignId);
}

/**
 * Cancela definitivamente una campaña.
 */
async function cancelarCampaña(campaignId) {
  const pool = db();
  await pool.query(
    `UPDATE campaigns SET estado = 'error', completada_en = NOW()
     WHERE id = ? AND estado IN ('enviando', 'pausada', 'programada')`,
    [campaignId]
  );
  socketService.emitirError(campaignId, 'Campaña cancelada por el usuario.');
}

/**
 * Scheduler: revisa cada 60 segundos campañas programadas que ya deberían enviarse.
 */
function iniciarScheduler() {
  const intervalo = setInterval(async () => {
    try {
      const pool = db();
      const [programadas] = await pool.query(
        `SELECT id FROM campaigns
         WHERE estado = 'programada'
           AND programada_para <= NOW()`,
      );

      for (const camp of programadas) {
        logger.info(`Scheduler: iniciando campaña programada ${camp.id}`);
        await pool.query(
          `UPDATE campaigns SET estado = 'enviando', iniciada_en = NOW() WHERE id = ?`,
          [camp.id]
        );
        encolarCampaña(camp.id).catch(err =>
          logger.error(`Error al encolar campaña ${camp.id}:`, err)
        );
      }
    } catch (error) {
      logger.error('Error en scheduler de campañas:', error);
    }
  }, 60_000);

  // No bloquear el proceso al terminar
  if (intervalo.unref) intervalo.unref();

  logger.info('✅ Scheduler de campañas iniciado (intervalo: 60s)');
}

/**
 * Obtiene estadísticas de la cola Bull.
 */
async function estadisticasCola() {
  const cola = inicializarCola();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    cola.getWaitingCount(),
    cola.getActiveCount(),
    cola.getCompletedCount(),
    cola.getFailedCount(),
    cola.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

module.exports = {
  inicializarCola,
  encolarCampaña,
  pausarCampaña,
  reanudarCampaña,
  cancelarCampaña,
  iniciarScheduler,
  estadisticasCola,
};
