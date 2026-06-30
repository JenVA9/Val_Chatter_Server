const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    const token = jwt.sign(
      { id: result.insertId, username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, userId: result.insertId, username });
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
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, userId: user.id, username: user.username });
  } catch (err) {
    console.error('[login]', err.message ?? err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
