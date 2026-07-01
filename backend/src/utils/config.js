const pool = require('../db/connection');

async function getConfig(key) {
  const [rows] = await pool.execute('SELECT `value` FROM server_config WHERE `key` = ?', [key]);
  return rows[0]?.value ?? null;
}

async function getAllConfig() {
  const [rows] = await pool.execute('SELECT `key`, `value` FROM server_config ORDER BY `key`');
  return rows;
}

async function setConfig(key, value) {
  await pool.execute(
    'INSERT INTO server_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [key, String(value)]
  );
}

module.exports = { getConfig, getAllConfig, setConfig };
