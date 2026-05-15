/*
 * Client 模块（第 2 步：星型权威同步 - MVP）
 *
 * 在 session.role === 'client' 时启用：
 *   1) 等待房主 HELLO（带有 seed / day / time），用相同种子在本地重置世界。
 *      因为世界生成是基于 seed 的确定性算法，所以 client 不需要从 Host
 *      流式接收地形数据，只用相同种子就能拿到一致的地形与初始资源。
 *   2) 以固定频率把本地玩家位置 / 朝向 / 动画相位作为 INPUT 上行给 Host，
 *      Host 据此分发给所有 peer。
 *   3) 接收 SNAPSHOT：覆盖 day / time，并把其他玩家位置写进 state.players。
 *
 * 注意：world.js#update 会在 client 模式下跳过资源刷新 / 敌人 / 建筑结算
 * 这些"世界权威系统"，避免与 Host 状态漂移。
 */
(function (game) {
  const {
    state,
    dom,
    netTransport,
    NET_CHANNELS,
    NET_ROLES,
    netMakeInput,
    getComponent
  } = game;
  // netSession 加载顺序晚于本模块，按需通过 game.netSession 访问。

  const INPUT_INTERVAL = 1 / 15; // 15 Hz
  let inputAcc = 0;
  let inputSeq = 0;
  let active = false;
  let worldReady = false;

  function ensurePeerEntry(peerId, snapshotPeer) {
    if (!peerId || typeof peerId !== 'string') return null;
    let entry = state.players.get(peerId);
    if (!entry) {
      entry = {
        id: peerId,
        name: snapshotPeer?.name || `玩家-${peerId.slice(0, 4)}`,
        color: snapshotPeer?.color || '#9f927d',
        x: 0,
        y: 0,
        facing: 'down',
        isMoving: false,
        animationTime: 0,
        hp: -1,
        maxHp: -1,
        isLocal: false,
        lastUpdate: 0
      };
      state.players.set(peerId, entry);
    }
    return entry;
  }

  function applySnapshot(data) {
    if (!active || !data || typeof data !== 'object') return;
    if (typeof data.k === 'number' && data.k <= state.netTick) {
      // 旧帧（UDP 风格 DataChannel 可能乱序），直接丢弃
      return;
    }
    if (typeof data.k === 'number') state.netTick = data.k;
    if (typeof data.d === 'number') state.day = data.d;
    if (typeof data.t === 'number') state.time = data.t;

    const selfId = netTransport.getSelfId();
    const seen = new Set();
    if (Array.isArray(data.p)) {
      data.p.forEach((peer) => {
        if (!peer || !peer.i || typeof peer.i !== 'string' || peer.i === selfId) return;
        const entry = ensurePeerEntry(peer.i, { name: peer.n, color: peer.c });
        if (!entry) return;
        entry.name = peer.n || entry.name;
        entry.color = peer.c || entry.color;
        entry.x = peer.x;
        entry.y = peer.y;
        entry.facing = peer.f || entry.facing;
        entry.isMoving = peer.m === 1;
        entry.animationTime = peer.a || 0;
        if (typeof peer.h === 'number' && peer.h >= 0) entry.hp = peer.h;
        entry.lastUpdate = performance.now();
        seen.add(peer.i);
      });
    }
    // 清掉 Host 不再广播的 ghost（例如该玩家离线）
    Array.from(state.players.keys()).forEach((id) => {
      if (!seen.has(id) && id !== selfId) {
        state.players.delete(id);
      }
    });
  }

  function bootstrapWorldFromHello(data) {
    if (worldReady || !active) return;
    if (!data || typeof data.s !== 'number') return; // 还没拿到 host 元数据
    // 用 host 的种子重新生成世界
    game.newGame?.({ seed: data.s, day: data.d ?? 1, time: data.t ?? 0.35 });
    worldReady = true;
    // 自动进入游戏（client 不需要再点"开始"）
    state.running = true;
    state.over = false;
    if (dom?.startOverlay) dom.startOverlay.classList.remove('show');
    if (dom?.gameOverOverlay) dom.gameOverOverlay.classList.remove('show');
    game.showMessage?.('已同步房主世界，开始游戏', 2.4);
    game.updateUI?.();
  }

  function clientTick(dt) {
    if (!active || !worldReady) return;
    if (!state.running || state.over) return;
    inputAcc += dt;
    if (inputAcc < INPUT_INTERVAL) return;
    inputAcc = 0;

    const transform = getComponent(state.playerId, 'transform');
    const player = getComponent(state.playerId, 'player');
    const health = getComponent(state.playerId, 'health');
    if (!transform) return;

    inputSeq += 1;
    const payload = netMakeInput({
      seq: inputSeq,
      x: transform.x,
      y: transform.y,
      facing: player?.facing || 'down',
      isMoving: !!player?.isMoving,
      animationTime: player?.animationTime || 0,
      hp: health?.hp
    });
    netTransport.send(NET_CHANNELS.INPUT, payload);
  }

  // 在 transport 上挂"持久订阅"。session 的 HELLO 处理是另一套（写入
  // peers 列表）；这里专门拿 HELLO 的 seed 字段做世界 bootstrap。
  netTransport.subscribe(NET_CHANNELS.HELLO, (data) => {
    if (active && data && data.r === NET_ROLES.HOST) {
      bootstrapWorldFromHello(data);
    }
  });
  netTransport.subscribe(NET_CHANNELS.SNAPSHOT, (data) => {
    applySnapshot(data);
  });

  function startClient() {
    if (active) return;
    active = true;
    worldReady = false;
    inputAcc = 0;
    inputSeq = 0;
    state.netMode = 'client';
    state.netTick = 0;
    state.players.clear();
    // 暂停本地游戏直到拿到 host 的种子；此时画面会保留单机世界，但 update
    // 已经被外部条件 (!state.playerId) 之外的逻辑限制。为了避免在等待期间
    // 看到旧世界的资源被采集等异常情况，这里把 running 暂时关掉。
    state.running = false;
    if (dom?.startOverlay) dom.startOverlay.classList.add('show');
    game.showMessage?.('等待房主同步世界…', 3);
  }

  function stopClient() {
    if (!active) return;
    active = false;
    worldReady = false;
    inputAcc = 0;
    state.netMode = 'single';
    state.players.clear();
    state.netTick = 0;
  }

  Object.assign(game, {
    netClientStart: startClient,
    netClientStop: stopClient,
    netClientTick: clientTick
  });
})(window.TidalIsle);
