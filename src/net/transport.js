/*
 * Trystero 传输层封装（第 1 步基建）
 *
 * 不自建后端：使用 Trystero 的 torrent strategy（公共 BitTorrent tracker
 * 作为 WebRTC 信令通道）。在 Trystero v0.24 起，torrent strategy 已从主包
 * `trystero/torrent` 拆出到独立子包 `@trystero-p2p/torrent`，原路径会抛
 * "Importing from \"trystero/torrent\" is deprecated" 的错误，因此这里直接
 * 动态 import 新包。如未来需要切换 strategy（nostr / mqtt），只需替换
 * 动态 import 的包名（`@trystero-p2p/nostr`、`@trystero-p2p/mqtt` 等）。
 *
 * 对外暴露的 transport 对象：
 *   - join(roomId, opts): 进入房间，返回 Promise<{ selfId }>
 *   - leave(): 离开房间
 *   - getPeers(): 当前 peer id 列表
 *   - onPeerJoin(fn) / onPeerLeave(fn): 订阅成员事件
 *   - send(channel, data, targetPeers?): 发送消息（targetPeers 可省略以广播）
 *   - subscribe(channel, handler): 订阅指定 channel 上的消息
 *   - ping(peerId): 测延迟（毫秒）
 *
 * 单机模式下不会触发动态 import，因此不影响游戏初始包体。
 */
