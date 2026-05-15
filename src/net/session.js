/*
 * 联机会话管理（第 1 步基建）
 *
 * 负责房间码生成、Host/Client 角色判定、玩家信息（昵称、颜色）维护、聊天
 * 历史，以及对 transport 事件的高层封装。后续 Host/Client 同步逻辑（host.js
 * / client.js）会读取 session.role 并接管输入与世界状态。
 *
 * 当前阶段仅提供：
 *   - hostRoom(name)
 *   - joinRoom(code, name)
 *   - leave()
 *   - sendChat(text)
 *   - on(event, handler)  // 'change' | 'chat'
 *
 * 房间码使用 6 位大写字母数字，便于口头分享。
 */
(function (game) {
  const {
    netTransport,
    NET_CHANNELS,
    NET_ROLES,
    netMakeHello,
    netMakePeerInfo,
    netMakeChat
  } = game;

  const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
  const CHAT_HISTORY_LIMIT = 80;
  const PEER_COLORS = [
    '#19c8b9', '#f5a623', '#e05a5a', '#6fba2c',
    '#a26cf2', '#3aa1ff', '#f06292', '#ffb74d'
  ];

  const session = {
    role: null,                    // 'host' | 'client' | null
    roomCode: null,
    localName: '',
    localColor: PEER_COLORS[0],
    // peerId -> { id, name, color, isLocal, joinedAt, latency }
    peers: new Map(),
    chatHistory: [],
    status: 'idle',                // 'idle' | 'connecting' | 'connected' | 'error'
    error: ''
  };

  const listeners = new Map(); // event -> Set<fn>

  function on(event, handler) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.warn('[net session] listener error', event, err);
      }
    });
  }

  function generateRoomCode(length = 6) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  function sanitizeRoomCode(input) {
    return String(input || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12);
  }

  function pickColor(seedString) {
    let hash = 0;
    for (let i = 0; i < seedString.length; i += 1) {
      hash = (hash * 31 + seedString.charCodeAt(i)) >>> 0;
    }
    return PEER_COLORS[hash % PEER_COLORS.length];
  }

  function pushChat(entry) {
    session.chatHistory.push(entry);
    if (session.chatHistory.length > CHAT_HISTORY_LIMIT) {
      session.chatHistory.splice(0, session.chatHistory.length - CHAT_HISTORY_LIMIT);
    }
    emit('chat', entry);
  }

  function setStatus(status, error = '') {
    session.status = status;
    session.error = error;
    emit('change', session);
  }

  function resetState() {
    session.role = null;
    session.roomCode = null;
    session.peers.clear();
    session.chatHistory.length = 0;
    session.status = 'idle';
    session.error = '';
  }

  function registerLocalPeer() {
    const selfId = netTransport.getSelfId();
    if (!selfId) return;
    session.peers.set(selfId, {
      id: selfId,
      name: session.localName || (session.role === NET_ROLES.HOST ? '房主' : '玩家'),
      color: session.localColor,
      isLocal: true,
      isHost: session.role === NET_ROLES.HOST,
      joinedAt: Date.now(),
      latency: 0
    });
  }

  function broadcastSelfInfo(target) {
    netTransport.send(NET_CHANNELS.PEER_INFO, netMakePeerInfo({
      name: session.localName,
      color: session.localColor
    }), target);
  }

  function sendHelloTo(peerId) {
    const payload = netMakeHello({
      name: session.localName,
      role: session.role,
      // 后续步骤会在 Host 处填入实际世界种子
      seed: session.role === NET_ROLES.HOST ? (game.state?.seed ?? null) : null,
      day: session.role === NET_ROLES.HOST ? (game.state?.day ?? null) : null,
      time: session.role === NET_ROLES.HOST ? (game.state?.time ?? null) : null
    });
    netTransport.send(NET_CHANNELS.HELLO, payload, peerId);
  }

  function bindChannels() {
    netTransport.subscribe(NET_CHANNELS.HELLO, (data, peerId) => {
      if (!data || typeof data !== 'object') return;
      const existing = session.peers.get(peerId) || {
        id: peerId,
        joinedAt: Date.now(),
        latency: 0,
        isLocal: false
      };
      existing.name = String(data.n || '').slice(0, 32) || existing.name || `玩家-${peerId.slice(0, 4)}`;
      existing.color = pickColor(peerId);
      existing.isHost = data.r === NET_ROLES.HOST;
      session.peers.set(peerId, existing);
      emit('change', session);
    });

    netTransport.subscribe(NET_CHANNELS.PEER_INFO, (data, peerId) => {
      if (!data || typeof data !== 'object') return;
      const existing = session.peers.get(peerId);
      if (!existing) return;
      if (typeof data.n === 'string' && data.n) existing.name = data.n.slice(0, 32);
      if (typeof data.c === 'string' && data.c) existing.color = data.c;
      emit('change', session);
    });

    netTransport.subscribe(NET_CHANNELS.CHAT, (data, peerId) => {
      if (!data || typeof data !== 'object' || !data.t) return;
      const peer = session.peers.get(peerId);
      pushChat({
        from: peerId,
        name: peer?.name || `玩家-${peerId.slice(0, 4)}`,
        color: peer?.color || '#9f927d',
        text: String(data.t).slice(0, 300),
        ts: typeof data.ts === 'number' ? data.ts : Date.now(),
        local: false
      });
    });
  }

  netTransport.onPeerJoin((peerId) => {
    const peer = {
      id: peerId,
      name: `玩家-${peerId.slice(0, 4)}`,
      color: pickColor(peerId),
      isLocal: false,
      isHost: false,
      joinedAt: Date.now(),
      latency: 0
    };
    session.peers.set(peerId, peer);
    // 互相打个招呼，让对方知道我们的名字 / 角色
    sendHelloTo(peerId);
    broadcastSelfInfo(peerId);
    pushChat({
      system: true,
      text: `${peer.name} 加入了房间`,
      ts: Date.now()
    });
    emit('change', session);
  });

  netTransport.onPeerLeave((peerId) => {
    const peer = session.peers.get(peerId);
    if (peer) {
      pushChat({
        system: true,
        text: `${peer.name} 离开了房间`,
        ts: Date.now()
      });
    }
    session.peers.delete(peerId);
    emit('change', session);
  });

  bindChannels();

  async function hostRoom({ name } = {}) {
    if (session.status === 'connecting' || session.status === 'connected') {
      throw new Error('已在房间中');
    }
    resetState();
    session.role = NET_ROLES.HOST;
    session.localName = String(name || '').trim().slice(0, 32) || '房主';
    const code = generateRoomCode();
    session.roomCode = code;
    session.localColor = pickColor('host-' + code);
    setStatus('connecting');
    try {
      await netTransport.join(code);
      registerLocalPeer();
      setStatus('connected');
      // 启动 host 同步循环（broadcast SNAPSHOT、接收 INPUT）
      game.netHostStart?.();
      pushChat({ system: true, text: `房间已创建：${code}（分享给好友以加入）`, ts: Date.now() });
      return code;
    } catch (err) {
      setStatus('error', err?.message || String(err));
      throw err;
    }
  }

  async function joinRoom({ code, name } = {}) {
    if (session.status === 'connecting' || session.status === 'connected') {
      throw new Error('已在房间中');
    }
    const sanitized = sanitizeRoomCode(code);
    if (!sanitized) {
      throw new Error('请输入有效的房间码');
    }
    resetState();
    session.role = NET_ROLES.CLIENT;
    session.localName = String(name || '').trim().slice(0, 32) || '玩家';
    session.roomCode = sanitized;
    session.localColor = pickColor('client-' + sanitized + '-' + Math.random());
    setStatus('connecting');
    try {
      await netTransport.join(sanitized);
      registerLocalPeer();
      setStatus('connected');
      // 启动 client：等 HELLO 中的 seed 到达后 bootstrap 世界
      game.netClientStart?.();
      pushChat({ system: true, text: `已加入房间：${sanitized}`, ts: Date.now() });
      return sanitized;
    } catch (err) {
      setStatus('error', err?.message || String(err));
      throw err;
    }
  }

  async function leave() {
    if (session.status === 'idle') return;
    // 先停掉 host/client 同步，再断开 transport，避免在 leave 过程中还在广播
    game.netHostStop?.();
    game.netClientStop?.();
    await netTransport.leave();
    pushChat({ system: true, text: '你已离开房间', ts: Date.now() });
    resetState();
    emit('change', session);
  }

  function sendChat(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (session.status !== 'connected') return;
    const payload = netMakeChat(trimmed);
    netTransport.send(NET_CHANNELS.CHAT, payload);
    pushChat({
      from: netTransport.getSelfId(),
      name: session.localName || '我',
      color: session.localColor,
      text: payload.t,
      ts: payload.ts,
      local: true
    });
  }

  function setLocalName(name) {
    const trimmed = String(name || '').trim().slice(0, 32);
    if (!trimmed || trimmed === session.localName) return;
    session.localName = trimmed;
    const selfId = netTransport.getSelfId();
    if (selfId) {
      const localPeer = session.peers.get(selfId);
      if (localPeer) localPeer.name = trimmed;
    }
    if (session.status === 'connected') {
      broadcastSelfInfo();
    }
    emit('change', session);
  }

  async function refreshLatencies() {
    if (session.status !== 'connected') return;
    const ids = netTransport.getPeers();
    await Promise.all(ids.map(async (id) => {
      const latency = await netTransport.ping(id);
      const peer = session.peers.get(id);
      if (peer && latency >= 0) {
        peer.latency = Math.round(latency);
      }
    }));
    emit('change', session);
  }

  game.netSession = {
    state: session,
    on,
    hostRoom,
    joinRoom,
    leave,
    sendChat,
    setLocalName,
    refreshLatencies,
    isConnected: () => session.status === 'connected',
    isHost: () => session.role === NET_ROLES.HOST
  };
})(window.TidalIsle);
