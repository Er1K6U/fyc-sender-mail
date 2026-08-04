const Bull = require('bull');
const { v4: uuid } = require('uuid');
const { db } = require('../config/database');
const { getRedisOpciones } = require('../config/redis');
const { crearTransporter, enviarEmail, esErrorLimiteProveedor } = require('./smtpService');
const socketService = require('./socketService');
const settingsService = require('./settingsService');
const logger = require('../config/logger');

// ── Cola principal de envío de emails ────────────────────────────────────────
let emailQueue = null;

// Mapa de transporters activos por smtp_config_id.
// UN solo transporter (con pool interno) por cuenta SMTP, reutilizado por todos
// los correos de la campaña. Nunca se crea uno nuevo por email.
const transporterCache = new Map();

async function getOrCreateTransporter(smtpConfig) {
  const cacheKey = smtpConfig.id;
  if (!transporterCache.has(cacheKey)) {
    // Las opciones de pooling salen de la configuración global (Ajustes).
    const opcionesPool = await settingsService.getPoolOpciones();
    transporterCache.set(cacheKey, crearTransporter(smtpConfig, opcionesPool));
    logger.info(
      `Transporter SMTP creado para config ${cacheKey} ` +
      `(pool: ${opcionesPool.maxConnections} conexiones, ` +
      `${opcionesPool.maxMessages} msg/conexión, ${opcionesPool.rateLimit}/min)`
    );
  }
  return transporterCache.get(cacheKey);
}

/**
 * Cierra y descarta el transporter de una cuenta SMTP, liberando sus conexiones.
 * Se llama al completar una campaña o al pausar por límite del proveedor.
 */
function cerrarTransporter(smtpConfigId) {
  const transporter = transporterCache.get(smtpConfigId);
  if (transporter) {
    try {
      transporter.close();
    } catch (error) {
      logger.warn(`Error al cerrar transporter ${smtpConfigId}: ${error.message}`);
    }
    transporterCache.delete(smtpConfigId);
  }
}

/** Cierra todos los transporters activos. */
function cerrarTodosLosTransporters() {
  for (const id of [...transporterCache.keys()]) {
    cerrarTransporter(id);
  }
}

/**
 * Inicializa la cola Bull. Se llama una vez al arrancar el servidor.
 */
async function inicializarCola() {
  if (emailQueue) return emailQueue;

  const redisOpts = getRedisOpciones();

  emailQueue = new Bull('email-sending', {
    redis: redisOpts,
    defaultJobOptions: {
      removeOnComplete: 100, // mantener últimos 100 jobs completados
      removeOnFail: 200,
    },
  });

  // La concurrencia de workers se alinea con maxConnections del pool SMTP.
  // Si hubiera más workers que conexiones, Bull generaría ráfagas de envío que
  // fuerzan al pool a abrir/reciclar conexiones y disparan el 454 de Gmail.
  const { maxConnections } = await settingsService.getPoolOpciones();
  const concurrencia = Math.max(1, maxConnections);

  emailQueue.process('send-email', concurrencia, procesarEnvio);
  logger.info(`Cola procesando con ${concurrencia} worker(s) concurrente(s)`);

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

    // Enviar — el transporter se reutiliza (pool), no se crea uno por email.
    const transporter = await getOrCreateTransporter(smtpConfig);
    const resultado = await enviarEmail(transporter, {
      fromNombre,
      fromEmail,
      to: email,
      subject: asunto,
      html: htmlFinal,
      messageId,
      unsubscribeUrl: unsubUrl,
    });

    // ── Límite del proveedor (454 de Gmail) ──
    // No es un fallo del correo: es la cuenta pidiendo que bajemos el ritmo.
    // Se pausa toda la campaña y se reanuda automáticamente tras el backoff,
    // en vez de reintentar y seguir martillando al proveedor.
    if (!resultado.ok && resultado.limiteProveedor) {
      await pausarPorLimiteProveedor(campaignId, smtpConfig.id, resultado.error);
      // El send queda 'pendiente': se reencolará al reanudar.
      return { skipped: true, motivo: 'Pausada por límite del proveedor SMTP' };
    }

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
    // Red de seguridad: si el límite del proveedor llega por otra vía (p. ej. al
    // abrir la conexión), pausar en vez de reintentar y agravar el bloqueo.
    if (esErrorLimiteProveedor(error)) {
      await pausarPorLimiteProveedor(campaignId, smtpConfig?.id, error.message);
      return { skipped: true, motivo: 'Pausada por límite del proveedor SMTP' };
    }

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

    // Cerrar el pool SMTP y liberar sus conexiones
    cerrarTodosLosTransporters();
  }
}

