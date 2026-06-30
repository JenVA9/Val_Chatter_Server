const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT is_banned, is_admin, is_guest FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length || rows[0].is_banned) {
      return res.status(403).json({ error: 'Account banned or not found' });
    }
    req.user.is_admin = rows[0].is_admin;
    req.user.is_guest = rows[0].is_guest;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
