/*
 * CCGame 完整数据中转服务器（ws-fullrelay）
 *
 * 与 trystero 的信令中转不同，本服务器承担"全部游戏数据"的转发：
 * 客户端通过 src/net/ws-fullrelay.js 连接，把 INPUT / SNAPSHOT /
 * ENTITY_DELTA / INVENTORY 等所有 channel 都封装成 {t:'msg'} 帧发到服务器，
 * 服务器按 `to` 字段广播或单播给同一房间内的其他成员。
 *
 * 由于不解析任何业务负载，本服务器对游戏逻辑完全透明；客户端 protocol.js
 * 里的 channel 名 / 字段无需任何改动即可工作。
 *
 * 协议（JSON over WebSocket）：
 *
 *   C -> S:
 *     {t:'hello', appId, roomId, password?, hint?}
 *     {t:'msg',   ch, d, to?}          // to: peerId | peerId[] | undefined(=broadcast)
 *     {t:'ping',  id, to}              // 用于 RTT
 *     {t:'pong',  id, to}              // 回 ping
 *     {t:'leave'}                      // 主动离开
 *
 *   S -> C:
 *     {t:'welcome',   self, peers}     // peers = 房间内其他成员 id 数组
 *     {t:'peer-join', id}
 *     {t:'peer-leave',id}
 *     {t:'msg',  ch, d, from}
 *     {t:'ping', id, from}
 *     {t:'pong', id, from}
 *     {t:'error',code,message}         // 拒绝并准备关闭
 *
 * 安全 / 限流：
 *   - 单连接消息体大小上限 MAX_MSG_BYTES
 *   - 单连接 1 秒内消息条数与字节速率上限
 *   - 单房间成员上限 MAX_PEERS_PER_ROOM
 *   - 心跳：30s 一次 WS ping，3 次未回 pong 即断开
 *   - 不在内存外持久化任何数据
 */

import { WebSocketServer } from 'ws';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || '0.0.0.0';
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_MSG_BYTES = 96 * 1024; // 单条消息最多 96KB（覆盖较大的 ENTITY_DELTA）
const MAX_MSG_PER_SECOND = 240;  // 单 peer 速率
const MAX_BYTES_PER_SECOND = 1.5 * 1024 * 1024; // 单 peer 1.5MB/s
const MAX_PEERS_PER_ROOM = 32;
const MAX_ROOMS = 5000;
const MAX_ROOM_ID_LEN = 64;
const MAX_APP_ID_LEN = 64;
const HELLO_TIMEOUT_MS = 10_000;

// roomKey -> { appId, roomId, password, peers: Map<peerId, conn> }
const rooms = new Map();

function roomKeyOf(appId, roomId) {
  return `${appId}|${roomId}`;
}

function ctEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function send(conn, obj) {
  if (conn.ws.readyState !== conn.ws.OPEN) return;
  try {
    conn.ws.send(JSON.stringify(obj));
  } catch (err) {
    // 队列满 / socket 已关闭等：直接关闭连接，触发清理
    try { conn.ws.close(1011, 'send-failed'); } catch { /* noop */ }
  }
}

function closeWithError(conn, code, message) {
  send(conn, { t: 'error', code, message });
  try { conn.ws.close(1008, code); } catch { /* noop */ }
}

function getOrCreateRoom(appId, roomId, password) {
  const key = roomKeyOf(appId, roomId);
  let room = rooms.get(key);
  if (room) {
    if (room.password && !ctEqual(room.password, password || '')) {
      return { error: 'password-mismatch' };
    }
    if (room.peers.size >= MAX_PEERS_PER_ROOM) {
      return { error: 'room-full' };
    }
    return { room };
  }
  if (rooms.size >= MAX_ROOMS) {
    return { error: 'server-full' };
  }
  room = {
    appId,
    roomId,
    password: password || '',
    peers: new Map()
  };
  rooms.set(key, room);
  return { room };
}

function leaveRoom(conn) {
  const room = conn.room;
  if (!room) return;
  room.peers.delete(conn.peerId);
  // 通知其他成员
  for (const other of room.peers.values()) {
    send(other, { t: 'peer-leave', id: conn.peerId });
  }
  if (room.peers.size === 0) {
    rooms.delete(roomKeyOf(room.appId, room.roomId));
  }
  conn.room = null;
}

function validateString(value, maxLen) {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > maxLen) return null;
  return value;
}

function resolveTargets(room, to) {
  if (to == null) return null; // 广播
  if (Array.isArray(to)) {
    const out = [];
    for (const id of to) {
      if (typeof id === 'string' && room.peers.has(id)) out.push(id);
    }
    return out;
  }
  if (typeof to === 'string' && room.peers.has(to)) return [to];
  return [];
}

function handleHello(conn, msg) {
  const appId = validateString(msg.appId, MAX_APP_ID_LEN);
  const roomId = validateString(msg.roomId, MAX_ROOM_ID_LEN);
  if (!appId || !roomId) {
    closeWithError(conn, 'bad-hello', '无效的 appId / roomId');
    return;
  }
  const password = typeof msg.password === 'string' ? msg.password.slice(0, 128) : '';
  // 客户端自带 self（与 Trystero 行为对齐）；只接受合法 ID（hex / 字母数字），
  // 缺失或冲突时由服务端兜底分配，避免 peerId 重复造成消息错路。
  let peerId = '';
  if (typeof msg.self === 'string' && /^[A-Za-z0-9]{4,64}$/.test(msg.self)) {
    peerId = msg.self;
  }
  const res = getOrCreateRoom(appId, roomId, password);
  if (res.error) {
    closeWithError(conn, res.error, res.error);
    return;
  }
  const room = res.room;
  if (!peerId || room.peers.has(peerId)) {
    // 兜底：服务端生成 32 hex 字符（≈128 bit 熵），保证整服唯一
    peerId = randomUUID().replace(/-/g, '');
  }
  conn.peerId = peerId;
  conn.room = room;
  conn.helloed = true;
  const otherIds = Array.from(room.peers.keys());
  room.peers.set(conn.peerId, conn);
  send(conn, { t: 'welcome', self: conn.peerId, peers: otherIds });
  for (const other of room.peers.values()) {
    if (other === conn) continue;
    send(other, { t: 'peer-join', id: conn.peerId });
  }
}

