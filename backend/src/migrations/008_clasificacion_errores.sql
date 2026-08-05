-- ============================================================
-- Migración 008: Clasificación de errores y limpieza de contactos
--
--  1. campaign_sends: categoría, permanencia y mensaje traducido
--  2. contacts: motivo y fecha de invalidación
--  3. Reclasificación del histórico (SIN desactivar contactos)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. CLASIFICACIÓN EN campaign_sends
-- `ultimo_error` se conserva intacto: es la evidencia técnica cruda.
-- ─────────────────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends' AND COLUMN_NAME = 'error_categoria');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaign_sends` ADD COLUMN `error_categoria` VARCHAR(40) NULL COMMENT 'direccion_inexistente, buzon_lleno, rechazado_spam, limite_proveedor, error_autenticacion, error_temporal, otro'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends' AND COLUMN_NAME = 'error_permanente');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaign_sends` ADD COLUMN `error_permanente` TINYINT(1) NULL COMMENT '1 = no reintentar nunca'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends' AND COLUMN_NAME = 'error_mensaje');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaign_sends` ADD COLUMN `error_mensaje` VARCHAR(500) NULL COMMENT 'Explicación en español para el usuario'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice para el desglose por categoría y para el cálculo de reintentables.
SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends' AND INDEX_NAME = 'idx_sends_error');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_sends_error` ON `campaign_sends` (`campaign_id`, `estado`, `error_permanente`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- 2. TRAZA DE INVALIDACIÓN EN contacts
-- `email_valido` ya existía y encolarCampaña ya filtra por él: basta con
-- registrar POR QUÉ y CUÁNDO se desactivó, para poder revisarlo.
-- ─────────────────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'motivo_invalido');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `contacts` ADD COLUMN `motivo_invalido` VARCHAR(255) NULL COMMENT 'Por qué se desactivó la dirección'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'fecha_invalido');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `contacts` ADD COLUMN `fecha_invalido` DATETIME NULL COMMENT 'Cuándo se desactivó'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- 3. RECLASIFICACIÓN DEL HISTÓRICO
--
-- Reproduce en SQL las reglas de errorSmtpService.clasificar(), que es la
-- fuente de verdad para los envíos nuevos. Es un backfill de una sola vez:
-- si las reglas cambian, no hay que rehacer esto.
--
-- IMPORTANTE: solo clasifica. NO desactiva contactos retroactivamente, para
-- no invalidar de golpe direcciones por rebotes antiguos.
-- ─────────────────────────────────────────────────────────────
UPDATE `campaign_sends`
SET
  `error_categoria` = CASE
    WHEN LOWER(`ultimo_error`) REGEXP 'user unknown|no such user|does not exist|recipient not found|address rejected|invalid recipient|5\\.1\\.1'
      THEN 'direccion_inexistente'
    WHEN LOWER(`ultimo_error`) REGEXP 'mailbox full|quota exceeded|over quota|insufficient storage|4\\.2\\.2'
      THEN 'buzon_lleno'
    WHEN LOWER(`ultimo_error`) REGEXP 'invalid login|authentication|password not accepted|credentials|535'
      THEN 'error_autenticacion'
    WHEN LOWER(`ultimo_error`) REGEXP 'rate limit|too many|throttl|try again later|4\\.7\\.0|421|454'
      THEN 'limite_proveedor'
    WHEN LOWER(`ultimo_error`) REGEXP 'spam|blocked|blacklist|blocklist|policy|reputation|dmarc|spf|dkim|5\\.7\\.1'
      THEN 'rechazado_spam'
    WHEN LOWER(`ultimo_error`) REGEXP 'econnrefused|etimedout|esocket|econnreset|timeout|network'
      THEN 'error_temporal'
    WHEN `ultimo_error` REGEXP '\\b5[0-9]{2}\\b' THEN 'otro'
    WHEN `ultimo_error` REGEXP '\\b4[0-9]{2}\\b' THEN 'error_temporal'
    ELSE 'otro'
  END,
  `error_permanente` = CASE
    WHEN LOWER(`ultimo_error`) REGEXP 'user unknown|no such user|does not exist|recipient not found|address rejected|invalid recipient|5\\.1\\.1'
      THEN 1
    WHEN LOWER(`ultimo_error`) REGEXP 'mailbox full|quota exceeded|over quota|insufficient storage|4\\.2\\.2'
      THEN 0
    WHEN LOWER(`ultimo_error`) REGEXP 'invalid login|authentication|password not accepted|credentials|535'
      THEN 0
    WHEN LOWER(`ultimo_error`) REGEXP 'rate limit|too many|throttl|try again later|4\\.7\\.0|421|454'
      THEN 0
    WHEN LOWER(`ultimo_error`) REGEXP 'spam|blocked|blacklist|blocklist|policy|reputation|dmarc|spf|dkim|5\\.7\\.1'
      THEN 1
    WHEN LOWER(`ultimo_error`) REGEXP 'econnrefused|etimedout|esocket|econnreset|timeout|network'
      THEN 0
    WHEN `ultimo_error` REGEXP '\\b5[0-9]{2}\\b' THEN 1
    ELSE 0
  END,
  `error_mensaje` = CASE
    WHEN LOWER(`ultimo_error`) REGEXP 'user unknown|no such user|does not exist|recipient not found|address rejected|invalid recipient|5\\.1\\.1'
      THEN 'La dirección de correo no existe. El servidor de destino confirma que esa cuenta no está disponible.'
    WHEN LOWER(`ultimo_error`) REGEXP 'mailbox full|quota exceeded|over quota|insufficient storage|4\\.2\\.2'
      THEN 'El buzón del destinatario está lleno. Se puede reintentar más adelante.'
    WHEN LOWER(`ultimo_error`) REGEXP 'invalid login|authentication|password not accepted|credentials|535'
      THEN 'Las credenciales de la cuenta SMTP fueron rechazadas. Revisa el usuario y la App Password en Configuración SMTP.'
    WHEN LOWER(`ultimo_error`) REGEXP 'rate limit|too many|throttl|try again later|4\\.7\\.0|421|454'
      THEN 'El proveedor limitó temporalmente el envío desde esta cuenta. Conviene bajar la velocidad y reintentar más tarde.'
    WHEN LOWER(`ultimo_error`) REGEXP 'spam|blocked|blacklist|blocklist|policy|reputation|dmarc|spf|dkim|5\\.7\\.1'
      THEN 'El servidor de destino rechazó el correo por sus filtros antispam. Reintentar sin cambiar nada empeoraría la reputación del dominio.'
    WHEN LOWER(`ultimo_error`) REGEXP 'econnrefused|etimedout|esocket|econnreset|timeout|network'
      THEN 'No se pudo conectar con el servidor de correo. Es un fallo de red pasajero y se puede reintentar.'
    WHEN `ultimo_error` REGEXP '\\b5[0-9]{2}\\b'
      THEN 'El servidor rechazó el correo de forma definitiva. Revisa el detalle técnico.'
    WHEN `ultimo_error` REGEXP '\\b4[0-9]{2}\\b'
      THEN 'Fallo temporal del servidor. Se puede reintentar.'
    ELSE 'No se pudo determinar la causa del fallo. Consulta el detalle técnico.'
  END
WHERE `ultimo_error` IS NOT NULL
  AND `ultimo_error` <> ''
  AND `error_categoria` IS NULL;
