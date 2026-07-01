const express = require('express');
const pool = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/whiteboard/:threadId
router.get('/:threadId', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT data FROM whiteboards WHERE thread_id = ?',
      [req.params.threadId]
    );
    if (!rows.length) return res.json({ data: null });
    res.json({ data: rows[0].data ? JSON.parse(rows[0].data) : null });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/whiteboard/:threadId  { objects: [...] }
router.put('/:threadId', auth, async (req, res) => {
  if (req.user.is_guest) return res.status(403).json({ error: 'Read-only account' });
  const { objects } = req.body;
  if (!Array.isArray(objects)) return res.status(400).json({ error: 'objects array required' });
  const threadId = req.params.threadId;
  try {
    const json = JSON.stringify(objects);
    await pool.execute(
      `INSERT INTO whiteboards (thread_id, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [threadId, json]
    );

    const broadcast = req.app.get('broadcast');
    if (broadcast) broadcast(threadId, { type: 'whiteboard_update', objects });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
