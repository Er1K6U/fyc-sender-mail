-- ============================================================
-- Migración 006: Asignación de cuentas SMTP a usuarios
--
-- Hasta ahora smtp_configs.user_id decidía QUIÉN PODÍA USAR la cuenta, y como
-- solo los admin pueden crearlas, los editores veían la lista vacía y no podían
-- crear ninguna campaña.
--
-- A partir de aquí:
--   - smtp_configs.user_id pasa a significar CREADOR (se conserva por trazabilidad)
--   - el acceso lo decide esta tabla de asignaciones (los admin ven todas)
-- ============================================================

CREATE TABLE IF NOT EXISTS `user_smtp_configs` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED NOT NULL,
  `smtp_config_id` INT UNSIGNED NOT NULL,
  `es_principal`   TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Cuenta preseleccionada al crear campañas',
  `asignado_por`   INT UNSIGNED NULL COMMENT 'Admin que realizó la asignación',
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_smtp` (`user_id`, `smtp_config_id`),
  KEY `idx_usc_user` (`user_id`),
  KEY `idx_usc_smtp` (`smtp_config_id`),
  CONSTRAINT `fk_usc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_usc_smtp` FOREIGN KEY (`smtp_config_id`) REFERENCES `smtp_configs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Qué cuentas SMTP puede usar cada usuario';

-- Backfill: cada cuenta queda asignada a su creador, para que nadie pierda
-- acceso al migrar. INSERT IGNORE lo hace idempotente.
INSERT IGNORE INTO `user_smtp_configs` (`user_id`, `smtp_config_id`, `es_principal`, `asignado_por`)
SELECT s.`user_id`, s.`id`, 0, s.`user_id`
FROM `smtp_configs` s
WHERE s.`user_id` IS NOT NULL;

-- Marcar como principal la única cuenta de cada usuario que tenga exactamente una.
UPDATE `user_smtp_configs` usc
JOIN (
  SELECT `user_id` FROM `user_smtp_configs` GROUP BY `user_id` HAVING COUNT(*) = 1
) unicos ON unicos.`user_id` = usc.`user_id`
SET usc.`es_principal` = 1;
