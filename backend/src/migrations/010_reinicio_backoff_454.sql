-- ============================================================
-- Migración 010: Reinicio del backoff por límite del proveedor
--
-- PROBLEMA: `pausas_por_limite` solo se incrementaba y nunca se reiniciaba, así
-- que la escalada (15 → 30 → 60 → 120 min, tope 8×) se volvía permanente. Tras
-- 4 incidentes, CUALQUIER 454 posterior pausaba la campaña 2 horas, aunque la
-- cuenta llevara horas funcionando con normalidad. El resultado era un ritmo
-- real ~8 veces inferior al configurado.
--
-- Esta columna permite distinguir un incidente nuevo de la continuación del
-- anterior: si la campaña envió con normalidad desde la última pausa, la
-- escalada se reinicia.
-- ============================================================

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'ultima_pausa_limite');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `campaigns` ADD COLUMN `ultima_pausa_limite` DATETIME NULL COMMENT 'Momento de la última pausa por 454, para decidir si la escalada continúa o se reinicia'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Las campañas que arrastran una escalada alta por este bug vuelven a empezar.
-- Sin esto seguirían con pausas de 2 horas aunque el código ya esté corregido.
UPDATE `campaigns`
SET `pausas_por_limite` = 0
WHERE `pausas_por_limite` > 0;
