const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db/connection');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { getAllConfig, setConfig } = require('../utils/config');

const router = express.Router();

// All admin routes require auth + admin role
router.use(auth, adminOnly);

// ── Config ────────────────────────────────────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    res.json(await getAllConfig());
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/config/:key', async (req, res) => {
  const { value } = req.body;
  if (value == null) return res.status(400).json({ error: 'value required' });
  try {
    await setConfig(req.params.key, value);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, is_admin, is_banned, is_guest, created_at FROM users ORDER BY id'
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:id', async (req, res) => {
  const { is_admin, is_banned } = req.body;
  if (is_admin == null && is_banned == null) return res.status(400).json({ error: 'Nothing to update' });
  try {
    if (is_admin != null) {
      await pool.execute('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, req.params.id]);
    }
    if (is_banned != null) {
      await pool.execute('UPDATE users SET is_banned = ? WHERE id = ?', [is_banned ? 1 : 0, req.params.id]);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Nodes ─────────────────────────────────────────────────────────────────

router.get('/nodes', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM nodes ORDER BY type, name');
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/nodes', async (req, res) => {
  const { type, name, parent_id } = req.body;
  if (!type || !name) return res.status(400).json({ error: 'type and name required' });
  try {
    const pid = parent_id || null;
    const pkey = pid || 0;
    const [result] = await pool.execute(
      'INSERT INTO nodes (type, name, parent_id, parent_key) VALUES (?, ?, ?, ?)',
      [type, name, pid, pkey]
    );
    const [rows] = await pool.execute('SELECT * FROM nodes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Node already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/nodes/:id', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    await pool.execute('UPDATE nodes SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Node already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/nodes/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM nodes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Storage ───────────────────────────────────────────────────────────────

function getDirectorySize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      total += stat.isDirectory() ? getDirectorySize(full) : stat.size;
    } catch {}
  }
  return total;
}

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

router.get('/storage', async (req, res) => {
  try {
    const { getConfig } = require('../utils/config');
    const limitGb = parseFloat(await getConfig('storage_limit_gb') || '0');
    const usedBytes = getDirectorySize(UPLOADS_DIR);
    res.json({ used_bytes: usedBytes, limit_bytes: limitGb * 1024 ** 3 });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/storage/purge', async (req, res) => {
  const { category } = req.body; // 'all' or a subfolder name (future use)
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return res.json({ ok: true, deleted: 0 });
    const files = fs.readdirSync(UPLOADS_DIR);
    let deleted = 0;
    for (const f of files) {
      const fp = path.join(UPLOADS_DIR, f);
      if (fs.statSync(fp).isFile()) {
        fs.unlinkSync(fp);
        deleted++;
      }
    }
    // Remove image_url from messages if purging all
    if (!category || category === 'all') {
      await pool.execute('UPDATE messages SET image_url = NULL WHERE image_url IS NOT NULL');
    }
    res.json({ ok: true, deleted });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── IP Bans ───────────────────────────────────────────────────────────────

router.get('/ip-bans', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, ip, created_at FROM ip_bans ORDER BY created_at DESC');
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/ip-bans', async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  try {
    await pool.execute('INSERT IGNORE INTO ip_bans (ip) VALUES (?)', [ip]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/ip-bans/:ip', async (req, res) => {
  try {
    await pool.execute('DELETE FROM ip_bans WHERE ip = ?', [req.params.ip]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
