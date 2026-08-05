/**
 * Clasificación y traducción de errores SMTP.
 *
 * Dos conceptos distintos, a propósito:
 *
 *   - `permanente`  → gobierna si el envío se puede REINTENTAR.
 *   - `invalidaContacto` → si la DIRECCIÓN está muerta y hay que desactivarla.
 *
 * No son lo mismo: un rechazo por spam es permanente (reintentar empeora la
 * reputación) pero el buzón existe y funciona, así que el contacto no se toca.
 * Solo `direccion_inexistente` invalida al contacto.
 */

const CATEGORIAS = {
  DIRECCION_INEXISTENTE: 'direccion_inexistente',
  BUZON_LLENO: 'buzon_lleno',
  RECHAZADO_SPAM: 'rechazado_spam',
  LIMITE_PROVEEDOR: 'limite_proveedor',
  ERROR_AUTENTICACION: 'error_autenticacion',
  ERROR_TEMPORAL: 'error_temporal',
  OTRO: 'otro',
};

// Metadatos para la interfaz: etiqueta, color e icono sugerido.
const META = {
  direccion_inexistente: {
    label: 'Dirección inexistente',
    descripcion: 'El servidor confirma que esa cuenta de correo no existe.',
    variante: 'destructive',
  },
  buzon_lleno: {
    label: 'Buzón lleno',
    descripcion: 'El buzón del destinatario no admite más correos ahora mismo.',
    variante: 'warning',
  },
  rechazado_spam: {
    label: 'Rechazado como spam',
    descripcion: 'El servidor de destino bloqueó el correo por políticas antispam.',
    variante: 'orange',
  },
  limite_proveedor: {
    label: 'Límite del proveedor',
    descripcion: 'El proveedor de envío limitó temporalmente la cuenta.',
    variante: 'orange',
  },
  error_autenticacion: {
    label: 'Error de autenticación',
    descripcion: 'Las credenciales de la cuenta SMTP fueron rechazadas.',
    variante: 'destructive',
  },
  error_temporal: {
    label: 'Error temporal',
    descripcion: 'Un fallo pasajero del servidor. Se puede reintentar.',
    variante: 'warning',
  },
  otro: {
    label: 'Otro error',
    descripcion: 'No se pudo determinar la causa exacta del fallo.',
    variante: 'secondary',
  },
};

/**
 * Extrae el código de respuesta SMTP (3 dígitos) del error.
 * Es la señal más fiable: 5xx = permanente, 4xx = temporal.
 */
function extraerCodigo(error) {
  if (!error) return null;

  const directo = error.responseCode;
  if (Number.isInteger(directo) && directo >= 200 && directo < 600) return directo;

  const texto = `${error.response || ''} ${error.message || ''}`;
  const coincidencia = texto.match(/\b([45]\d{2})\b/);
  return coincidencia ? parseInt(coincidencia[1], 10) : null;
}

/**
 * Clasifica un error de envío.
 *
 * @param {Error|Object|string} error
 * @returns {{categoria: string, permanente: boolean, invalidaContacto: boolean,
 *            mensaje: string, codigo: number|null, tecnico: string}}
 */
