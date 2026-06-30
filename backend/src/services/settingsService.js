const { db } = require('../config/database');
const logger = require('../config/logger');

// ── Cache en memoria de la tabla settings ────────────────────────────────────
// Evita un query a DB en cada envío. Se invalida al escribir.
let cache = null;

// Valores por defecto si la fila no existe en DB (failsafe conservador).
const DEFAULTS = {
  throttle_emails_por_min: 20,
  throttle_emails_por_hora: 200,
  throttle_pausa_entre_lotes_ms: 3000,
  throttle_jitter_pct: 20,
  warmup_activo: 1,
};

// Claves que se exponen/editan como configuración de throttling.
const CLAVES_THROTTLE = [
  'throttle_emails_por_min',
  'throttle_emails_por_hora',
  'throttle_pausa_entre_lotes_ms',
  'throttle_jitter_pct',
  'warmup_activo',
];

/**
 * Carga todas las settings desde DB a la cache.
 */
async function cargarCache() {
  const pool = db();
  const [rows] = await pool.query('SELECT clave, valor FROM settings');
  cache = {};
  for (const row of rows) {
    cache[row.clave] = row.valor;
  }
  return cache;
}

/**
 * Devuelve todas las settings (desde cache). Carga la cache si está vacía.
 */
async function getTodas() {
  if (!cache) await cargarCache();
  return { ...cache };
}

/**
 * Obtiene un valor numérico de settings con fallback al default.
 */
async function getNumero(clave) {
  if (!cache) await cargarCache();
  const valor = cache[clave];
  const num = parseInt(valor, 10);
  return Number.isFinite(num) ? num : (DEFAULTS[clave] ?? 0);
}

/**
 * Devuelve la configuración de throttling completa, tipada como números.
 */
async function getThrottle() {
  return {
    emails_por_min: await getNumero('throttle_emails_por_min'),
    emails_por_hora: await getNumero('throttle_emails_por_hora'),
    pausa_entre_lotes_ms: await getNumero('throttle_pausa_entre_lotes_ms'),
    jitter_pct: await getNumero('throttle_jitter_pct'),
    warmup_activo: (await getNumero('warmup_activo')) === 1,
  };
}

/**
 * Persiste un conjunto de claves/valores y refresca la cache.
 * @param {Object} valores - { clave: valor }
 */
async function setVarias(valores) {
  const pool = db();
  const entradas = Object.entries(valores);
  for (const [clave, valor] of entradas) {
    await pool.query(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [clave, String(valor)]
    );
  }
  await cargarCache();
  logger.info(`Settings actualizadas: ${entradas.map(([k]) => k).join(', ')}`);
  return getTodas();
}

module.exports = {
  DEFAULTS,
  CLAVES_THROTTLE,
  getTodas,
  getNumero,
  getThrottle,
  setVarias,
  cargarCache,
};
