const { db } = require('../config/database');
const logger = require('../config/logger');

/**
 * Eventos auditables. Se registran en audit_log, que es inmutable y no tiene
 * foreign keys: sobrevive a la eliminación de campañas y usuarios.
 */
const EVENTOS = {
  CAMPANA_CREADA: 'campana_creada',
  CAMPANA_ACTUALIZADA: 'campana_actualizada',
  CAMPANA_INICIADA: 'campana_iniciada',
  CAMPANA_PAUSADA: 'campana_pausada',
  CAMPANA_REANUDADA: 'campana_reanudada',
  CAMPANA_COMPLETADA: 'campana_completada',
  CAMPANA_CANCELADA: 'campana_cancelada',
  CAMPANA_ELIMINADA: 'campana_eliminada',
  CAMPANA_RESTAURADA: 'campana_restaurada',
  CAMPANA_REINTENTADA: 'campana_reintentada',
  CAMPANA_REENCOLADA: 'campana_reencolada',
  PAUSA_LIMITE_SMTP: 'pausa_limite_smtp',
  PAUSA_FALLOS_CONSECUTIVOS: 'pausa_fallos_consecutivos',
  // Gestión de acceso: no van asociados a una campaña (campaign_id queda NULL);
  // el usuario afectado y las cuentas viajan en `detalle`.
  SMTP_ASIGNADO: 'smtp_asignado',
  SMTP_DESASIGNADO: 'smtp_desasignado',
};

// Etiquetas legibles para la UI y la exportación CSV.
const ETIQUETAS = {
  campana_creada: 'Campaña creada',
  campana_actualizada: 'Campaña actualizada',
  campana_iniciada: 'Campaña iniciada',
  campana_pausada: 'Campaña pausada',
  campana_reanudada: 'Campaña reanudada',
  campana_completada: 'Campaña completada',
  campana_cancelada: 'Campaña cancelada',
  campana_eliminada: 'Campaña eliminada',
  campana_restaurada: 'Campaña restaurada',
  campana_reintentada: 'Reenvío selectivo a fallidos',
  campana_reencolada: 'Pendientes reencolados (recuperación)',
  pausa_limite_smtp: 'Pausada por límite del proveedor',
  pausa_fallos_consecutivos: 'Pausada por fallos consecutivos',
  smtp_asignado: 'Cuentas SMTP asignadas',
  smtp_desasignado: 'Cuentas SMTP desasignadas',
};

/**
 * Registra un evento de auditoría.
 *
 * Toma un snapshot del nombre de la campaña, del usuario y de la cuenta SMTP
 * para que el registro siga siendo legible aunque esas filas desaparezcan.
 *
 * Nunca lanza: un fallo de auditoría no debe tumbar la operación de negocio,
 * pero sí queda registrado en el log de la aplicación.
 *
 * @param {Object} opciones
 * @param {string} opciones.evento      Uno de EVENTOS
 * @param {number} [opciones.campaignId]
 * @param {Object} [opciones.usuario]   req.usuario (omitir si la acción es del sistema)
 * @param {string} [opciones.ip]
 * @param {Object} [opciones.detalle]   Contexto adicional (se guarda como JSON)
 */
async function registrar({ evento, campaignId = null, usuario = null, ip = null, detalle = null }) {
  try {
    const pool = db();

    // Snapshot de la campaña y su cuenta SMTP.
    let campana = null;
    if (campaignId) {
      const [[fila]] = await pool.query(
        `SELECT c.nombre, c.enviados, c.fallidos, c.total_envios, c.smtp_config_id,
                s.nombre AS smtp_nombre, s.from_email AS smtp_from_email
         FROM campaigns c
         LEFT JOIN smtp_configs s ON s.id = c.smtp_config_id
         WHERE c.id = ?`,
        [campaignId]
      );
      campana = fila || null;
    }

    await pool.query(
      `INSERT INTO audit_log
        (evento, campaign_id, campaign_nombre,
         user_id, user_nombre, user_email,
         smtp_config_id, smtp_nombre, smtp_from_email,
         enviados, fallidos, total_envios, detalle, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evento,
        campaignId,
        campana?.nombre || null,
        usuario?.id || null,
        usuario?.nombre || 'Sistema',
        usuario?.email || null,
        campana?.smtp_config_id || null,
        campana?.smtp_nombre || null,
        campana?.smtp_from_email || null,
        campana?.enviados || 0,
        campana?.fallidos || 0,
        campana?.total_envios || 0,
        detalle ? JSON.stringify(detalle) : null,
        ip,
      ]
    );
  } catch (error) {
    // No propagar: la auditoría no debe romper el flujo principal.
    logger.error(`No se pudo registrar el evento de auditoría "${evento}": ${error.message}`);
  }
}

module.exports = { registrar, EVENTOS, ETIQUETAS };
