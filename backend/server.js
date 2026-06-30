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
          // 1060 = Duplicate column name (ALTER TABLE on column that already exists — MySQL 5.7)
          // 1061 = Duplicate key name
          if (err.errno !== 1060 && err.errno !== 1061) {
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
  await initSchema();
  await initGuestUser();
  const [admins] = await pool.execute('SELECT id FROM users WHERE is_admin = TRUE LIMIT 1').catch(() => [[]]);
  if (admins.length === 0) console.warn('[startup] ⚠  No admin user found. Run: node setup.js');
  await checkStorageLimit();
});
