const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Lee un archivo CSV o Excel y devuelve { headers, filas }.
 * Siempre devuelve las primeras 5 filas como preview.
 */
function leerArchivo(rutaArchivo) {
  const ext = path.extname(rutaArchivo).toLowerCase();

  if (ext === '.csv') {
    return leerCSV(rutaArchivo);
  } else if (ext === '.xls' || ext === '.xlsx') {
    return leerExcel(rutaArchivo);
  } else {
    throw new Error('Formato de archivo no soportado');
  }
}

function leerCSV(rutaArchivo) {
  const contenido = fs.readFileSync(rutaArchivo, 'utf8');

  // Detectar delimitador automáticamente (coma o punto y coma)
  const primeraLinea = contenido.split('\n')[0];
  const delimiter = primeraLinea.includes(';') ? ';' : ',';

  const filas = parse(contenido, {
    delimiter,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (filas.length === 0) throw new Error('El archivo CSV está vacío');

  const headers = filas[0].map(h => h.trim());
  const datos = filas.slice(1).map(fila => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = fila[i] || ''; });
    return obj;
  });

  return { headers, filas: datos, total: datos.length };
}

function leerExcel(rutaArchivo) {
  const workbook = XLSX.readFile(rutaArchivo);
  const nombreHoja = workbook.SheetNames[0];
  const hoja = workbook.Sheets[nombreHoja];

  const filas = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (filas.length === 0) throw new Error('El archivo Excel está vacío');

  const headers = filas[0].map(h => String(h).trim());
  const datos = filas.slice(1).map(fila => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = String(fila[i] || '').trim(); });
    return obj;
  });

  return { headers, filas: datos, total: datos.length };
}

/**
 * Procesa las filas con el mapeo de columnas y devuelve contactos validados.
 * @param {Array} filas - Filas del archivo
 * @param {Object} mapeo - { nombre: 'Columna A', email: 'Columna B', empresa: 'Columna C', ... }
 * @returns { validos, invalidos, duplicados }
 */
function procesarContactos(filas, mapeo) {
  const vistos = new Set();
  const validos = [];
  const invalidos = [];
  const duplicados = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const email = String(fila[mapeo.email] || '').trim().toLowerCase();
    const nombre = String(fila[mapeo.nombre] || '').trim();
    const empresa = mapeo.empresa ? String(fila[mapeo.empresa] || '').trim() : '';

    // Campos extra (todas las columnas no mapeadas)
    const camposReservados = new Set(Object.values(mapeo));
    const camposExtra = {};
    Object.keys(fila).forEach(col => {
      if (!camposReservados.has(col) && fila[col]) {
        camposExtra[col] = fila[col];
      }
    });

    if (!email) {
      invalidos.push({ fila: i + 2, motivo: 'Email vacío', datos: fila });
      continue;
    }

    if (!EMAIL_REGEX.test(email)) {
      invalidos.push({ fila: i + 2, motivo: `Email inválido: ${email}`, datos: fila });
      continue;
    }

    if (vistos.has(email)) {
      duplicados.push({ fila: i + 2, email, datos: fila });
      continue;
    }

    vistos.add(email);
    validos.push({
      nombre: nombre || email.split('@')[0],
      email,
      empresa,
      campos_extra: Object.keys(camposExtra).length > 0 ? JSON.stringify(camposExtra) : null,
      email_valido: 1,
    });
  }

  return { validos, invalidos, duplicados };
}

/**
 * Inserta contactos en la DB en lotes para máxima eficiencia.
 * Ignora duplicados por email dentro de la misma lista (ON DUPLICATE KEY IGNORE).
 */
async function insertarContactos(pool, listId, userId, contactos) {
  if (contactos.length === 0) return { insertados: 0 };

  const LOTE = 500;
  let insertados = 0;

  for (let i = 0; i < contactos.length; i += LOTE) {
    const lote = contactos.slice(i, i + LOTE);
    const valores = lote.map(c => [
      listId,
      userId,
      c.nombre,
      c.email,
      c.empresa || null,
      c.campos_extra || null,
      1, // email_valido
      1, // suscrito
    ]);

    const [result] = await pool.query(
      `INSERT IGNORE INTO contacts
         (list_id, user_id, nombre, email, empresa, campos_extra, email_valido, suscrito)
       VALUES ?`,
      [valores]
    );
    insertados += result.affectedRows;
  }

  // Actualizar contador de la lista
  await pool.query(
    `UPDATE contact_lists
     SET total_contactos = (SELECT COUNT(*) FROM contacts WHERE list_id = ?),
         activos = (SELECT COUNT(*) FROM contacts WHERE list_id = ? AND suscrito = 1)
     WHERE id = ?`,
    [listId, listId, listId]
  );

  return { insertados };
}

/**
 * Limpia el archivo temporal después de la importación.
 */
function limpiarArchivo(rutaArchivo) {
  try {
    if (fs.existsSync(rutaArchivo)) fs.unlinkSync(rutaArchivo);
  } catch (e) {
    // No es crítico si no se puede borrar
  }
}

module.exports = { leerArchivo, procesarContactos, insertarContactos, limpiarArchivo };