function handleMsg(conn, msg) {
  const room = conn.room;
  if (!room) return;
  const ch = validateString(msg.ch, 32);
  if (!ch) return;
  const targets = resolveTargets(room, msg.to);
  const payload = { t: 'msg', ch, d: msg.d, from: conn.peerId };
  if (targets === null) {
    for (const other of room.peers.values()) {
      if (other === conn) continue;
      send(other, payload);
    }
  } else {
    for (const id of targets) {
      const other = room.peers.get(id);
      if (other && other !== conn) send(other, payload);
    }
  }
}

function handlePing(conn, msg, type) {
  // 转发 ping / pong（透明传输，由客户端两端测 RTT）
  const room = conn.room;
  if (!room) return;
  const toId = typeof msg.to === 'string' ? msg.to : null;
  if (!toId) return;
  const other = room.peers.get(toId);
  if (!other || other === conn) return;
  send(other, { t: type, id: typeof msg.id === 'number' ? msg.id : 0, from: conn.peerId });
}

function checkRateLimit(conn, byteLen) {
  const now = Date.now();
  if (now - conn.rateWindowStart >= 1000) {
    conn.rateWindowStart = now;
    conn.rateMsgs = 0;
    conn.rateBytes = 0;
  }
  conn.rateMsgs += 1;
  conn.rateBytes += byteLen;
  if (conn.rateMsgs > MAX_MSG_PER_SECOND || conn.rateBytes > MAX_BYTES_PER_SECOND) {
    closeWithError(conn, 'rate-limit', '速率超出限制');
    return false;
  }
  return true;
}

function handleRaw(conn, raw) {
  // raw 可能是 Buffer / ArrayBuffer / string；本协议只接 JSON 文本
  let text;
  if (typeof raw === 'string') {
    text = raw;
  } else if (Buffer.isBuffer(raw)) {
    text = raw.toString('utf8');
  } else {
    return; // 忽略二进制帧
  }
  const byteLen = Buffer.byteLength(text, 'utf8');
  if (byteLen > MAX_MSG_BYTES) {
    closeWithError(conn, 'msg-too-large', '消息体过大');
    return;
  }
  if (!checkRateLimit(conn, byteLen)) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    closeWithError(conn, 'bad-json', '消息不是合法 JSON');
    return;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
  switch (msg.t) {
    case 'hello':
      if (conn.helloed) return;
      handleHello(conn, msg);
      break;
    case 'msg':
      if (!conn.helloed) return;
      handleMsg(conn, msg);
      break;
    case 'ping':
      if (!conn.helloed) return;
      handlePing(conn, msg, 'ping');
      break;
    case 'pong':
      if (!conn.helloed) return;
      handlePing(conn, msg, 'pong');
      break;
    case 'leave':
      if (!conn.helloed) return;
      leaveRoom(conn);
      try { conn.ws.close(1000, 'leave'); } catch { /* noop */ }
      break;
    default:
      // 未知类型，忽略
      break;
  }
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`ok\nrooms=${rooms.size}\n`);
    return;
  }
  // 客户端联机设置里选择「自定义」后，会通过 HTTP 拉取这个协议接口来识别
  // 当前服务器属于哪种中转：'ws-relay'（仅信令）或 'ws-fullrelay'（完整数据
  // 中转）。两种服务器实现都需提供同名接口、同样的 JSON 结构。
  if (req.url === '/ccgame-info') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      service: 'ccgame-relay',
      type: 'ws-fullrelay',
      version: 1,
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('CCGame ws-fullrelay server is running.\n');
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_MSG_BYTES + 1024,
  perMessageDeflate: false
});

wss.on('connection', (ws, req) => {
  ws.__alive = true;
  const conn = {
    ws,
    room: null,
    peerId: null,
    helloed: false,
    rateWindowStart: Date.now(),
    rateMsgs: 0,
    rateBytes: 0,
    ip: req?.socket?.remoteAddress || ''
  };
  // 强制在 HELLO_TIMEOUT_MS 内完成 hello，避免半开连接占用资源
  const helloTimer = setTimeout(() => {
    if (!conn.helloed) {
      closeWithError(conn, 'hello-timeout', '握手超时');
    }
  }, HELLO_TIMEOUT_MS);

  ws.on('message', (raw) => handleRaw(conn, raw));
  ws.on('pong', () => { ws.__alive = true; });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    leaveRoom(conn);
  });
  ws.on('error', () => {
    // ws 库会随后触发 close，这里不重复清理
  });
});

const heartbeatTimer = setInterval(() => {
  for (const client of wss.clients) {
    if (client.__alive === false) {
      try { client.terminate(); } catch { /* noop */ }
      continue;
    }
    client.__alive = false;
    try { client.ping(); } catch { /* noop */ }
  }
}, HEARTBEAT_INTERVAL_MS);

httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[ccgame-fullrelay] listening on ws://${HOST}:${PORT}`);
});

function shutdown() {
  // eslint-disable-next-line no-console
  console.log('[ccgame-fullrelay] shutting down...');
  clearInterval(heartbeatTimer);
  for (const client of wss.clients) {
    try { client.close(1001, 'shutdown'); } catch { /* noop */ }
  }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