(function (game) {
  const APP_ID = 'tidal-isle-ccgame';

  // 公共 STUN，符合"不单独架服务器"约束；玩家可在 UI 中追加自带 TURN
  const DEFAULT_STUN = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  let trysteroJoinRoom = null;
  let trysteroSelfId = null;
  let room = null;
  let selfId = null;
  let currentRoomId = null;

  // channel name -> { send, subscribe, handlers: Set }
  const channels = new Map();
  const peerJoinHandlers = new Set();
  const peerLeaveHandlers = new Set();
  // 单独的 selfId，因为 Trystero 的 selfId 在 v0.24 中通过 room 拿不到，
  // 我们用 makeAction 的回调 peerId 列表反推（自身不会出现在 peer 列表里）。
  // 这里维护一个本地的 selfId（任意唯一字符串），仅用于 UI 展示
  // —— 真正的 peerId 由 Trystero 内部生成并通过回调暴露给其他人。

  async function ensureTrystero() {
    // 通过 server-config 加载激活的 trystero 策略包；用户可在联机设置里
    // 切换到自定义的 ws-relay 中转服务器，这里会自动改用对应的 joinRoom。
    const cfgModule = game.netServerConfig;
    if (cfgModule) {
      const active = await cfgModule.loadTrysteroStrategy();
      trysteroJoinRoom = active.joinRoom;
      trysteroSelfId = active.selfId || null;
      return trysteroJoinRoom;
    }
    if (trysteroJoinRoom) return trysteroJoinRoom;
    // 兜底路径（理论上 server-config 一定先加载）：保持原行为，使用 BitTorrent
    // strategy（torrent 已迁移到 @trystero-p2p/torrent）。
    const mod = await import('@trystero-p2p/torrent');
    trysteroJoinRoom = mod.joinRoom;
    trysteroSelfId = mod.selfId || null;
    return trysteroJoinRoom;
  }

  function getOrCreateChannel(name) {
    let ch = channels.get(name);
    if (ch) return ch;
    if (!room) {
      // 占位：在加入房间前订阅，加入后会重新绑定到实际的 makeAction
      ch = { send: null, handlers: new Set() };
      channels.set(name, ch);
      return ch;
    }
    const [send, receive] = room.makeAction(name);
    ch = { send, handlers: new Set() };
    receive((data, peerId, metadata) => {
      ch.handlers.forEach((fn) => {
        try {
          fn(data, peerId, metadata);
        } catch (err) {
          console.warn('[net] handler error on', name, err);
        }
      });
    });
    channels.set(name, ch);
    return ch;
  }

  function rebindAllChannels() {
    // 在 join 之后把所有"预注册"的 channel 真正绑定到 room.makeAction
    channels.forEach((ch, name) => {
      if (ch.send) return;
      const [send, receive] = room.makeAction(name);
      ch.send = send;
      receive((data, peerId, metadata) => {
        ch.handlers.forEach((fn) => {
          try {
            fn(data, peerId, metadata);
          } catch (err) {
            console.warn('[net] handler error on', name, err);
          }
        });
      });
    });
  }

  async function join(roomId, opts = {}) {
    if (room) {
      throw new Error('已在房间中，请先离开当前房间');
    }
    const joinRoom = await ensureTrystero();
    const config = {
      appId: APP_ID,
      rtcConfig: {
        iceServers: [
          ...DEFAULT_STUN,
          ...(Array.isArray(opts.turnConfig) ? opts.turnConfig : [])
        ]
      }
    };
    if (opts.password) {
      config.password = String(opts.password);
    }
    // 注入自定义中转服务器（ws-relay strategy 需要 relayConfig.urls）
    game.netServerConfig?.applyStrategyConfig?.(config);
    room = joinRoom(config, roomId);
    currentRoomId = roomId;
    // 使用 Trystero 真实的 selfId 作为本机 peer 标识；这是 Trystero 在
    // 各 channel 的 receive 回调中提供给对端的 ID，也是 SNAPSHOT 等消息里
    // 需要匹配的 ID。若退而使用本地随机串，客户端会无法识别自己回传的
    // 条目，导致 ghost 重叠（"拖影"bug）。
    selfId = trysteroSelfId || ('self-' + Math.random().toString(36).slice(2, 8));

    room.onPeerJoin((peerId) => {
      peerJoinHandlers.forEach((fn) => {
        try { fn(peerId); } catch (err) { console.warn('[net] peer join handler error', err); }
      });
    });
    room.onPeerLeave((peerId) => {
      peerLeaveHandlers.forEach((fn) => {
        try { fn(peerId); } catch (err) { console.warn('[net] peer leave handler error', err); }
      });
    });

    rebindAllChannels();
    return { selfId, roomId };
  }

  async function leave() {
    if (!room) return;
    try {
      await room.leave();
    } catch (err) {
      console.warn('[net] leave error', err);
    }
    room = null;
    currentRoomId = null;
    selfId = null;
    // 保留 handlers / channel 名注册，便于下次 join 时复用，但清掉 send
    channels.forEach((ch) => {
      ch.send = null;
    });
  }

  function getPeers() {
    if (!room) return [];
    return Object.keys(room.getPeers());
  }

  function getSelfId() {
    return selfId;
  }

  function getRoomId() {
    return currentRoomId;
  }

  function isConnected() {
    return room !== null;
  }

  function onPeerJoin(fn) {
    peerJoinHandlers.add(fn);
    return () => peerJoinHandlers.delete(fn);
  }

  function onPeerLeave(fn) {
    peerLeaveHandlers.add(fn);
    return () => peerLeaveHandlers.delete(fn);
  }

  function send(channel, data, targetPeers) {
    const ch = getOrCreateChannel(channel);
    if (!ch.send) {
      // 房间未连上时静默丢弃；调用方应在 join 之后再发送
      return Promise.resolve([]);
    }
    return ch.send(data, targetPeers);
  }

  function subscribe(channel, handler) {
    const ch = getOrCreateChannel(channel);
    ch.handlers.add(handler);
    return () => ch.handlers.delete(handler);
  }

  async function ping(peerId) {
    if (!room) return -1;
    try {
      return await room.ping(peerId);
    } catch {
      return -1;
    }
  }

  game.netTransport = {
    APP_ID,
    join,
    leave,
    getPeers,
    getSelfId,
    getRoomId,
    isConnected,
    onPeerJoin,
    onPeerLeave,
    send,
    subscribe,
    ping
  };
})(window.TidalIsle);
