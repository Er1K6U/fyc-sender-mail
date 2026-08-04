const nodemailer = require('nodemailer');

// Opciones de pool por defecto: conservadoras para Gmail.
// Gmail admite muy pocas conexiones autenticadas simultáneas; abrir muchas
// (o reciclarlas de golpe) dispara "454-4.7.0 Too many login attempts".
const POOL_DEFAULTS = {
  pool: true,
  maxConnections: 2,
  maxMessages: 50,
  rateDelta: 60_000,
  rateLimit: 20,
};

/**
 * Crea un transporter de Nodemailer a partir de una configuración SMTP de la DB.
 * La contraseña se espera ya desencriptada.
 *
 * @param {Object} config       Configuración SMTP (host, puerto, credenciales...)
 * @param {Object} opcionesPool Opciones de pooling que sobreescriben los defaults
 *                              (normalmente vienen de la configuración global).
 */
function crearTransporter(config, opcionesPool = {}) {
  const pool = { ...POOL_DEFAULTS, ...opcionesPool };

  return nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro === 1, // true para puerto 465, false para 587
    auth: {
      user: config.usuario,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
    // ── Connection pooling ──
    // Una sola conexión (o dos) reutilizada para todos los correos, en lugar de
    // autenticar repetidamente. maxMessages recicla la conexión de forma suave.
    pool: pool.pool,
    maxConnections: pool.maxConnections,
    maxMessages: pool.maxMessages,
    // Segunda barrera de throttling a nivel de pool: N mensajes por rateDelta ms.
    rateDelta: pool.rateDelta,
    rateLimit: pool.rateLimit,
  });
}

/**
 * Detecta errores de límite de autenticación/conexión del proveedor SMTP.
 * Gmail: "454-4.7.0 Too many login attempts, please try again later".
 * También cubre 421 (demasiadas conexiones concurrentes), de la misma familia.
 *
 * @returns {boolean} true si conviene pausar y esperar en vez de reintentar ya.
 */
function esErrorLimiteProveedor(error) {
  if (!error) return false;

  const codigo = error.responseCode || error.code;
  if (codigo === 454 || codigo === 421) return true;

  const texto = `${error.response || ''} ${error.message || ''}`.toLowerCase();

  return (
    texto.includes('too many login attempts') ||
    texto.includes('too many concurrent connections') ||
    texto.includes('4.7.0') ||
    /\b454\b/.test(texto) ||
    texto.includes('try again later')
  );
}

/**
 * Verifica que una configuración SMTP es válida enviando un email de prueba.
 */
async function verificarConexion(config, emailDestino) {
  // Test puntual: sin pool, para no dejar conexiones abiertas ni consumir
  // cupo de autenticación de la cuenta.
  const transporter = crearTransporter(config, { pool: false });

  try {
    await transporter.verify();

    if (emailDestino) {
      await transporter.sendMail({
        from: `"${config.from_nombre}" <${config.from_email}>`,
        to: emailDestino,
        subject: '✅ Prueba de conexión SMTP - Email Builder',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <h2 style="color:#6366f1;">¡Configuración SMTP exitosa!</h2>
            <p>Esta es una prueba automática del sistema Email Builder.</p>
            <p>Tu configuración SMTP está funcionando correctamente.</p>
            <hr style="border:1px solid #e5e7eb;">
            <p style="color:#6b7280;font-size:12px;">
              Host: ${config.host}:${config.puerto}<br>
              Usuario: ${config.usuario}
            </p>
          </div>
        `,
        text: 'Tu configuración SMTP está funcionando correctamente.',
      });
    }

    return { ok: true, mensaje: 'Conexión verificada correctamente' };
  } catch (error) {
    return {
      ok: false,
      mensaje: interpretarErrorSMTP(error),
      errorTecnico: error.message,
    };
  } finally {
    transporter.close();
  }
}

/**
 * Traduce errores de Nodemailer a mensajes legibles.
 */
function interpretarErrorSMTP(error) {
  const msg = error.message || '';

  if (msg.includes('Invalid login') || msg.includes('Username and Password not accepted')) {
    return 'Credenciales incorrectas. Verifica el usuario y App Password de Gmail.';
  }
  if (msg.includes('ECONNREFUSED')) {
    return `No se pudo conectar al servidor SMTP. Verifica host y puerto.`;
  }
  if (msg.includes('ETIMEDOUT') || msg.includes('ESOCKET')) {
    return 'Tiempo de conexión agotado. Verifica la conectividad de red y el puerto.';
  }
  if (msg.includes('certificate') || msg.includes('SSL')) {
    return 'Error de certificado SSL. Verifica la configuración de seguridad.';
  }
  if (msg.includes('Daily user sending quota exceeded')) {
    return 'Límite diario de Gmail alcanzado. Espera 24 horas o usa otra cuenta.';
  }
  if (esErrorLimiteProveedor(error)) {
    return 'Gmail rechazó temporalmente la conexión por demasiados intentos de login. Espera unos minutos antes de reintentar.';
  }
  return `Error SMTP: ${msg}`;
}

/**
 * Envía un email individual.
 * Retorna { ok, messageId, error }
 */
async function enviarEmail(transporter, opciones) {
  try {
    const info = await transporter.sendMail({
      from: `"${opciones.fromNombre}" <${opciones.fromEmail}>`,
      to: opciones.to,
      subject: opciones.subject,
      html: opciones.html,
      text: opciones.text || '',
      headers: {
        'List-Unsubscribe': `<${opciones.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Mailer': 'Email-Builder/1.0',
        'Message-ID': opciones.messageId || undefined,
      },
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      // Señal para que la cola pause la campaña en vez de reintentar de inmediato.
      limiteProveedor: esErrorLimiteProveedor(error),
      codigo: error.responseCode || error.code || null,
    };
  }
}

module.exports = {
  crearTransporter,
  verificarConexion,
  enviarEmail,
  esErrorLimiteProveedor,
  interpretarErrorSMTP,
};
