const express = require('express');
const pool = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

const PIN_SELECT = `
  SELECT m.id, m.thread_id, m.user_id, u.username,
         m.content, m.image_url, m.is_pinned, m.pin_expires_at, m.created_at
  FROM messages m
  JOIN users u ON m.user_id = u.id
`;

// POST /api/pins/:messageId  { duration_minutes?: number }  — pin (or re-pin with new expiry)
router.post('/:messageId', auth, async (req, res) => {
  const { duration_minutes } = req.body;
  try {
    if (duration_minutes != null && Number(duration_minutes) > 0) {
      await pool.execute(
        'UPDATE messages SET is_pinned = TRUE, pin_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [Number(duration_minutes), req.params.messageId]
      );
    } else {
      await pool.execute(
        'UPDATE messages SET is_pinned = TRUE, pin_expires_at = NULL WHERE id = ?',
        [req.params.messageId]
      );
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/pins/:messageId  — unpin
router.delete('/:messageId', auth, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE messages SET is_pinned = FALSE, pin_expires_at = NULL WHERE id = ?',
      [req.params.messageId]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/pins/:threadId  — fetch active pins (excludes expired)
router.get('/:threadId', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      PIN_SELECT +
      `WHERE m.thread_id = ? AND m.is_pinned = TRUE
         AND (m.pin_expires_at IS NULL OR m.pin_expires_at > NOW())
       ORDER BY m.created_at ASC`,
      [req.params.threadId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
