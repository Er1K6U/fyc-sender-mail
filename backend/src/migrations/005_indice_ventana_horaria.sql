-- ============================================================
-- Migración 005: Índice para el control de límite horario
--
-- El gate horario cuenta, antes de CADA envío, los correos de la última hora
-- móvil por campaña y por cuenta SMTP. Sin un índice compuesto que cubra
-- (campaign_id, estado, enviado_en) esas consultas degradan a medida que
-- campaign_sends crece — y con el soft delete ahora crece de forma monótona.
--
-- El índice por cuenta (smtp_config_id, enviado_en) ya lo crea la 004.
-- ============================================================

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends'
    AND INDEX_NAME = 'idx_sends_ventana_campana');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_sends_ventana_campana` ON `campaign_sends` (`campaign_id`, `estado`, `enviado_en`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Complemento del índice de la 004: incluye el estado para que el conteo por
-- cuenta no tenga que ir a la fila.
SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_sends'
    AND INDEX_NAME = 'idx_sends_ventana_smtp');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_sends_ventana_smtp` ON `campaign_sends` (`smtp_config_id`, `estado`, `enviado_en`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
