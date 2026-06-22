const nodemailer = require('nodemailer');

/**
 * Crea un transporter de Nodemailer a partir de una configuración SMTP de la DB.
 * La contraseña se espera ya desencriptada.
 */
function crearTransporter(config) {
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
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });
}

/**
 * Verifica que una configuración SMTP es válida enviando un email de prueba.
 */
async function verificarConexion(config, emailDestino) {
  const transporter = crearTransporter(config);

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
    return { ok: false, error: error.message };
  }
}

module.exports = { crearTransporter, verificarConexion, enviarEmail };
