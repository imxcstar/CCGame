/*
 * ws-fullrelay 客户端 transport
 *
 * 实现一份与 Trystero `joinRoom` 同形的接口，但底层不使用 WebRTC：所有
 * channel 消息通过 WebSocket 直接经服务器转发。适用于 P2P 完全不通的网络
 * 环境（对称 NAT / UDP 全屏蔽 / 严格企业内网）。
 *
 * 对外暴露：
 *   game.netWsFullrelay = {
 *     joinRoom(config, roomId) -> room,
 *     selfId,        // 当前会话的 selfId（在 prepareSelfId / joinRoom 时刷新）
 *     prepareSelfId()// 提前为下一次 joinRoom 分配 selfId，供 transport 层读取
 *   }
 *
 * `room` 提供与 Trystero 一致的方法：
 *   makeAction(name) -> [send, receive]
 *   onPeerJoin(fn) / onPeerLeave(fn)
 *   getPeers() -> { peerId: {} }
 *   ping(peerId) -> Promise<number>
 *   leave() -> Promise<void>
 *
 * 服务端见 server/index.js。
 *
 * 配置：通过 transport.js / lobby.js 调用的 `config.relayConfig.urls`
 * 传入服务器地址列表；多个 URL 会按顺序尝试，并在断线时自动故障转移。
 */
