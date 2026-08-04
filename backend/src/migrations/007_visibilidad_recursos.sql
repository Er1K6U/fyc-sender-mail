-- ============================================================
-- Migración 007: Modelo de visibilidad por propietario
--
-- Sustituye el modelo "todo compartido" por:
--   - editor: solo ve lo que él creó, más lo marcado como compartido
--   - admin:  ve absolutamente todo
--
-- Solo el admin puede marcar/desmarcar `compartida`.
--
-- SIN BACKFILL a propósito: todo nace privado (compartida = 0) y cada recurso
-- queda en manos de su creador (user_id, ya poblado).
--
-- AVISO DE DESPLIEGUE: al aplicar esta migración los editores dejan de ver de
-- inmediato las listas y plantillas creadas por administradores. Las campañas
-- ya existentes siguen funcionando y enviando —la validación solo actúa al
-- crear o editar—, pero editarlas fallará hasta compartir el recurso.
-- ============================================================

-- ── contact_lists.compartida ─────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact_lists' AND COLUMN_NAME = 'compartida');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `contact_lists` ADD COLUMN `compartida` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Visible para todos los usuarios (solo el admin la marca)'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact_lists' AND INDEX_NAME = 'idx_lists_visibilidad');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_lists_visibilidad` ON `contact_lists` (`user_id`, `compartida`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── templates.compartida ─────────────────────────────────────────────────────
SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'templates' AND COLUMN_NAME = 'compartida');
SET @sql = IF(@existe > 0, 'SELECT 1',
  "ALTER TABLE `templates` ADD COLUMN `compartida` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Visible para todos los usuarios (solo el admin la marca)'");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'templates' AND INDEX_NAME = 'idx_templates_visibilidad');
SET @sql = IF(@existe > 0, 'SELECT 1',
  'CREATE INDEX `idx_templates_visibilidad` ON `templates` (`user_id`, `compartida`)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
