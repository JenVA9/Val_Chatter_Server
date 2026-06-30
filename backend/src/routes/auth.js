const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');
const { getConfig } = require('../utils/config');
const auth = require('../middleware/auth');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin, is_guest: user.is_guest },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const restricted = await getConfig('restricted_registration');
    if (restricted === 'true') {
      // Check if caller is an admin (optional auth header)
      const header = req.headers.authorization;
      if (!header) return res.status(403).json({ error: 'Registration is restricted to admins' });
      try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        const [adminRows] = await pool.execute('SELECT is_admin FROM users WHERE id = ?', [decoded.id]);
        if (!adminRows[0]?.is_admin) return res.status(403).json({ error: 'Registration is restricted' });
      } catch {
        return res.status(403).json({ error: 'Registration is restricted' });
      }
    }

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    const user = { id: result.insertId, username, is_admin: false, is_guest: false };
    res.json({ token: makeToken(user), userId: user.id, username, is_admin: false, is_guest: false });
  } catch (err) {
    console.error('[register]', err.message ?? err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    if (user.is_banned) return res.status(403).json({ error: 'Account banned' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({
      token: makeToken(user),
      userId: user.id,
      username: user.username,
      is_admin: user.is_admin,
      is_guest: user.is_guest,
    });
  } catch (err) {
    console.error('[login]', err.message ?? err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — verify token and refresh user info
router.get('/me', auth, async (req, res) => {
  res.json({
    userId: req.user.id,
    username: req.user.username,
    is_admin: req.user.is_admin,
    is_guest: req.user.is_guest,
  });
});

module.exports = router;