function clasificar(error) {
  const err = typeof error === 'string' ? { message: error } : (error || {});
  const tecnico = String(err.response || err.message || '').trim();
  const texto = tecnico.toLowerCase();
  const codigo = extraerCodigo(err);

  // Por defecto se usa el código: 5xx permanente, 4xx temporal.
  const codigoEs5xx = codigo !== null && codigo >= 500;

  const coincide = (...patrones) => patrones.some(p => texto.includes(p));

  // ── Dirección inexistente ──
  // Único caso que invalida el contacto: el servidor afirma que no existe.
  if (
    coincide('user unknown', 'no such user', 'no such recipient',
             'does not exist', 'doesn\'t exist', 'recipient not found',
             'unknown recipient', 'address rejected', 'invalid recipient',
             'recipient address rejected', '5.1.1', '5.1.10') ||
    (codigo === 550 && coincide('mailbox unavailable', 'mailbox not found'))
  ) {
    return resultado(CATEGORIAS.DIRECCION_INEXISTENTE, true, true,
      'La dirección de correo no existe. El servidor de destino confirma que esa cuenta no está disponible.',
      codigo, tecnico);
  }

  // ── Buzón lleno ── (temporal: puede liberarse espacio)
  if (coincide('mailbox full', 'quota exceeded', 'over quota',
               'insufficient storage', 'mailbox is full', '4.2.2', '5.2.2')) {
    return resultado(CATEGORIAS.BUZON_LLENO, false, false,
      'El buzón del destinatario está lleno. Se puede reintentar más adelante.',
      codigo, tecnico);
  }

  // ── Autenticación ──
  // Es un problema de NUESTRA configuración, no de la dirección: se marca como
  // reintentable, porque al corregir las credenciales el envío funcionará.
  if (coincide('invalid login', 'authentication failed', 'auth',
               'username and password not accepted', 'credentials',
               '5.7.8', '535')) {
    return resultado(CATEGORIAS.ERROR_AUTENTICACION, false, false,
      'Las credenciales de la cuenta SMTP fueron rechazadas. Revisa el usuario y la App Password en Configuración SMTP.',
      codigo, tecnico);
  }

  // ── Límite del proveedor ──
  if (coincide('rate limit', 'too many', 'throttl', 'try again later',
               'quota', '4.7.0', '421', '454')) {
    return resultado(CATEGORIAS.LIMITE_PROVEEDOR, false, false,
      'El proveedor limitó temporalmente el envío desde esta cuenta. Conviene bajar la velocidad y reintentar más tarde.',
      codigo, tecnico);
  }

  // ── Rechazo por spam o política ──
  // Permanente: reintentar contra un bloqueo de reputación lo empeora.
  // Pero la dirección existe, así que el contacto NO se invalida.
  if (coincide('spam', 'blocked', 'blacklist', 'blocklist', 'policy',
               'reputation', 'dmarc', 'spf', 'dkim', 'not allowed',
               '5.7.1', 'rejected due to')) {
    return resultado(CATEGORIAS.RECHAZADO_SPAM, true, false,
      'El servidor de destino rechazó el correo por sus filtros antispam. Reintentar sin cambiar nada empeoraría la reputación del dominio.',
      codigo, tecnico);
  }

  // ── Problemas de conexión: temporales ──
  if (coincide('econnrefused', 'etimedout', 'esocket', 'econnreset',
               'timeout', 'connection closed', 'network')) {
    return resultado(CATEGORIAS.ERROR_TEMPORAL, false, false,
      'No se pudo conectar con el servidor de correo. Es un fallo de red pasajero y se puede reintentar.',
      codigo, tecnico);
  }

  // ── Sin patrón reconocido: decide el código ──
  if (codigoEs5xx) {
    return resultado(CATEGORIAS.OTRO, true, false,
      `El servidor rechazó el correo de forma definitiva${codigo ? ` (código ${codigo})` : ''}. Revisa el detalle técnico.`,
      codigo, tecnico);
  }

  if (codigo !== null && codigo >= 400) {
    return resultado(CATEGORIAS.ERROR_TEMPORAL, false, false,
      `Fallo temporal del servidor${codigo ? ` (código ${codigo})` : ''}. Se puede reintentar.`,
      codigo, tecnico);
  }

  return resultado(CATEGORIAS.OTRO, false, false,
    'No se pudo determinar la causa del fallo. Consulta el detalle técnico.',
    codigo, tecnico);
}

function resultado(categoria, permanente, invalidaContacto, mensaje, codigo, tecnico) {
  return { categoria, permanente, invalidaContacto, mensaje, codigo, tecnico };
}

module.exports = { clasificar, CATEGORIAS, META };
