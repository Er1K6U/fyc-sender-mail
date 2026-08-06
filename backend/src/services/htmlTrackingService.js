/**
 * Preparación del HTML del correo para tracking.
 *
 * Dos piezas independientes:
 *   - pixel de apertura  → <img> de 1×1 hacia /api/tracking/open/:sendId
 *   - reescritura de <a> → cada enlace pasa por /api/tracking/click/:sendId
 *
 * Sin la reescritura los enlaces van directos al destino y el endpoint de click
 * no se invoca nunca, así que las aperturas se registran pero los clicks salen
 * siempre a cero.
 */

// Entidades que aparecen de verdad dentro de un href.
function decodificarEntidades(url) {
  return String(url)
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/**
 * ¿Debe este href pasar por el redirect de tracking?
 *
 * Se dejan intactos los que no son navegación web (mailto, tel), los anclajes
 * internos, los esquemas peligrosos, las variables sin sustituir y —importante—
 * los propios endpoints de tracking: reescribir el enlace de baja rompería la
 * desuscripción en un clic.
 */
function esRastreable(url) {
  if (!url) return false;
  const u = String(url).trim().toLowerCase();

  if (u.startsWith('#')) return false;
  if (u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('sms:')) return false;
  if (u.startsWith('javascript:') || u.startsWith('data:')) return false;
  if (u.startsWith('{{') || u.includes('{{')) return false; // variable sin reemplazar
  if (!/^https?:\/\//.test(u)) return false;                // solo absolutas
  if (u.includes('/api/tracking/')) return false;            // unsub, ver online, click

  return true;
}

/**
 * Reescribe los href de un HTML para que pasen por el redirect de tracking.
 *
 * @param {string} html
 * @param {{sendId: number|string, appUrl: string}} opciones
 * @returns {string}
 */
function reescribirEnlaces(html, { sendId, appUrl }) {
  if (!html || !sendId || !appUrl) return html;

  const base = `${String(appUrl).replace(/\/+$/, '')}/api/tracking/click/${sendId}`;

  // Captura <a ... href="..." ...> con comillas simples o dobles.
  return html.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (completo, prefijo, comilla, url) => {
      if (!esRastreable(url)) return completo;
      const destino = decodificarEntidades(url.trim());
      return `${prefijo}${comilla}${base}?url=${encodeURIComponent(destino)}${comilla}`;
    }
  );
}

/**
 * Inserta un fragmento antes de </body>, o al final si la plantilla no tiene
 * esa etiqueta. Muchas plantillas del constructor son fragmentos sin <body>, y
 * un replace a secas dejaba el pixel fuera del correo sin avisar.
 */
function insertarAntesDeBody(html, fragmento) {
  if (!fragmento) return html;
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${fragmento}</body>`);
  }
  return html + fragmento;
}

/**
 * Aplica todo el tracking al HTML ya personalizado.
 *
 * @param {string} html      HTML con las variables ya sustituidas
 * @param {Object} opciones
 * @param {number|string} opciones.sendId
 * @param {string} opciones.appUrl
 * @param {string} opciones.unsubUrl
 * @param {boolean} opciones.incluirPieBaja  Añadir el pie de desuscripción
 * @returns {string}
 */
function prepararHtml(html, { sendId, appUrl, unsubUrl, incluirPieBaja }) {
  // Primero los enlaces: así el pie y el pixel, que se añaden después, no se
  // reescriben a sí mismos.
  let salida = reescribirEnlaces(html, { sendId, appUrl });

  const pixel =
    `<img src="${String(appUrl).replace(/\/+$/, '')}/api/tracking/open/${sendId}" ` +
    `width="1" height="1" style="display:none" alt="" />`;

  const pieBaja = incluirPieBaja
    ? `<div style="text-align:center;padding:10px;font-size:11px;color:#888;">` +
      `<a href="${unsubUrl}" style="color:#888;">Cancelar suscripción</a></div>`
    : '';

  return insertarAntesDeBody(salida, `${pixel}${pieBaja}`);
}

module.exports = {
  prepararHtml,
  reescribirEnlaces,
  insertarAntesDeBody,
  esRastreable,
};
