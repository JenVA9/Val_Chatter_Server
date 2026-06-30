CREATE DATABASE IF NOT EXISTS val_tactics;
USE val_tactics;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('map','agent','site','tactic_type','agent_combo') NOT NULL,
    name VARCHAR(100) NOT NULL,
    parent_id INT NULL,
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS threads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    canonical_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS thread_nodes (
    thread_id INT NOT NULL,
    node_id INT NOT NULL,
    PRIMARY KEY (thread_id, node_id),
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT,
    image_url VARCHAR(512),
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed Valorant maps
INSERT INTO nodes (type, name) VALUES
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

-- Seed agents
INSERT INTO nodes (type, name) VALUES
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

-- Seed tactic types
INSERT INTO nodes (type, name) VALUES
('tactic_type', 'Default'),
('tactic_type', 'Rush'),
('tactic_type', 'Eco'),
('tactic_type', 'Anti-Eco'),
('tactic_type', 'Retake'),
('tactic_type', 'Post-Plant'),
('tactic_type', 'Split Push');

-- Seed sites (parent_id references map rows by insertion order)
-- Ascent = 1, Bind = 2, Haven = 3, Split = 4
INSERT INTO nodes (type, name, parent_id) VALUES
('site', 'A Site', 1),
('site', 'B Site', 1),
('site', 'Mid',    1),
('site', 'A Site', 2),
('site', 'B Site', 2),
('site', 'A Site', 3),
('site', 'B Site', 3),
('site', 'C Site', 3),
('site', 'Mid',    3),
('site', 'A Site', 4),
('site', 'B Site', 4),
('site', 'Mid',    4);
