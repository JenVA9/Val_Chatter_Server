const express = require('express');
const pool = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM nodes ORDER BY type, name');
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:type', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM nodes WHERE type = ? ORDER BY name',
      [req.params.type]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
