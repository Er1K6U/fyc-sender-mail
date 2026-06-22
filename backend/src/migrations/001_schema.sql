-- ============================================================
-- Email Builder - Esquema completo de base de datos
-- Ejecutar en orden. Requiere MySQL 8.0+
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- TABLA: users
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`          VARCHAR(100) NOT NULL,
  `email`           VARCHAR(255) NOT NULL,
  `password_hash`   VARCHAR(255) NOT NULL,
  `rol`             ENUM('admin', 'editor') NOT NULL DEFAULT 'admin',
  `activo`          TINYINT(1) NOT NULL DEFAULT 1,
  `ultimo_login`    DATETIME NULL,
  `refresh_token`   VARCHAR(500) NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: smtp_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS `smtp_configs` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `nombre`          VARCHAR(100) NOT NULL COMMENT 'Alias descriptivo ej: Gmail Principal',
  `host`            VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
  `puerto`          SMALLINT UNSIGNED NOT NULL DEFAULT 587,
  `seguro`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=STARTTLS(587), 1=SSL(465)',
  `usuario`         VARCHAR(255) NOT NULL,
  `password`        VARCHAR(500) NOT NULL COMMENT 'App Password encriptado',
  `from_nombre`     VARCHAR(100) NOT NULL COMMENT 'Nombre del remitente',
  `from_email`      VARCHAR(255) NOT NULL COMMENT 'Email del remitente',
  `limite_dia`      INT UNSIGNED NOT NULL DEFAULT 500 COMMENT 'Límite diario de envíos',
  `enviados_hoy`    INT UNSIGNED NOT NULL DEFAULT 0,
  `fecha_reset`     DATE NULL COMMENT 'Fecha del último reset de contador',
  `activo`          TINYINT(1) NOT NULL DEFAULT 1,
  `verificado`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Si pasó el test de conexión',
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_smtp_user` (`user_id`),
  KEY `idx_smtp_activo` (`activo`),
  CONSTRAINT `fk_smtp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: contact_lists
-- ============================================================
CREATE TABLE IF NOT EXISTS `contact_lists` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `nombre`          VARCHAR(100) NOT NULL,
  `descripcion`     TEXT NULL,
  `total_contactos` INT UNSIGNED NOT NULL DEFAULT 0,
  `activos`         INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lists_user` (`user_id`),
  CONSTRAINT `fk_lists_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS `contacts` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `list_id`         INT UNSIGNED NOT NULL,
  `user_id`         INT UNSIGNED NOT NULL,
  `nombre`          VARCHAR(100) NOT NULL DEFAULT '',
  `email`           VARCHAR(255) NOT NULL,
  `empresa`         VARCHAR(150) NULL,
  `campos_extra`    JSON NULL COMMENT 'Columnas adicionales del CSV como JSON',
  `email_valido`    TINYINT(1) NOT NULL DEFAULT 1,
  `suscrito`        TINYINT(1) NOT NULL DEFAULT 1,
  `fecha_unsub`     DATETIME NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contact_list_email` (`list_id`, `email`),
  KEY `idx_contact_user` (`user_id`),
  KEY `idx_contact_email` (`email`),
  KEY `idx_contact_suscrito` (`suscrito`),
  CONSTRAINT `fk_contact_list` FOREIGN KEY (`list_id`) REFERENCES `contact_lists` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contact_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: templates
