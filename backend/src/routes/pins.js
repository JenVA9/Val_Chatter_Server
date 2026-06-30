const express = require('express');
const pool = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/:messageId', auth, async (req, res) => {
  try {
    await pool.execute('UPDATE messages SET is_pinned = TRUE WHERE id = ?', [req.params.messageId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:messageId', auth, async (req, res) => {
  try {
    await pool.execute('UPDATE messages SET is_pinned = FALSE WHERE id = ?', [req.params.messageId]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:threadId', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT m.id, m.thread_id, m.user_id, u.username,
              m.content, m.image_url, m.is_pinned, m.created_at
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.thread_id = ? AND m.is_pinned = TRUE
       ORDER BY m.created_at ASC`,
      [req.params.threadId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
