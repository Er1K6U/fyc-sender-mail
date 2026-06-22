const mysql = require('mysql2/promise');

let pool = null;

function crearPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'emailbuilder',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_MAX) || 10,
    queueLimit: 0,
    timezone: '+00:00',
    charset: 'utf8mb4',
  });

  return pool;
}

async function verificarConexion() {
  try {
    const conn = await crearPool().getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ Conexión a MySQL establecida correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    throw error;
  }
}

function db() {
  return crearPool();
}

module.exports = { db, verificarConexion, crearPool };