-- ============================================================
CREATE TABLE IF NOT EXISTS `templates` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `nombre`          VARCHAR(100) NOT NULL,
  `descripcion`     TEXT NULL,
  `asunto`          VARCHAR(255) NOT NULL DEFAULT '',
  `html_content`    LONGTEXT NOT NULL,
  `json_design`     LONGTEXT NULL COMMENT 'JSON del editor visual (Unlayer/GrapeJS)',
  `thumbnail_url`   VARCHAR(500) NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_templates_user` (`user_id`),
  CONSTRAINT `fk_templates_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS `campaigns` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         INT UNSIGNED NOT NULL,
  `nombre`          VARCHAR(150) NOT NULL,
  `asunto`          VARCHAR(255) NOT NULL,
  `from_nombre`     VARCHAR(100) NOT NULL,
  `from_email`      VARCHAR(255) NOT NULL,
  `list_id`         INT UNSIGNED NOT NULL,
  `template_id`     INT UNSIGNED NULL,
  `smtp_config_id`  INT UNSIGNED NULL,
  `html_content`    LONGTEXT NOT NULL,
  `estado`          ENUM('borrador','programada','enviando','pausada','completada','error') NOT NULL DEFAULT 'borrador',
  `programada_para` DATETIME NULL,
  `iniciada_en`     DATETIME NULL,
  `completada_en`   DATETIME NULL,
  `emails_por_min`  SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  `emails_por_hora` SMALLINT UNSIGNED NOT NULL DEFAULT 200,
  `pausa_entre_lotes_ms` INT UNSIGNED NOT NULL DEFAULT 3000,
  `total_envios`    INT UNSIGNED NOT NULL DEFAULT 0,
  `enviados`        INT UNSIGNED NOT NULL DEFAULT 0,
  `fallidos`        INT UNSIGNED NOT NULL DEFAULT 0,
  `abiertos`        INT UNSIGNED NOT NULL DEFAULT 0,
  `clicks`          INT UNSIGNED NOT NULL DEFAULT 0,
  `rebotados`       INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_camp_user` (`user_id`),
  KEY `idx_camp_estado` (`estado`),
  KEY `idx_camp_programada` (`programada_para`),
  CONSTRAINT `fk_camp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_camp_list` FOREIGN KEY (`list_id`) REFERENCES `contact_lists` (`id`),
  CONSTRAINT `fk_camp_smtp` FOREIGN KEY (`smtp_config_id`) REFERENCES `smtp_configs` (`id`) ON SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: campaign_sends
-- Registro individual de cada intento de envío
-- ============================================================
CREATE TABLE IF NOT EXISTS `campaign_sends` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `campaign_id`     INT UNSIGNED NOT NULL,
  `contact_id`      INT UNSIGNED NOT NULL,
  `email`           VARCHAR(255) NOT NULL,
  `estado`          ENUM('pendiente','enviado','fallido','rebotado') NOT NULL DEFAULT 'pendiente',
  `intentos`        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `ultimo_error`    TEXT NULL,
  `message_id`      VARCHAR(255) NULL COMMENT 'Message-ID único del email',
  `enviado_en`      DATETIME NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sends_campaign` (`campaign_id`),
  KEY `idx_sends_estado` (`estado`),
  KEY `idx_sends_email` (`email`),
  UNIQUE KEY `uq_send_camp_contact` (`campaign_id`, `contact_id`),
  CONSTRAINT `fk_sends_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sends_contact` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: email_events
-- Tracking de aperturas y clicks
-- ============================================================
CREATE TABLE IF NOT EXISTS `email_events` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `campaign_id`     INT UNSIGNED NOT NULL,
  `send_id`         BIGINT UNSIGNED NOT NULL,
  `tipo`            ENUM('apertura','click','rebote') NOT NULL,
  `url_click`       VARCHAR(2000) NULL COMMENT 'URL clickeada (si tipo=click)',
  `ip`              VARCHAR(45) NULL,
  `user_agent`      VARCHAR(500) NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_events_campaign` (`campaign_id`),
  KEY `idx_events_send` (`send_id`),
  KEY `idx_events_tipo` (`tipo`),
  CONSTRAINT `fk_events_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_send` FOREIGN KEY (`send_id`) REFERENCES `campaign_sends` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: unsubscribes
-- Lista negra global: emails que nunca deben recibir más correos
-- ============================================================
CREATE TABLE IF NOT EXISTS `unsubscribes` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`           VARCHAR(255) NOT NULL,
  `motivo`          ENUM('manual','rebote','queja','link') NOT NULL DEFAULT 'link',
  `campaign_id`     INT UNSIGNED NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_unsub_email` (`email`),
  KEY `idx_unsub_campaign` (`campaign_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
