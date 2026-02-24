const { createServer } = require('node:http');
const { WebSocketServer } = require('next/dist/compiled/ws');

const SIGNALING_PORT = Number(process.env.SIGNALING_PORT || 3001);
const SIGNALING_HOST = process.env.SIGNALING_HOST || '127.0.0.1';
const MAX_MESSAGE_BYTES = Number(process.env.SIGNALING_MAX_MESSAGE_BYTES || 64 * 1024);
const MAX_MESSAGES_PER_10S = Number(process.env.SIGNALING_MAX_MESSAGES_PER_10S || 120);
const ROOM_IDLE_TTL_MS = Number(process.env.SIGNALING_ROOM_IDLE_TTL_MS || 30 * 60 * 1000);
const LOG_SIGNALING_EVENTS = process.env.SIGNALING_LOG_EVENTS === '1';

/** @type {Map<string, {
 *  sender: { ws: import('ws'); token: string } | null,
 *  receiver: { ws: import('ws'); token: string } | null,
 *  createdAt: number,
 *  touchedAt: number,
 * }>} */
const rooms = new Map();

const metrics = {
  connectedClients: 0,
  totalConnections: 0,
  messagesReceived: 0,
  messagesRejected: 0,
  relaysSent: 0,
  roomsCreated: 0,
  roomsDeleted: 0,
};

function logEvent(...parts) {
  if (LOG_SIGNALING_EVENTS) {
    console.log('[signaling]', ...parts);
  }
}

function isValidRole(value) {
  return value === 'sender' || value === 'receiver';
}

function isValidTransferId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function isValidToken(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 256;
}

function safeSend(ws, payload) {
  if (ws.readyState !== ws.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function reject(ws, code, message, shouldClose = false) {
  metrics.messagesRejected += 1;
  safeSend(ws, { type: 'error', code, message });
  if (shouldClose) {
    ws.close(1008, code);
  }
}

function parseMessage(raw) {
  const str = raw.toString();
  if (Buffer.byteLength(str, 'utf8') > MAX_MESSAGE_BYTES) {
    return { ok: false, reason: 'message-too-large' };
  }

  try {
    const value = JSON.parse(str);
    if (!value || typeof value !== 'object') {
      return { ok: false, reason: 'invalid-json' };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}

function getOtherRole(role) {
  return role === 'sender' ? 'receiver' : 'sender';
}

function getOrCreateRoom(transferId) {
  let room = rooms.get(transferId);
  if (!room) {
    room = {
      sender: null,
      receiver: null,
      createdAt: Date.now(),
      touchedAt: Date.now(),
    };
    rooms.set(transferId, room);
    metrics.roomsCreated += 1;
  }
  return room;
}

function cleanupRoomIfEmpty(transferId) {
  const room = rooms.get(transferId);
  if (!room) return;
  if (!room.sender && !room.receiver) {
    rooms.delete(transferId);
    metrics.roomsDeleted += 1;
  }
}

function pruneIdleRooms() {
  const now = Date.now();
  for (const [transferId, room] of rooms.entries()) {
    if (room.touchedAt + ROOM_IDLE_TTL_MS <= now) {
      const peers = [room.sender, room.receiver].filter(Boolean);
      for (const peer of peers) {
        if (peer?.ws?.readyState === peer.ws.OPEN) {
          safeSend(peer.ws, { type: 'error', code: 'room-expired', message: 'Room expired due to inactivity.' });
          peer.ws.close(1000, 'room-expired');
        }
      }
      rooms.delete(transferId);
      metrics.roomsDeleted += 1;
    }
  }
}

function validateSignal(signal) {
  if (!signal || typeof signal !== 'object' || typeof signal.type !== 'string') {
    return false;
  }

  if (signal.type === 'ready') {
    return true;
  }

  if (signal.type === 'offer' || signal.type === 'answer') {
    return !!(signal.payload && typeof signal.payload.sdp === 'string' && signal.payload.sdp.length <= 200000);
  }

  if (signal.type === 'ice-candidate') {
    return !!(
      signal.payload &&
      typeof signal.payload.candidate === 'string' &&
      signal.payload.candidate.length <= 4000
    );
  }

  if (signal.type === 'cancel') {
    return !signal.payload || typeof signal.payload.reason === 'string';
  }

  if (signal.type === 'error') {
    return !!(
      signal.payload &&
      typeof signal.payload.code === 'string' &&
      typeof signal.payload.message === 'string' &&
      signal.payload.message.length <= 500
    );
  }

  return false;
}

function checkSocketRate(ws) {
  const now = Date.now();
  const windowStart = now - 10 * 1000;
  ws.__messageTimes = (ws.__messageTimes || []).filter((t) => t >= windowStart);

  if (ws.__messageTimes.length >= MAX_MESSAGES_PER_10S) {
    return false;
  }

  ws.__messageTimes.push(now);
  return true;
}

function attachPeer(ws, msg) {
  const { transferId, role, token } = msg;
  if (!isValidTransferId(transferId) || !isValidRole(role) || !isValidToken(token)) {
    reject(ws, 'invalid-join', 'Invalid join-room payload.', true);
    return;
  }

  const room = getOrCreateRoom(transferId);
  room.touchedAt = Date.now();
  const peerKey = role;
  const currentPeer = room[peerKey];

  if (currentPeer && currentPeer.token !== token) {
    reject(ws, 'role-taken', `${role} is already connected.`, true);
    return;
  }

  if (currentPeer && currentPeer.ws !== ws) {
    currentPeer.ws.close(1000, 'replaced');
  }

  room[peerKey] = { ws, token };
  ws.__peer = { transferId, role, token };

  const otherRole = getOtherRole(role);
  const otherPeer = room[otherRole];
  const peerPresent = !!otherPeer;

  safeSend(ws, {
    type: 'joined-room',
    transferId,
    role,
    peerPresent,
  });

  if (otherPeer) {
    safeSend(ws, {
      type: 'peer-joined',
      transferId,
      role,
      peerRole: otherRole,
    });
    safeSend(otherPeer.ws, {
      type: 'peer-joined',
      transferId,
      role: otherRole,
      peerRole: role,
    });
  }
}

function handleRelay(ws, msg) {
  const peer = ws.__peer;
  if (!peer) {
    reject(ws, 'not-joined', 'Join a room first.');
    return;
  }

  if (msg.transferId !== peer.transferId || msg.role !== peer.role || msg.token !== peer.token) {
    reject(ws, 'auth-mismatch', 'Invalid relay credentials.');
    return;
  }

  if (!validateSignal(msg.signal)) {
    reject(ws, 'invalid-signal', 'Invalid signal payload.');
    return;
  }

  const room = rooms.get(peer.transferId);
  if (!room) {
    reject(ws, 'missing-room', 'Room not found.');
    return;
  }

  room.touchedAt = Date.now();

  const targetRole = getOtherRole(peer.role);
  const target = room[targetRole];
  if (!target) {
    reject(ws, 'peer-missing', 'Peer is not connected.');
    return;
  }

  safeSend(target.ws, {
    type: 'relay',
    transferId: peer.transferId,
    role: targetRole,
    from: peer.role,
    signal: msg.signal,
  });
  metrics.relaysSent += 1;
}

function detachPeer(ws) {
  const peer = ws.__peer;
  if (!peer) return;

  const room = rooms.get(peer.transferId);
  if (!room) return;

  const slot = room[peer.role];
  if (slot && slot.ws === ws) {
    room[peer.role] = null;
  }

  const otherRole = getOtherRole(peer.role);
  const other = room[otherRole];
  if (other) {
    safeSend(other.ws, {
      type: 'peer-left',
      transferId: peer.transferId,
      role: otherRole,
      peerRole: peer.role,
    });
  }

  cleanupRoomIfEmpty(peer.transferId);
}

const server = createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      service: 'webrtc-signaling',
      rooms: rooms.size,
      metrics,
      now: new Date().toISOString(),
    })
  );
});

