CREATE DATABASE IF NOT EXISTS val_tactics;
USE val_tactics;

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
    is_guest      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Nodes ──────────────────────────────────────────────────────────────────
-- parent_key virtual column lets us enforce uniqueness even when parent_id is NULL
CREATE TABLE IF NOT EXISTS nodes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    type       ENUM('map','agent','site','tactic_type','agent_combo') NOT NULL,
    name       VARCHAR(100) NOT NULL,
    parent_id  INT NULL,
    parent_key INT AS (COALESCE(parent_id, 0)) VIRTUAL,
    UNIQUE KEY uq_node (type, name, parent_key),
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE SET NULL
);

-- ── Threads ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    canonical_key VARCHAR(255) UNIQUE NOT NULL,
    mode          VARCHAR(20) NOT NULL DEFAULT 'chat',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Thread ↔ Nodes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS thread_nodes (
    thread_id INT NOT NULL,
    node_id   INT NOT NULL,
    PRIMARY KEY (thread_id, node_id),
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id)   REFERENCES nodes(id)   ON DELETE CASCADE
);

-- ── Messages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    thread_id      INT NOT NULL,
    user_id        INT NOT NULL,
    content        TEXT,
    image_url      VARCHAR(512),
    is_pinned      BOOLEAN DEFAULT FALSE,
    pin_expires_at DATETIME NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);

-- ── Server config key-value store ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS server_config (
    `key`   VARCHAR(100) PRIMARY KEY,
    `value` VARCHAR(1000) NOT NULL DEFAULT ''
);

-- ── IP bans ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_bans (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    ip         VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Whiteboards (one per thread) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whiteboards (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    thread_id  INT NOT NULL UNIQUE,
    data       LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

-- ── Migrate existing tables (safe to run on fresh or existing DBs) ─────────
ALTER TABLE users    ADD COLUMN is_admin      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users    ADD COLUMN is_banned     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users    ADD COLUMN is_guest      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN pin_expires_at DATETIME NULL;
ALTER TABLE threads  ADD COLUMN mode          VARCHAR(20) NOT NULL DEFAULT 'chat';

-- ── Default config values ──────────────────────────────────────────────────
INSERT IGNORE INTO server_config VALUES
    ('restricted_registration', 'false'),
    ('guest_enabled',            'true'),
    ('storage_limit_gb',         '0'),
    ('max_file_size_mb',         '50'),
    ('max_image_res',            '4096');

-- ── Seed Valorant maps ─────────────────────────────────────────────────────
INSERT IGNORE INTO nodes (type, name) VALUES
('map', 'Ascent'),
('map', 'Bind'),
('map', 'Haven'),
('map', 'Split'),
('map', 'Icebox'),
('map', 'Breeze'),
('map', 'Fracture'),
('map', 'Pearl'),
('map', 'Lotus'),
('map', 'Sunset');

-- ── Seed agents ────────────────────────────────────────────────────────────
INSERT IGNORE INTO nodes (type, name) VALUES
('agent', 'Jett'),
('agent', 'Reyna'),
('agent', 'Phoenix'),
('agent', 'Yoru'),
('agent', 'Neon'),
('agent', 'Sage'),
('agent', 'Omen'),
('agent', 'Brimstone'),
('agent', 'Viper'),
('agent', 'Astra'),
('agent', 'Harbor'),
('agent', 'Cypher'),
('agent', 'Sova'),
('agent', 'Killjoy'),
('agent', 'Fade'),
('agent', 'Chamber'),
('agent', 'Breach'),
('agent', 'Skye'),
('agent', 'KAY/O'),
('agent', 'Gekko'),
('agent', 'Deadlock'),
('agent', 'Iso'),
('agent', 'Clove'),
('agent', 'Vyse'),
('agent', 'Tejo');

-- ── Seed tactic types ──────────────────────────────────────────────────────
INSERT IGNORE INTO nodes (type, name) VALUES
('tactic_type', 'Default'),
('tactic_type', 'Rush'),
('tactic_type', 'Eco'),
('tactic_type', 'Anti-Eco'),
('tactic_type', 'Retake'),
('tactic_type', 'Post-Plant'),
('tactic_type', 'Split Push');

-- ── Seed sites (uses JOIN so parent IDs are always correct) ────────────────
INSERT IGNORE INTO nodes (type, name, parent_id)
SELECT 'site', s.site_name, m.id
FROM (
    SELECT 'Ascent' AS map_name, 'A Site' AS site_name UNION ALL
    SELECT 'Ascent', 'B Site'                          UNION ALL
    SELECT 'Ascent', 'Mid'                             UNION ALL
    SELECT 'Bind',   'A Site'                          UNION ALL
    SELECT 'Bind',   'B Site'                          UNION ALL
    SELECT 'Haven',  'A Site'                          UNION ALL
    SELECT 'Haven',  'B Site'                          UNION ALL
    SELECT 'Haven',  'C Site'                          UNION ALL
    SELECT 'Haven',  'Mid'                             UNION ALL
    SELECT 'Split',  'A Site'                          UNION ALL
    SELECT 'Split',  'B Site'                          UNION ALL
    SELECT 'Split',  'Mid'
) s
JOIN nodes m ON m.type = 'map' AND m.name = s.map_name;
