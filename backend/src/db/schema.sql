CREATE DATABASE IF NOT EXISTS val_tactics;
USE val_tactics;

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
    is_guest      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nodes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    type       ENUM('map','agent','site','tactic_type','agent_combo') NOT NULL,
    name       VARCHAR(100) NOT NULL,
    parent_id  INT NULL,
    parent_key INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_node (type, name, parent_key),
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS threads (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    canonical_key VARCHAR(255) UNIQUE NOT NULL,
    mode          VARCHAR(20) NOT NULL DEFAULT 'chat',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS thread_nodes (
    thread_id INT NOT NULL,
    node_id   INT NOT NULL,
    PRIMARY KEY (thread_id, node_id),
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id)   REFERENCES nodes(id)   ON DELETE CASCADE
);

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

CREATE TABLE IF NOT EXISTS server_config (
    `key`   VARCHAR(100) PRIMARY KEY,
    `value` VARCHAR(1000) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ip_bans (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    ip         VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whiteboards (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    thread_id  INT NOT NULL UNIQUE,
    data       LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

ALTER TABLE users    ADD COLUMN is_admin      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users    ADD COLUMN is_banned     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users    ADD COLUMN is_guest      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN pin_expires_at DATETIME NULL;
ALTER TABLE threads  ADD COLUMN mode          VARCHAR(20) NOT NULL DEFAULT 'chat';
ALTER TABLE nodes    ADD COLUMN parent_key    INT NOT NULL DEFAULT 0;
ALTER TABLE nodes    ADD UNIQUE KEY uq_node (type, name, parent_key);

INSERT IGNORE INTO server_config VALUES
    ('restricted_registration', 'false'),
    ('guest_enabled',            'true'),
    ('storage_limit_gb',         '0'),
    ('max_file_size_mb',         '50'),
    ('max_image_res',            '4096');

INSERT IGNORE INTO nodes (type, name, parent_key) VALUES
('map', 'Ascent', 0),
('map', 'Bind', 0),
('map', 'Haven', 0),
('map', 'Split', 0),
('map', 'Icebox', 0),
('map', 'Breeze', 0),
('map', 'Fracture', 0),
('map', 'Pearl', 0),
('map', 'Lotus', 0),
('map', 'Sunset', 0);

INSERT IGNORE INTO nodes (type, name, parent_key) VALUES
('agent', 'Jett', 0),
('agent', 'Reyna', 0),
('agent', 'Phoenix', 0),
('agent', 'Yoru', 0),
('agent', 'Neon', 0),
('agent', 'Sage', 0),
('agent', 'Omen', 0),
('agent', 'Brimstone', 0),
('agent', 'Viper', 0),
('agent', 'Astra', 0),
('agent', 'Harbor', 0),
('agent', 'Cypher', 0),
('agent', 'Sova', 0),
('agent', 'Killjoy', 0),
('agent', 'Fade', 0),
('agent', 'Chamber', 0),
('agent', 'Breach', 0),
('agent', 'Skye', 0),
('agent', 'KAY/O', 0),
('agent', 'Gekko', 0),
('agent', 'Deadlock', 0),
('agent', 'Iso', 0),
('agent', 'Clove', 0),
('agent', 'Vyse', 0),
('agent', 'Tejo', 0);

INSERT IGNORE INTO nodes (type, name, parent_key) VALUES
('tactic_type', 'Default', 0),
('tactic_type', 'Rush', 0),
('tactic_type', 'Eco', 0),
('tactic_type', 'Anti-Eco', 0),
('tactic_type', 'Retake', 0),
('tactic_type', 'Post-Plant', 0),
('tactic_type', 'Split Push', 0);

INSERT IGNORE INTO nodes (type, name, parent_id, parent_key)
SELECT 'site', s.site_name, m.id, m.id
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
