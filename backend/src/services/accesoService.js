const { db } = require('../config/database');

/**
 * Visibilidad de listas y plantillas.
 *
 *   - admin  → ve y edita todo
 *   - editor → ve lo suyo (user_id) y lo marcado como compartido;
 *              edita/elimina SOLO lo suyo
 *
 * Los contactos no tienen visibilidad propia: heredan la de su lista. Un flag
 * independiente permitiría estados incoherentes (contacto visible dentro de
 * una lista invisible).
 */

// Lista blanca: estos nombres se interpolan en SQL, nunca vienen del usuario.
const TABLAS = {
  lista: 'contact_lists',
  plantilla: 'templates',
};

function esAdmin(usuario) {
  return usuario?.rol === 'admin';
}

/**
 * Fragmento de WHERE para filtrar un listado según el rol.
 * @param {string} alias Alias de la tabla en la consulta (ej. 'cl').
 * @returns {{sql: string, params: any[]}}
 */
function filtroVisibilidad(usuario, alias) {
  if (esAdmin(usuario)) return { sql: '1 = 1', params: [] };
  return {
    sql: `(${alias}.user_id = ? OR ${alias}.compartida = 1)`,
    params: [usuario.id],
  };
}

/**
 * Filtro de visibilidad de CAMPAÑAS.
 *
 * Las campañas NO son compartibles, a diferencia de listas y plantillas: cada
 * usuario ve las suyas y el admin las ve todas. No hay flag `compartida` ni
 * está previsto que lo haya.
 *
 * @param {string} alias Alias de la tabla campaigns en la consulta.
 * @returns {{sql: string, params: any[]}}
 */
function filtroCampana(usuario, alias = 'c') {
  if (esAdmin(usuario)) return { sql: '1 = 1', params: [] };
  return { sql: `${alias}.user_id = ?`, params: [usuario.id] };
}

/**
 * ¿Puede el usuario VER este recurso? (propio, compartido, o es admin)
 */
async function puedeVer(tipo, id, usuario) {
  const tabla = TABLAS[tipo];
  if (!tabla || !id) return false;
  const pool = db();

  if (esAdmin(usuario)) {
    const [[fila]] = await pool.query(`SELECT id FROM \`${tabla}\` WHERE id = ?`, [id]);
    return !!fila;
  }

  const [[fila]] = await pool.query(
    `SELECT id FROM \`${tabla}\` WHERE id = ? AND (user_id = ? OR compartida = 1)`,
    [id, usuario.id]
  );
  return !!fila;
}

/**
 * ¿Puede el usuario MODIFICAR este recurso?
 * Ver algo compartido no da derecho a editarlo: solo su dueño o un admin.
 */
async function puedeEditar(tipo, id, usuario) {
  const tabla = TABLAS[tipo];
  if (!tabla || !id) return false;
  const pool = db();

  if (esAdmin(usuario)) {
    const [[fila]] = await pool.query(`SELECT id FROM \`${tabla}\` WHERE id = ?`, [id]);
    return !!fila;
  }

  const [[fila]] = await pool.query(
    `SELECT id FROM \`${tabla}\` WHERE id = ? AND user_id = ?`,
    [id, usuario.id]
  );
  return !!fila;
}

/**
 * Visibilidad de un contacto: se resuelve a través de su lista.
 */
async function puedeVerContacto(contactId, usuario) {
  if (esAdmin(usuario)) return true;
  const pool = db();
  const [[fila]] = await pool.query(
    `SELECT c.id
     FROM contacts c
     JOIN contact_lists cl ON cl.id = c.list_id
     WHERE c.id = ? AND (cl.user_id = ? OR cl.compartida = 1)`,
    [contactId, usuario.id]
  );
  return !!fila;
}

/**
 * Escritura sobre un contacto: exige ser dueño de la LISTA que lo contiene.
 * Que una lista esté compartida no autoriza a modificar su contenido.
 */
async function puedeEditarContacto(contactId, usuario) {
  if (esAdmin(usuario)) return true;
  const pool = db();
  const [[fila]] = await pool.query(
    `SELECT c.id
     FROM contacts c
     JOIN contact_lists cl ON cl.id = c.list_id
     WHERE c.id = ? AND cl.user_id = ?`,
    [contactId, usuario.id]
  );
  return !!fila;
}

/**
 * De un conjunto de contactos, devuelve los que el usuario puede modificar.
 * Se usa en el borrado masivo para no fallar entero por un id ajeno.
 */
async function filtrarContactosEditables(ids, usuario) {
  if (!ids?.length) return [];
  const pool = db();

  if (esAdmin(usuario)) {
    const [filas] = await pool.query('SELECT id FROM contacts WHERE id IN (?)', [ids]);
    return filas.map(f => f.id);
  }

  const [filas] = await pool.query(
    `SELECT c.id
     FROM contacts c
     JOIN contact_lists cl ON cl.id = c.list_id
     WHERE c.id IN (?) AND cl.user_id = ?`,
    [ids, usuario.id]
  );
  return filas.map(f => f.id);
}

module.exports = {
  esAdmin,
  filtroVisibilidad,
  filtroCampana,
  puedeVer,
  puedeEditar,
  puedeVerContacto,
  puedeEditarContacto,
  filtrarContactosEditables,
};
