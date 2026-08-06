require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const http = require('http');
const app = require('./app');
const { verificarConexion } = require('./config/database');
const socketService = require('./services/socketService');
const logger = require('./config/logger');

const PORT = process.env.PORT || 3001;

async function iniciarServidor() {
  try {
    await verificarConexion();

    // El tracking (pixel de apertura y redirect de clicks) se construye sobre
    // APP_URL. Si falta, las URLs apuntan a localhost y NINGÚN destinatario
    // puede alcanzarlas: aperturas y clicks quedan a cero sin más síntoma.
    if (!process.env.APP_URL) {
      logger.warn(
        '⚠️  APP_URL no está definida. El tracking de aperturas y clicks apuntará ' +
        'a http://localhost:3001 y no registrará nada. Defínela en backend/.env ' +
        'con el dominio público, p. ej. APP_URL=https://midominio.com'
      );
    } else if (process.env.NODE_ENV === 'production' && !/^https?:\/\//.test(process.env.APP_URL)) {
      logger.warn(`⚠️  APP_URL="${process.env.APP_URL}" no incluye el esquema (http:// o https://).`);
    }

    const server = http.createServer(app);

    // Inicializar Socket.io
    socketService.init(server);

    // Inicializar scheduler de campañas programadas (revisa cada 60 seg)
    const { iniciarScheduler } = require('./services/queueService');
    iniciarScheduler();

    server.listen(PORT, () => {
      logger.info(`🚀 Servidor arriba en http://localhost:${PORT}`);
      logger.info(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
    });

    const cerrar = (señal) => {
      logger.info(`\n${señal} recibido, cerrando servidor...`);
      server.close(async () => {
        logger.info('Servidor HTTP cerrado');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => cerrar('SIGTERM'));
    process.on('SIGINT', () => cerrar('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Promesa rechazada no manejada:', reason);
    });

    return server;
  } catch (error) {
    logger.error('Error fatal al iniciar el servidor:', error);
    process.exit(1);
  }
}

iniciarServidor();