const wss = new WebSocketServer({ server });

wss.on('error', (error) => {
  console.error('[signaling] websocket server error');
  console.error(error);
});

wss.on('connection', (ws) => {
  metrics.connectedClients += 1;
  metrics.totalConnections += 1;
  logEvent('client connected', `active=${metrics.connectedClients}`);

  ws.on('message', (raw) => {
    metrics.messagesReceived += 1;

    if (!checkSocketRate(ws)) {
      reject(ws, 'rate-limited', 'Too many signaling messages. Slow down.', true);
      return;
    }

    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      reject(ws, parsed.reason, 'Invalid signaling message.');
      return;
    }

    const msg = parsed.value;
    if (typeof msg.type !== 'string') {
      reject(ws, 'invalid-type', 'Invalid message type.');
      return;
    }

    if (msg.type === 'join-room') {
      attachPeer(ws, msg);
      return;
    }

    if (msg.type === 'relay') {
      handleRelay(ws, msg);
      return;
    }

    if (msg.type === 'leave-room') {
      ws.close(1000, 'leave-room');
      return;
    }

    reject(ws, 'unknown-type', 'Unknown message type.');
  });

  ws.on('close', () => {
    metrics.connectedClients = Math.max(0, metrics.connectedClients - 1);
    detachPeer(ws);
    logEvent('client disconnected', `active=${metrics.connectedClients}`);
  });

  ws.on('error', () => {
    metrics.connectedClients = Math.max(0, metrics.connectedClients - 1);
    detachPeer(ws);
  });
});

setInterval(pruneIdleRooms, 60 * 1000).unref();

server.on('error', (error) => {
  console.error(`[signaling] failed to start on ${SIGNALING_HOST}:${SIGNALING_PORT}`);
  console.error(error);
  process.exit(1);
});

server.listen(SIGNALING_PORT, SIGNALING_HOST, () => {
  console.log(`[signaling] listening on ws://${SIGNALING_HOST}:${SIGNALING_PORT}`);
});