(function (game) {
  // 与 Trystero 一致：客户端自行生成 selfId（短 UUID），随 hello 上传给服务端。
  // 这样上层 transport.js 在 joinRoom 同步返回后就能立刻拿到 selfId，无需
  // 等待 WS welcome。
  function generateSelfId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        // 32 个 hex 字符 ≈ 128 bit 熵；房间内只需保证唯一即可
        return crypto.randomUUID().replace(/-/g, '');
      }
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        let hex = '';
        for (let i = 0; i < buf.length; i += 1) {
          hex += buf[i].toString(16).padStart(2, '0');
        }
        return hex;
      }
    } catch { /* noop */ }
    // 极端兜底：仅在 crypto API 完全不可用时使用；该 ID 不参与任何鉴权 /
    // 密钥派生，唯一用途是在一个房间内做 peer 寻址，因此可以接受较弱的熵。
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  }

  // 模块级 selfId：与 trystero 行为对齐——一个浏览器 tab 在整个生命周期内
  // 使用同一个 selfId，跨房间共享（服务端用 peerId 做房间内去重；不同房间
  // 用同一个 selfId 不会冲突，反而能让 transport.getSelfId() 与服务器看到
  // 的 self 完全一致）。
  const MODULE = { selfId: null };

  function prepareSelfId() {
    if (!MODULE.selfId) {
      MODULE.selfId = generateSelfId();
    }
    return MODULE.selfId;
  }

  function pickUrls(config) {
    const urls = config?.relayConfig?.urls;
    if (Array.isArray(urls) && urls.length > 0) {
      return urls.slice();
    }
    return [];
  }

  function joinRoom(config, roomId) {
    const appId = config?.appId || 'ccgame';
    const password = config?.password || '';
    const urls = pickUrls(config);
    if (urls.length === 0) {
      throw new Error('ws-fullrelay 模式需要至少一个 wss:// / ws:// 中转服务器地址');
    }
    // 复用 / 懒生成模块级 selfId（与 trystero 行为一致：单 tab 单 selfId）。
    const selfId = prepareSelfId();
    return createRoom({ appId, roomId, password, urls, selfId });
  }

  function createRoom({ appId, roomId, password, urls, selfId }) {
    // 已注册的 channel：name -> { receive: fn|null }
    const channels = new Map();
    const peerJoinHandlers = new Set();
    const peerLeaveHandlers = new Set();
    // peerId -> {} （仅用于 getPeers 形态对齐 trystero）
    const peers = new Map();
    // 待 ack 的 ping：pingId -> { resolve, t0 }
    const pendingPings = new Map();
    let pingSeq = 1;

    let urlIdx = 0;
    let ws = null;
    let closed = false;
    let reconnectTimer = 0;
    let reconnectAttempt = 0;
    let everConnected = false; // 是否曾经成功 welcome 过；用于区分初连与重连
    const RECONNECT_MAX = 6;
    const RECONNECT_BASE = 500;

    function getChannel(name) {
      let ch = channels.get(name);
      if (!ch) {
        ch = { receive: null };
        channels.set(name, ch);
      }
      return ch;
    }

    function safeSendRaw(obj) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(obj));
        return true;
      } catch (err) {
        console.warn('[ws-fullrelay] send error', err);
        return false;
      }
    }

    function emitPeerJoin(id) {
      peerJoinHandlers.forEach((fn) => {
        try { fn(id); } catch (err) { console.warn('[ws-fullrelay] peer join handler error', err); }
      });
    }

    function emitPeerLeave(id) {
      peerLeaveHandlers.forEach((fn) => {
        try { fn(id); } catch (err) { console.warn('[ws-fullrelay] peer leave handler error', err); }
      });
    }

    function handleMessage(text) {
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      switch (msg.t) {
        case 'welcome': {
          const wasReconnect = everConnected;
          everConnected = true;
          // 服务端会用我们 hello 里上传的 self；msg.self 仅作为兜底校验
          // 若不匹配，记一个 warn，但仍以本地 selfId 为准
          if (msg.self && msg.self !== selfId) {
            console.warn('[ws-fullrelay] server reassigned selfId, keeping local');
          }
          // 标记房间内已有的成员；若是重连，需要先把"旧 peer 但这次不在
          // 列表里"的视为掉线，再把新列表里的 peer 当作新加入。
          const incoming = new Set((msg.peers || []).map(String));
          // 旧成员（重连前缓存）中不在新列表的：发出 peer-leave
          Array.from(peers.keys()).forEach((id) => {
            if (!incoming.has(id)) {
              peers.delete(id);
              if (wasReconnect) emitPeerLeave(id);
            }
          });
          incoming.forEach((id) => {
            if (!peers.has(id)) {
              peers.set(id, {});
              emitPeerJoin(id);
            }
          });
          reconnectAttempt = 0;
          break;
        }
        case 'peer-join': {
          const id = String(msg.id || '');
          if (!id || peers.has(id)) return;
          peers.set(id, {});
          emitPeerJoin(id);
          break;
        }
        case 'peer-leave': {
          const id = String(msg.id || '');
          if (!id || !peers.has(id)) return;
          peers.delete(id);
          emitPeerLeave(id);
          break;
        }
        case 'msg': {
          const ch = channels.get(String(msg.ch || ''));
          if (!ch || !ch.receive) return;
          try {
            ch.receive(msg.d, String(msg.from || ''), null);
          } catch (err) {
            console.warn('[ws-fullrelay] receive handler error', err);
          }
          break;
        }
        case 'ping': {
          // 对端发起的 ping：原样回 pong
          safeSendRaw({ t: 'pong', id: msg.id, to: String(msg.from || '') });
          break;
        }
        case 'pong': {
          const pending = pendingPings.get(msg.id);
          if (pending) {
            pendingPings.delete(msg.id);
            pending.resolve(Math.max(0, Date.now() - pending.t0));
          }
          break;
        }
        case 'error': {
          console.warn('[ws-fullrelay] server error', msg.code, msg.message);
          // 致命错误（如密码错 / 房间满）就别再重试了
          if (msg.code === 'password-mismatch' || msg.code === 'room-full' || msg.code === 'server-full') {
            closed = true;
          }
          break;
        }
        default:
          break;
      }
    }

    function scheduleReconnect() {
      if (closed) return;
      if (reconnectAttempt >= RECONNECT_MAX) return;
      reconnectAttempt += 1;
      // 轮换到下一个 URL，便于故障转移
      urlIdx = (urlIdx + 1) % urls.length;
      const delay = Math.min(8000, RECONNECT_BASE * Math.pow(2, reconnectAttempt - 1));
      reconnectTimer = setTimeout(() => {
        reconnectTimer = 0;
        connect();
      }, delay);
    }

    function connect() {
      if (closed) return;
      const url = urls[urlIdx];
      let sock;
      try {
        sock = new WebSocket(url);
      } catch (err) {
        console.warn('[ws-fullrelay] WebSocket ctor error', err);
        scheduleReconnect();
        return;
      }
      ws = sock;
      sock.addEventListener('open', () => {
        safeSendRaw({ t: 'hello', appId, roomId, password, self: selfId });
      });
      sock.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          handleMessage(event.data);
        } else if (event.data instanceof Blob) {
          // 后端目前只发文本帧；遇到 Blob 直接忽略
        }
      });
      sock.addEventListener('close', () => {
        if (ws === sock) ws = null;
        // 把所有在线 peer 视为掉线：触发 peer-leave，让上层 session 立刻
        // 把他们从成员列表清掉；重连成功后服务器 welcome 会重新发 peers 列表。
        const lostIds = Array.from(peers.keys());
        peers.clear();
        lostIds.forEach((id) => emitPeerLeave(id));
        if (!closed) scheduleReconnect();
      });
      sock.addEventListener('error', () => {
        // 让 close 事件统一处理重连，避免双重触发
      });
    }

    function send(name, data, to) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // 房间未连上时静默丢弃；与 transport.js 现有约定一致（join 后再发）
        return Promise.resolve([]);
      }
      const payload = { t: 'msg', ch: name, d: data };
      if (to != null) {
        payload.to = to;
      }
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        console.warn('[ws-fullrelay] send error', err);
      }
      return Promise.resolve([]);
    }

    function makeAction(name) {
      const ch = getChannel(name);
      return [
        (data, targetPeers) => send(name, data, targetPeers),
        (handler) => { ch.receive = handler; }
      ];
    }

    function onPeerJoin(fn) {
      peerJoinHandlers.add(fn);
      return () => peerJoinHandlers.delete(fn);
    }

    function onPeerLeave(fn) {
      peerLeaveHandlers.add(fn);
      return () => peerLeaveHandlers.delete(fn);
    }

    function getPeers() {
      const out = {};
      peers.forEach((v, k) => { out[k] = v; });
      return out;
    }

    function ping(peerId) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(-1);
      if (!peerId || !peers.has(peerId)) return Promise.resolve(-1);
      const id = pingSeq++;
      const t0 = Date.now();
      return new Promise((resolve) => {
        pendingPings.set(id, { resolve, t0 });
        // 2 秒未回视为超时
        setTimeout(() => {
          if (pendingPings.has(id)) {
            pendingPings.delete(id);
            resolve(-1);
          }
        }, 2000);
        try {
          ws.send(JSON.stringify({ t: 'ping', id, to: peerId }));
        } catch (err) {
          pendingPings.delete(id);
          resolve(-1);
        }
      });
    }

    async function leave() {
      closed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = 0; }
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ t: 'leave' })); } catch { /* noop */ }
        try { ws.close(1000, 'leave'); } catch { /* noop */ }
      }
      ws = null;
      // 清空状态
      peers.clear();
      pendingPings.forEach((p) => p.resolve(-1));
      pendingPings.clear();
    }

    connect();
    return {
      makeAction,
      onPeerJoin,
      onPeerLeave,
      getPeers,
      ping,
      leave
    };
  }

  game.netWsFullrelay = {
    joinRoom,
    prepareSelfId,
    get selfId() { return MODULE.selfId; }
  };
})(window.TidalIsle);
