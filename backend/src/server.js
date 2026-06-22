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
