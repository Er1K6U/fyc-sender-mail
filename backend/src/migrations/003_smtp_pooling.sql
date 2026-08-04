-- ============================================================
-- Migración 003: Pausa automática por límite del proveedor SMTP
-- Soporte para el error 454-4.7.0 "Too many login attempts" de Gmail.
--
-- Idempotente: usa information_schema + sentencias preparadas en lugar de
-- ADD COLUMN IF NOT EXISTS (no disponible en MySQL 8.0) y sin DELIMITER
-- (directiva del cliente mysql, no soportada por el driver mysql2).
-- ============================================================

-- ── campaigns.pausa_motivo ───────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'pausa_motivo');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `pausa_motivo` VARCHAR(30) NULL COMMENT 'manual | limite_smtp'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── campaigns.reanudar_en ────────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'reanudar_en');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `reanudar_en` DATETIME NULL COMMENT 'Reanudación automática programada'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── campaigns.pausas_por_limite ──────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'pausas_por_limite');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `pausas_por_limite` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Nº de pausas por 454 (backoff progresivo)'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── campaigns.ultimo_error_smtp ──────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'ultimo_error_smtp');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `ultimo_error_smtp` VARCHAR(500) NULL COMMENT 'Error del proveedor que causó la pausa'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Índice para el scheduler de reanudación ──────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND INDEX_NAME = 'idx_camp_reanudar');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_camp_reanudar` ON `campaigns` (`reanudar_en`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Nuevas settings de pooling SMTP y pausa por límite ───────────────────────
INSERT INTO `settings` (`clave`, `valor`, `descripcion`) VALUES
  ('smtp_max_connections',  '2',  'Conexiones SMTP simultáneas del pool (conservador para Gmail: 1-2)'),
  ('smtp_max_messages',     '50', 'Mensajes por conexión antes de reciclarla (menor = re-logins menos bruscos)'),
  ('pausa_limite_base_min', '15', 'Minutos de pausa base tras un error 454 de Gmail (backoff progresivo)')
ON DUPLICATE KEY UPDATE `clave` = `clave`;