// ── API pública del servicio de cola ─────────────────────────────────────────

/**
 * Encola todos los envíos de una campaña.
 * Crea los registros en campaign_sends (si no existen) y los agrega a Bull.
 */
async function encolarCampaña(campaignId) {
  const pool = db();
  const cola = await inicializarCola();

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

  // Configurar throttle: emails por minuto.
  // El valor global actúa como TOPE MÁXIMO (cap): ninguna campaña puede superarlo.
  const throttleGlobal = await settingsService.getThrottle();
  const emailsPorMinCampaña = campaña.emails_por_min || throttleGlobal.emails_por_min || 20;
  const emailsPorMin = Math.min(emailsPorMinCampaña, throttleGlobal.emails_por_min);
  const delayBaseMs = Math.ceil(60000 / emailsPorMin); // ms entre emails

  // Jitter: randomización ±jitter_pct sobre el intervalo base para un patrón menos robótico.
  const jitterPct = Math.max(0, Math.min(100, throttleGlobal.jitter_pct || 0));

  // Delay acumulado con jitter aplicado a cada paso (no escalonado fijo).
  let delayAcumulado = 0;

  // Token de ronda para el jobId.
  // Bull ignora add() si el jobId ya existe —incluso si el job ya se completó—,
  // y los jobs que se saltaron al pausar quedan en el set de completados. Sin un
  // discriminante por ronda, al reanudar no se reencolaría nada. El anti-duplicado
  // real lo garantiza procesarEnvio, que descarta los sends ya marcados 'enviado'.
  const ronda = Date.now();

  // Agregar jobs a Bull con delay escalonado para respetar throttle
  const jobsPromises = sends.map((send) => {
    // Variación aleatoria del intervalo: base * (1 ± jitterPct/100)
    const factor = 1 + ((Math.random() * 2 - 1) * jitterPct) / 100;
    const pasoMs = Math.max(0, Math.round(delayBaseMs * factor));
    const delayActual = delayAcumulado;
    delayAcumulado += pasoMs;

    return cola.add('send-email', {
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
      delay: delayActual,
      attempts: parseInt(process.env.DEFAULT_RETRY_ATTEMPTS) || 3,
      backoff: {
        type: 'exponential',
        delay: parseInt(process.env.DEFAULT_RETRY_DELAY_MS) || 5000,
      },
      jobId: `send_${campaignId}_${send.sendId}_${ronda}`, // idempotencia por ronda
    });
  });

  await Promise.all(jobsPromises);

  // total_envios = TODOS los sends de la campaña, no solo los encolados ahora.
  // Al reanudar solo se encolan los pendientes; usar sends.length aquí reduciría
  // el total por debajo de los ya enviados y rompería la barra de progreso.
  await pool.query(
    `UPDATE campaigns c
     SET c.total_envios = (SELECT COUNT(*) FROM campaign_sends WHERE campaign_id = c.id)
     WHERE c.id = ?`,
    [campaignId]
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
    `UPDATE campaigns
     SET estado = 'pausada', pausa_motivo = 'manual', reanudar_en = NULL
     WHERE id = ? AND estado = 'enviando'`,
    [campaignId]
  );
  socketService.emitirPausada(campaignId, { motivo: 'manual' });
  socketService.emitirLog(campaignId, 'warning', 'Campaña pausada por el usuario.');
}

/**
 * Pausa la campaña tras un error de límite del proveedor (454 de Gmail).
 *
 * Criterio del proyecto: proteger la reputación de la cuenta por encima de la
 * velocidad. Se pausa TODA la campaña (el 454 es a nivel de cuenta, no de un
 * correo puntual) y se programa una reanudación automática con backoff
 * progresivo: base, 2×base, 4×base... hasta un tope de 8×base.
 *
 * La actualización es condicional (WHERE estado = 'enviando') para que, si
 * varios workers reciben el 454 a la vez, solo la primera pausa cuente.
 */
