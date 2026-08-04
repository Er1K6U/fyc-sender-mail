-- ============================================================
-- Migración 004: Trazabilidad y auditoría de envíos
--
--  1. Soft delete de campañas (nunca se borran físicamente)
--  2. FK a RESTRICT para que un DELETE manual falle en vez de arrasar
--  3. smtp_config_id en campaign_sends (atribución congelada por envío)
--  4. Tabla audit_log SIN foreign keys — nada la borra en cascada
--  5. Triggers de inmutabilidad sobre audit_log
--
-- Idempotente: information_schema + sentencias preparadas.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. SOFT DELETE DE CAMPAÑAS
-- ─────────────────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `deleted_at` DATETIME NULL COMMENT 'Soft delete: fecha de eliminación'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'deleted_by');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `deleted_by` INT UNSIGNED NULL COMMENT 'Usuario que eliminó la campaña'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND INDEX_NAME = 'idx_camp_deleted');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_camp_deleted` ON `campaigns` (`deleted_at`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- 2. FK A RESTRICT — proteger el histórico de un DELETE manual
-- ─────────────────────────────────────────────────────────────
-- campaign_sends → campaigns
SET @existe = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_sends_campaign'
    AND DELETE_RULE = 'CASCADE');
SET @sql = IF(@existe = 0, 'SELECT 1',
  'ALTER TABLE `campaign_sends` DROP FOREIGN KEY `fk_sends_campaign`');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_sends_campaign');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'ALTER TABLE `campaign_sends` ADD CONSTRAINT `fk_sends_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE RESTRICT');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- email_events → campaigns
SET @existe = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_events_campaign'
    AND DELETE_RULE = 'CASCADE');
SET @sql = IF(@existe = 0, 'SELECT 1',
  'ALTER TABLE `email_events` DROP FOREIGN KEY `fk_events_campaign`');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_events_campaign');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'ALTER TABLE `email_events` ADD CONSTRAINT `fk_events_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE RESTRICT');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- 3. ATRIBUCIÓN SMTP CONGELADA POR ENVÍO
-- ─────────────────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends' AND COLUMN_NAME = 'smtp_config_id');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaign_sends` ADD COLUMN `smtp_config_id` INT UNSIGNED NULL COMMENT 'Cuenta SMTP usada en ESTE envío (snapshot, no cambia si se edita la campaña)'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends' AND INDEX_NAME = 'idx_sends_smtp');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_sends_smtp` ON `campaign_sends` (`smtp_config_id`, `enviado_en`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill del histórico existente desde la campaña.
-- Es la mejor aproximación disponible para envíos anteriores a esta migración.
UPDATE `campaign_sends` cs
  JOIN `campaigns` c ON c.id = cs.campaign_id
  SET cs.smtp_config_id = c.smtp_config_id
  WHERE cs.smtp_config_id IS NULL AND c.smtp_config_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. TABLA audit_log — SIN foreign keys (a propósito)
-- ─────────────────────────────────────────────────────────────
-- No lleva FK para que ninguna eliminación en cascada pueda tocarla.
-- Los campos *_nombre / *_email son snapshots: el registro sigue siendo
-- legible aunque la campaña o el usuario dejen de existir.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `evento`          VARCHAR(40) NOT NULL COMMENT 'campana_creada, campana_iniciada, campana_pausada, ...',
  `campaign_id`     INT UNSIGNED NULL COMMENT 'Sin FK: debe sobrevivir a la campaña',
  `campaign_nombre` VARCHAR(150) NULL COMMENT 'Snapshot del nombre al momento del evento',
  `user_id`         INT UNSIGNED NULL COMMENT 'Sin FK: debe sobrevivir al usuario',
  `user_nombre`     VARCHAR(100) NULL COMMENT 'Snapshot; NULL o "Sistema" si fue automático',
  `user_email`      VARCHAR(255) NULL,
  `smtp_config_id`  INT UNSIGNED NULL,
  `smtp_nombre`     VARCHAR(100) NULL,
  `smtp_from_email` VARCHAR(255) NULL,
  `enviados`        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Correos enviados al momento del evento',
  `fallidos`        INT UNSIGNED NOT NULL DEFAULT 0,
  `total_envios`    INT UNSIGNED NOT NULL DEFAULT 0,
  `detalle`         JSON NULL COMMENT 'Contexto adicional del evento',
  `ip`              VARCHAR(45) NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_evento` (`evento`),
  KEY `idx_audit_campaign` (`campaign_id`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_smtp` (`smtp_config_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Auditoría inmutable. Sin FK: nada la borra en cascada.';

-- ─────────────────────────────────────────────────────────────
-- 5. INMUTABILIDAD
-- ─────────────────────────────────────────────────────────────
-- Los triggers bloquean UPDATE y DELETE sobre audit_log.
-- El cuerpo es una sola sentencia, por eso no hace falta DELIMITER.
--
-- AVISO: un trigger lo puede eliminar cualquiera con privilegios DDL.
-- Para inmutabilidad fuerte, revoca los permisos al usuario de la app:
--   REVOKE UPDATE, DELETE ON <base>.audit_log FROM '<usuario_app>'@'%';
DROP TRIGGER IF EXISTS `audit_log_no_update`;
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'audit_log es inmutable: no se permiten actualizaciones';

DROP TRIGGER IF EXISTS `audit_log_no_delete`;
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'audit_log es inmutable: no se permiten eliminaciones';
