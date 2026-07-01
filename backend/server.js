const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('./src/app');
const pool = require('./src/db/connection');
const { getConfig } = require('./src/utils/config');
require('dotenv').config();

const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Map<threadId, Set<WebSocket>>
const rooms = new Map();
// All connected clients (for global broadcasts like storage lock)
const allClients = new Set();

function getRoom(threadId) {
  if (!rooms.has(threadId)) rooms.set(threadId, new Set());
  return rooms.get(threadId);
}

function broadcast(threadId, data) {
  const room = rooms.get(String(threadId));
  if (!room) return;
  const payload = JSON.stringify(data);
  for (const client of room) {
    if (client.readyState === 1) client.send(payload);
  }
}

function broadcastAll(data) {
  const payload = JSON.stringify(data);
  for (const client of allClients) {
    if (client.readyState === 1) client.send(payload);
  }
}

app.set('broadcast', broadcast);
app.set('broadcastAll', broadcastAll);

// ── Storage limit check ───────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, 'uploads');

function getDirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir)) {
    try {
      const stat = fs.statSync(path.join(dir, entry));
      total += stat.isFile() ? stat.size : 0;
    } catch {}
  }
  return total;
}

let inputLocked = false;

async function checkStorageLimit() {
  try {
    const limitGb = parseFloat(await getConfig('storage_limit_gb') || '0');
    if (limitGb <= 0) {
      if (inputLocked) { inputLocked = false; broadcastAll({ type: 'input_unlocked' }); }
      return;
    }
    const usedBytes = getDirSize(UPLOADS_DIR);
    const limitBytes = limitGb * 1024 ** 3;
    if (usedBytes >= limitBytes && !inputLocked) {
      inputLocked = true;
      broadcastAll({ type: 'input_locked', reason: 'Storage limit reached' });
    } else if (usedBytes < limitBytes && inputLocked) {
      inputLocked = false;
      broadcastAll({ type: 'input_unlocked' });
    }
  } catch {}
}

// Check every 60 seconds
setInterval(checkStorageLimit, 60_000);

// ── WebSocket connections ─────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  allClients.add(ws);
  let currentThread = null;

  // Send current lock state to new connections
  if (inputLocked) ws.send(JSON.stringify({ type: 'input_locked', reason: 'Storage limit reached' }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'auth') {
      try {
        jwt.verify(msg.token, process.env.JWT_SECRET);
        if (msg.threadId != null) {
          currentThread = String(msg.threadId);
          getRoom(currentThread).add(ws);
        }
      } catch {
        ws.close(4001, 'Invalid token');
      }
    } else if (msg.type === 'join') {
      if (currentThread) getRoom(currentThread).delete(ws);
      currentThread = String(msg.threadId);
      getRoom(currentThread).add(ws);
    }
  });

  ws.on('close', () => {
    allClients.delete(ws);
    if (currentThread) getRoom(currentThread).delete(ws);
  });
});

// ── Startup tasks ─────────────────────────────────────────────────────────

async function initSchema() {
  try {
    const schemaPath = path.join(__dirname, 'src', 'db', 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    const statements = schemaSQL
      .split(';')
      .map(s =>
        s.split('\n')
         .filter(line => !line.trim().startsWith('--'))
         .join('\n')
         .trim()
      )
      .filter(s => s.length > 0);
    const conn = await pool.getConnection();
    try {
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (err) {
          // 1060 = Duplicate column name, 1061 = Duplicate key name,
          // 1062 = Duplicate entry (UNIQUE KEY on table with pre-existing dupes — dedup runs first),
          // 1348 = Column not updatable (generated column from old schema on UPDATE parent_key)
          if (![1060, 1061, 1062, 1348].includes(err.errno)) {
            console.warn('[startup] Schema stmt warning:', err.message);
          }
        }
      }
    } finally {
      conn.release();
    }
    console.log('[startup] Schema applied.');
  } catch (err) {
    console.error('[startup] Schema init failed:', err.message);
  }
}

async function initDedup() {
  try {
    const conn = await pool.getConnection();
    try {
      // Re-route site parent_ids to canonical (lowest-id) map
      await conn.query(`
        UPDATE nodes site_dup
          JOIN nodes map_dup   ON map_dup.id = site_dup.parent_id AND map_dup.type = 'map'
          JOIN nodes map_canon ON map_canon.type = 'map'
            AND map_canon.name = map_dup.name AND map_canon.id < map_dup.id
        SET site_dup.parent_id = map_canon.id, site_dup.parent_key = map_canon.id
        WHERE site_dup.type = 'site'
      `).catch(() => {});
      // Delete true duplicates (keep lowest id per type+name+parent_key group)
      await conn.query(`
        DELETE n1 FROM nodes n1
          JOIN nodes n2
            ON n1.type = n2.type AND n1.name = n2.name
            AND n1.parent_key = n2.parent_key
            AND n1.id > n2.id
      `).catch(() => {});
      // Ensure parent_key is consistent with parent_id (fix any rows missing parent_key)
      await conn.query(`
        UPDATE nodes SET parent_key = COALESCE(parent_id, 0) WHERE parent_key != COALESCE(parent_id, 0)
      `).catch(() => {});
    } finally {
      conn.release();
    }
  } catch {}
}

async function initGuestUser() {
  try {
    const guestEnabled = await getConfig('guest_enabled');
    if (guestEnabled === 'false') return;
    const hash = await bcrypt.hash('guest', 12);
    await pool.execute(
      `INSERT IGNORE INTO users (username, password_hash, is_guest)
       VALUES ('guest', ?, TRUE)`,
      [hash]
    );
  } catch (err) {
    console.error('[startup] Guest user init failed:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Val Tactics server running on port ${PORT}`);
  await initDedup();
  await initSchema();
  await initGuestUser();
  const [admins] = await pool.execute('SELECT id FROM users WHERE is_admin = TRUE LIMIT 1').catch(() => [[]]);
  if (admins.length === 0) console.warn('[startup] ⚠  No admin user found. Run: node setup.js');
  await checkStorageLimit();
});
