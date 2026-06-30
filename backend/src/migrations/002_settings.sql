-- ============================================================
-- Migración 002: Tabla de configuración global (settings)
-- Almacén genérico clave/valor para ajustes a nivel aplicación.
-- ============================================================

CREATE TABLE IF NOT EXISTS `settings` (
  `clave`       VARCHAR(100) NOT NULL,
  `valor`       TEXT NULL,
  `descripcion` VARCHAR(255) NULL,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valores por defecto conservadores para máxima entregabilidad.
-- Solo se insertan si la clave no existe (no pisa cambios del usuario).
INSERT INTO `settings` (`clave`, `valor`, `descripcion`) VALUES
  ('throttle_emails_por_min',       '20',   'Límite global de emails por minuto (default + tope máximo)'),
  ('throttle_emails_por_hora',      '200',  'Límite global de emails por hora'),
  ('throttle_pausa_entre_lotes_ms', '3000', 'Pausa recomendada entre lotes en milisegundos'),
  ('throttle_jitter_pct',           '20',   'Porcentaje de randomización aplicado al intervalo entre envíos (0-100)'),
  ('warmup_activo',                 '1',    'Mostrar guía de warmup gradual (informativo)')
ON DUPLICATE KEY UPDATE `clave` = `clave`;
