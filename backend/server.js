const http = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const app = require('./src/app');
require('dotenv').config();

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

// Map<threadId, Set<WebSocket>>
const rooms = new Map();

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

// Make broadcast accessible in routes
app.set('broadcast', broadcast);

wss.on('connection', (ws) => {
  let currentThread = null;

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
    if (currentThread) getRoom(currentThread).delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Val Tactics server running on port ${PORT}`);
});
