-- ============================================================
-- Migración 009: Corte automático por fallos consecutivos
--
-- Si algo va mal de raíz (credenciales caducadas, bloqueo del proveedor, lista
-- corrupta), la campaña se detiene sola en vez de quemar la lista entera.
--
-- A diferencia de la pausa por límite del proveedor (454), esta pausa NO se
-- reanuda automáticamente: requiere que alguien corrija el problema.
-- ============================================================

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'fallos_consecutivos');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `fallos_consecutivos` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Racha actual de fallos; se reinicia con cada envío exitoso'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Umbral configurable desde Ajustes → Envío.
INSERT INTO `settings` (`clave`, `valor`, `descripcion`) VALUES
  ('corte_fallos_consecutivos', '5', 'Fallos consecutivos que pausan automáticamente una campaña (0 = desactivado)')
ON DUPLICATE KEY UPDATE `clave` = `clave`;
