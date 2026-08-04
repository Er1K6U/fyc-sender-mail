const { db } = require('../config/database');

/**
 * Reglas de acceso a cuentas SMTP.
 *
 * - Los administradores ven y usan TODAS las cuentas, sin restricción.
 * - El resto de roles solo las que tengan asignadas en user_smtp_configs.
 *
 * smtp_configs.user_id ya no controla el acceso: indica quién creó la cuenta.
 */

function esAdmin(usuario) {
  return usuario?.rol === 'admin';
}

/**
 * Lista las cuentas SMTP visibles para un usuario, con el flag es_principal.
 */
async function listarAccesibles(usuario) {
  const pool = db();
  const campos = `s.id, s.nombre, s.host, s.puerto, s.seguro, s.usuario,
                  s.from_nombre, s.from_email, s.limite_dia, s.enviados_hoy,
                  s.activo, s.verificado, s.created_at`;

  if (esAdmin(usuario)) {
    // El admin ve todas, incluidas las creadas por otros administradores.
    const [rows] = await pool.query(
      `SELECT ${campos}, COALESCE(usc.es_principal, 0) AS es_principal
       FROM smtp_configs s
       LEFT JOIN user_smtp_configs usc
         ON usc.smtp_config_id = s.id AND usc.user_id = ?
       ORDER BY s.created_at DESC`,
      [usuario.id]
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT ${campos}, usc.es_principal
     FROM smtp_configs s
     JOIN user_smtp_configs usc ON usc.smtp_config_id = s.id
     WHERE usc.user_id = ?
     ORDER BY usc.es_principal DESC, s.created_at DESC`,
    [usuario.id]
  );
  return rows;
}

/**
 * ¿Puede este usuario usar esta cuenta SMTP para enviar?
 * Se aplica en el backend aunque la UI ya restrinja: una peticion manipulada
 * no debe poder usar una cuenta no asignada.
 *
 * @param {boolean} exigirActiva  Si true, la cuenta debe estar activo = 1.
 */
async function puedeUsar(usuario, smtpConfigId, exigirActiva = true) {
  if (!smtpConfigId) return false;
  const pool = db();
  const condActiva = exigirActiva ? 'AND s.activo = 1' : '';

  if (esAdmin(usuario)) {
    const [[fila]] = await pool.query(
      `SELECT s.id FROM smtp_configs s WHERE s.id = ? ${condActiva}`,
      [smtpConfigId]
    );
    return !!fila;
  }

  const [[fila]] = await pool.query(
    `SELECT s.id
     FROM smtp_configs s
     JOIN user_smtp_configs usc ON usc.smtp_config_id = s.id
     WHERE s.id = ? AND usc.user_id = ? ${condActiva}`,
    [smtpConfigId, usuario.id]
  );
  return !!fila;
}

/**
 * Asignaciones de un usuario concreto (para la pantalla de administración).
 */
async function asignacionesDe(userId) {
  const pool = db();
  const [rows] = await pool.query(
    `SELECT usc.smtp_config_id, usc.es_principal, usc.created_at,
            s.nombre, s.from_email, s.activo, s.verificado
     FROM user_smtp_configs usc
     JOIN smtp_configs s ON s.id = usc.smtp_config_id
     WHERE usc.user_id = ?
     ORDER BY usc.es_principal DESC, s.nombre`,
    [userId]
  );
  return rows;
}

/**
 * Reemplaza el conjunto completo de asignaciones de un usuario.
 * Se hace en transacción para que no queden estados intermedios ni dos
 * cuentas marcadas como principal a la vez.
 *
 * @returns {{añadidas: number[], quitadas: number[], principal: number|null}}
 */
async function reemplazarAsignaciones(userId, idsSolicitados, principalId, adminId) {
  const pool = db();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Solo se aceptan cuentas que existan realmente.
    let ids = [];
    if (idsSolicitados.length > 0) {
      const [validas] = await conn.query(
        'SELECT id FROM smtp_configs WHERE id IN (?)',
        [idsSolicitados]
      );
      ids = validas.map(v => v.id);
    }

    const [previas] = await conn.query(
      'SELECT smtp_config_id FROM user_smtp_configs WHERE user_id = ?',
      [userId]
    );
    const antes = previas.map(p => p.smtp_config_id);

    // El principal debe estar entre las asignadas; si no, se ignora.
    const principal = ids.includes(Number(principalId)) ? Number(principalId) : null;

    await conn.query('DELETE FROM user_smtp_configs WHERE user_id = ?', [userId]);

    if (ids.length > 0) {
      const valores = ids.map(id => [userId, id, id === principal ? 1 : 0, adminId]);
      await conn.query(
        `INSERT INTO user_smtp_configs
           (user_id, smtp_config_id, es_principal, asignado_por) VALUES ?`,
        [valores]
      );
    }

    await conn.commit();

    return {
      añadidas: ids.filter(id => !antes.includes(id)),
      quitadas: antes.filter(id => !ids.includes(id)),
      principal,
      total: ids.length,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  esAdmin,
  listarAccesibles,
  puedeUsar,
  asignacionesDe,
  reemplazarAsignaciones,
};
