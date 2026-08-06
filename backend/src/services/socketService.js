const { Server } = require('socket.io');
const logger = require('../config/logger');

let io = null;

/**
 * Inicializa Socket.io sobre el servidor HTTP.
 * Debe llamarse una sola vez desde server.js.
 */
/**
 * Orígenes permitidos.
 *
 * En producción el frontend se sirve desde el MISMO Express, así que el origen
 * siempre coincide. Comparar con APP_URL a pelo era frágil: una barra final, un
 * http:// frente a https:// o un www. de más bastaban para que Socket.io
 * rechazara el handshake y no hubiera tiempo real, sin error visible en la UI.
 */
function origenPermitido(origin, callback) {
  // Sin cabecera Origin (mismo origen, curl, apps nativas): se permite.
  if (!origin) return callback(null, true);

  const normalizar = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  const permitidos = [
    process.env.APP_URL,
    'http://localhost:5173',
    'http://localhost:3001',
  ].filter(Boolean).map(normalizar);

  const solicitado = normalizar(origin);
  if (permitidos.includes(solicitado)) return callback(null, true);

  // Se tolera la variante con y sin www. del dominio configurado.
  const sinWww = solicitado.replace('://www.', '://');
  if (permitidos.some(p => p.replace('://www.', '://') === sinWww)) {
    return callback(null, true);
  }

  logger.warn(`Socket.io rechazó el origen "${origin}". Revisa APP_URL en el .env.`);
  return callback(new Error('Origen no permitido'), false);
}

function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: origenPermitido,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ambos transportes disponibles. El cliente entra por long-polling —que
    // atraviesa cualquier proxy— y mejora a WebSocket si el entorno lo permite.
    transports: ['polling', 'websocket'],
    // Margen amplio: tras un proxy los pings pueden llegar con retraso y con
    // valores ajustados la conexión se cae y se reconecta en bucle.
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket conectado: ${socket.id}`);

    // El cliente se une a la sala de una campaña específica
    socket.on('campaign:join', (campaignId) => {
      socket.join(`campaign:${campaignId}`);
      logger.debug(`Socket ${socket.id} se unió a campaign:${campaignId}`);
    });

    socket.on('campaign:leave', (campaignId) => {
      socket.leave(`campaign:${campaignId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket desconectado: ${socket.id}`);
    });
  });

  logger.info('✅ Socket.io inicializado');
  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.io no ha sido inicializado. Llama a init() primero.');
  return io;
}

// ── Emisores tipados para cada evento de campaña ──────────────────────────

/** Progreso general de la campaña */
function emitirProgreso(campaignId, datos) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:progress', { campaignId, ...datos });
}

/** Actualización de estado de un envío individual */
function emitirEnvioActualizado(campaignId, datos) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:send_update', { campaignId, ...datos });
}

/** Campaña completada */
function emitirCompletada(campaignId, resumen) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:completed', { campaignId, ...resumen });
}

/** Error crítico en la campaña */
function emitirError(campaignId, mensaje) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:error', { campaignId, mensaje });
}

/**
 * Campaña pausada.
 * `datos` puede incluir { motivo: 'manual' | 'limite_smtp', reanudar_en,
 * espera_min, intento, error } para que la UI explique qué está pasando.
 */
function emitirPausada(campaignId, datos = {}) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:paused', { campaignId, ...datos });
}

/** Telemetría de envío (contadores, ventana móvil, ritmo) */
function emitirTelemetria(campaignId, datos) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:telemetry', { campaignId, ...datos });
}

/**
 * IDs de campañas con al menos un cliente mirando su detalle.
 *
 * La telemetría solo se calcula para estas: si nadie tiene la pantalla abierta,
 * no se ejecuta ni una consulta. Cada socket pertenece además a una sala con su
 * propio id, de ahí el filtro por el patrón `campaign:<número>`.
 */
function campanasObservadas() {
  if (!io) return [];
  const ids = [];
  for (const [sala, miembros] of io.sockets.adapter.rooms) {
    const coincide = /^campaign:(\d+)$/.exec(sala);
    if (coincide && miembros.size > 0) ids.push(Number(coincide[1]));
  }
  return ids;
}

// ── Búfer de logs recientes ──────────────────────────────────────────────────
// Los eventos de log solo existían en vuelo: si el socket no conectaba, o si se
// refrescaba la página, el panel quedaba vacío para siempre. Guardarlos permite
// recuperarlos por REST y que el panel funcione sin tiempo real.
const LOGS_POR_CAMPANA = 100;
const logsRecientes = new Map();

/** Log de actividad en tiempo real */
function emitirLog(campaignId, nivel, mensaje) {
  const entrada = {
    nivel,      // 'info' | 'success' | 'error' | 'warning'
    mensaje,
    timestamp: new Date().toISOString(),
  };

  // Se guarda SIEMPRE, haya socket o no.
  const lista = logsRecientes.get(campaignId) || [];
  lista.unshift(entrada);
  if (lista.length > LOGS_POR_CAMPANA) lista.length = LOGS_POR_CAMPANA;
  logsRecientes.set(campaignId, lista);

  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:log', { campaignId, ...entrada });
}

/** Logs recientes de una campaña, del más nuevo al más antiguo. */
function logsDe(campaignId) {
  return logsRecientes.get(Number(campaignId)) || logsRecientes.get(String(campaignId)) || [];
}

/** Libera el búfer de una campaña terminada. */
function limpiarLogs(campaignId) {
  logsRecientes.delete(campaignId);
  logsRecientes.delete(Number(campaignId));
}

module.exports = {
  init,
  getIo,
  emitirProgreso,
  emitirEnvioActualizado,
  emitirCompletada,
  emitirError,
  emitirPausada,
  emitirLog,
  emitirTelemetria,
  campanasObservadas,
  logsDe,
  limpiarLogs,
};
