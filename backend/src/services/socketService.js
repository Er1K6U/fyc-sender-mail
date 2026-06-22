const { Server } = require('socket.io');
const logger = require('../config/logger');

let io = null;

/**
 * Inicializa Socket.io sobre el servidor HTTP.
 * Debe llamarse una sola vez desde server.js.
 */
function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.APP_URL
        : ['http://localhost:5173', 'http://localhost:3001'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
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

/** Campaña pausada */
function emitirPausada(campaignId) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:paused', { campaignId });
}

/** Log de actividad en tiempo real */
function emitirLog(campaignId, nivel, mensaje) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit('campaign:log', {
    campaignId,
    nivel,      // 'info' | 'success' | 'error' | 'warning'
    mensaje,
    timestamp: new Date().toISOString(),
  });
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
};
