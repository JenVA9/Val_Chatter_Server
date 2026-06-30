const express = require('express');
const pool = require('../db/connection');
const auth = require('../middleware/auth');

const router = express.Router();

const MSG_QUERY = `
  SELECT m.id, m.thread_id, m.user_id, u.username,
         m.content, m.image_url, m.is_pinned, m.created_at
  FROM messages m
  JOIN users u ON m.user_id = u.id
`;

router.get('/:threadId', auth, async (req, res) => {
  const { threadId } = req.params;
  const { before } = req.query;
  try {
    let query = MSG_QUERY + ' WHERE m.thread_id = ?';
    const params = [threadId];
    if (before) {
      query += ' AND m.id < ?';
      params.push(Number(before));
    }
    query += ' ORDER BY m.created_at DESC LIMIT 50';
    const [rows] = await pool.execute(query, params);
    res.json(rows.reverse());
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  const { threadId, content, imageUrl } = req.body;
  if (!threadId || (!content && !imageUrl)) {
    return res.status(400).json({ error: 'threadId and content or imageUrl required' });
  }
  try {
    const [result] = await pool.execute(
      'INSERT INTO messages (thread_id, user_id, content, image_url) VALUES (?, ?, ?, ?)',
      [threadId, req.user.id, content || null, imageUrl || null]
    );
    const [rows] = await pool.execute(
      MSG_QUERY + ' WHERE m.id = ?',
      [result.insertId]
    );
    const message = rows[0];

    const broadcast = req.app.get('broadcast');
    if (broadcast) broadcast(threadId, { type: 'new_message', message });

    res.status(201).json(message);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM messages WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await pool.execute('DELETE FROM messages WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