async function pausarPorLimiteProveedor(campaignId, smtpConfigId, mensajeError) {
  const pool = db();
  const baseMin = Math.max(1, await settingsService.getNumero('pausa_limite_base_min'));

  // Nº de pausas previas para calcular el backoff de ESTA pausa.
  const [[previo]] = await pool.query(
    'SELECT pausas_por_limite FROM campaigns WHERE id = ?',
    [campaignId]
  );
  const intento = (previo?.pausas_por_limite || 0) + 1;

  // Backoff progresivo con tope: base × 2^(intento-1), máximo 8× base.
  const factor = Math.min(2 ** (intento - 1), 8);
  const esperaMin = baseMin * factor;

  const [resultado] = await pool.query(
    `UPDATE campaigns
     SET estado = 'pausada',
         pausa_motivo = 'limite_smtp',
         pausas_por_limite = pausas_por_limite + 1,
         ultimo_error_smtp = ?,
         reanudar_en = DATE_ADD(NOW(), INTERVAL ? MINUTE)
     WHERE id = ? AND estado = 'enviando'`,
    [String(mensajeError || '').slice(0, 500), esperaMin, campaignId]
  );

  // Otro worker ya pausó la campaña: no duplicar aviso ni backoff.
  if (resultado.affectedRows === 0) return;

  // Liberar las conexiones del pool para que la cuenta "descanse" de verdad.
  if (smtpConfigId) cerrarTransporter(smtpConfigId);

  const [[camp]] = await pool.query(
    'SELECT reanudar_en FROM campaigns WHERE id = ?',
    [campaignId]
  );

  logger.warn(
    `Campaña ${campaignId} pausada por límite del proveedor (intento ${intento}). ` +
    `Reanuda en ${esperaMin} min. Error: ${mensajeError}`
  );

  socketService.emitirPausada(campaignId, {
    motivo: 'limite_smtp',
    reanudar_en: camp?.reanudar_en || null,
    espera_min: esperaMin,
    intento,
    error: mensajeError,
  });

  socketService.emitirLog(
    campaignId,
    'warning',
    `Gmail limitó los envíos (demasiados intentos de login). Campaña pausada ` +
    `${esperaMin} minutos para proteger la reputación de la cuenta. ` +
    `Se reanudará automáticamente.`
  );
}

/**
 * Reanuda una campaña pausada reencolando los pendientes.
 */
async function reanudarCampaña(campaignId) {
  const pool = db();
  await pool.query(
    `UPDATE campaigns
     SET estado = 'enviando', pausa_motivo = NULL, reanudar_en = NULL
     WHERE id = ? AND estado = 'pausada'`,
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
    `UPDATE campaigns
     SET estado = 'error', completada_en = NOW(),
         pausa_motivo = NULL, reanudar_en = NULL
     WHERE id = ? AND estado IN ('enviando', 'pausada', 'programada')`,
    [campaignId]
  );
  cerrarTodosLosTransporters();
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

      // Reanudar campañas pausadas por límite del proveedor cuyo backoff ya venció.
      const [porReanudar] = await pool.query(
        `SELECT id FROM campaigns
         WHERE estado = 'pausada'
           AND pausa_motivo = 'limite_smtp'
           AND reanudar_en IS NOT NULL
           AND reanudar_en <= NOW()`
      );

      for (const camp of porReanudar) {
        logger.info(`Scheduler: reanudando campaña ${camp.id} tras pausa por límite SMTP`);
        socketService.emitirLog(
          camp.id, 'info',
          'Tiempo de espera cumplido. Reanudando envío automáticamente...'
        );
        reanudarCampaña(camp.id).catch(err =>
          logger.error(`Error al reanudar campaña ${camp.id}:`, err)
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
  const cola = await inicializarCola();
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
  pausarPorLimiteProveedor,
  reanudarCampaña,
  cancelarCampaña,
  iniciarScheduler,
  estadisticasCola,
  cerrarTransporter,
  cerrarTodosLosTransporters,
};
