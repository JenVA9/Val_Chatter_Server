const express = require('express');
const pool = require('../db/connection');
const auth = require('../middleware/auth');
const { getCanonicalKey } = require('../utils/threadKey');

const router = express.Router();

router.post('/resolve', auth, async (req, res) => {
  const { nodeIds } = req.body;
  if (!Array.isArray(nodeIds) || !nodeIds.length) {
    return res.status(400).json({ error: 'nodeIds array required' });
  }

  const key = getCanonicalKey(nodeIds);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'INSERT IGNORE INTO threads (canonical_key) VALUES (?)',
      [key]
    );
    const [rows] = await conn.execute(
      'SELECT * FROM threads WHERE canonical_key = ?',
      [key]
    );
    const thread = rows[0];

    for (const nodeId of nodeIds) {
      await conn.execute(
        'INSERT IGNORE INTO thread_nodes (thread_id, node_id) VALUES (?, ?)',
        [thread.id, nodeId]
      );
    }

    await conn.commit();
    res.json(thread);
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

module.exports = router;
