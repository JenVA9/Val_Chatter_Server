const pool = require('../db/connection');

module.exports = async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  try {
    const [rows] = await pool.execute('SELECT id FROM ip_bans WHERE ip = ?', [ip]);
    if (rows.length) return res.status(403).json({ error: 'IP banned' });
    next();
  } catch {
    next();
  }
};
