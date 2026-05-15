/*
 * Client 模块（第 2~3 步：星型权威同步）
 *
 * 在 session.role === 'client' 时启用：
 *   1) 等待房主 HELLO（带有 seed / day / time），用相同种子在本地重置世界。
 *      因为世界生成是基于 seed 的确定性算法，所以 client 不需要从 Host
 *      流式接收地形数据，只用相同种子就能拿到一致的地形与初始资源。
 *   2) 以固定频率把本地玩家位置 / 朝向 / 动画相位作为 INPUT 上行给 Host，
 *      Host 据此分发给所有 peer。
 *   3) 接收 SNAPSHOT：覆盖 day / time，并把其他玩家位置写进 state.players。
 *   4) 接收 ENTITY_DELTA：把 host 端资源 / 敌人状态打到本地实体上（资源
 *      hp/alive/respawn、敌人位置/hp、销毁事件、动态敌人首次创建）。
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
    getComponent,
    getResourceIds,
    getEnemyIds
  } = game;
  // netSession 加载顺序晚于本模块，按需通过 game.netSession 访问。

  const INPUT_INTERVAL = 1 / 15; // 15 Hz
  let inputAcc = 0;
  let inputSeq = 0;
  let active = false;
  let worldReady = false;

  // 客户端的 netId -> 本地 entityId 映射。host 端用确定性 netId
  // (`r:chunkKey:slot`、`e:chunkKey:slot`) 标识所有 chunk-bound 实体，
  // 这些 entity 在 client 端由同种子的 chunk hydration 创建，可按
  // chunkKey+slot 在本地反查；host 端动态生成的实体 (`e:d:<id>`) 则
  // 由 client 在第一次看到时本地创建。
  const remoteResourceMap = new Map();   // netId -> entityId
  const remoteEnemyMap = new Map();      // netId -> entityId

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

  // -------- ENTITY_DELTA 应用 --------

  // 在本地实体中按 (chunkKey, slot) 查找 — 由同种子生成的 chunk-bound 实体
  // 一定有相同的 chunkKey + slotIndex。
  function findLocalResourceByChunkSlot(chunkKey, slotIndex) {
    for (const entityId of getResourceIds()) {
      const node = getComponent(entityId, 'resourceNode');
      if (node && node.chunkKey === chunkKey && node.slotIndex === slotIndex) {
        return entityId;
      }
    }
    return null;
  }

  function findLocalEnemyByChunkSlot(chunkKey, slotIndex) {
    for (const entityId of getEnemyIds()) {
      const enemy = getComponent(entityId, 'enemy');
      if (enemy && enemy.fromChunk && enemy.chunkKey === chunkKey && enemy.slotIndex === slotIndex) {
        return entityId;
      }
    }
    return null;
  }

  function applyResourceUpdate(res) {
    if (!res || !res.d) return;
    let entityId = remoteResourceMap.get(res.d);
    if (!entityId) {
      entityId = findLocalResourceByChunkSlot(res.ck, res.s);
      if (!entityId) {
        // chunk 还没在 client 加载，先记账，等到 chunk hydrate 再补 —— MVP 简化：忽略。
        return;
      }
      remoteResourceMap.set(res.d, entityId);
    }
    const node = getComponent(entityId, 'resourceNode');
    const health = getComponent(entityId, 'health');
    if (!node || !health) return;
    node.alive = res.a === 1;
    node.respawnTimer = res.rt || 0;
    health.hp = res.h;
    if (res.mh > 0) health.maxHp = res.mh;
  }

  function applyEnemyUpdate(en) {
    if (!en || !en.d) return;
    let entityId = remoteEnemyMap.get(en.d);
    if (!entityId) {
      // 先尝试用 chunk slot 配对（chunk-bound 敌人）
      if (en.ck && typeof en.s === 'number' && en.s >= 0) {
        entityId = findLocalEnemyByChunkSlot(en.ck, en.s);
      }
      // 还没有本地实体 → 创建一个（动态敌人或 chunk 尚未加载的兜底）
      if (!entityId && typeof game.createEnemyEntity === 'function') {
        // 传 slotIndex:-1 是个小技巧：creators.js 在 isInteger(slotIndex) 时
        // 不会调用 registerChunkEnemyEntity，这样我们不会污染 chunk 的 enemies
        // 数组；同时 fromChunk = (-1 >= 0) = false 也是我们想要的。
        entityId = game.createEnemyEntity(en.k, en.x, en.y, {
          hp: en.h,
          slotIndex: -1
        });
        if (entityId) {
          const enemy = getComponent(entityId, 'enemy');
          if (enemy) {
            enemy.chunkKey = null;
            enemy.fromChunk = false;
          }
        }
      }
      if (!entityId) return;
      remoteEnemyMap.set(en.d, entityId);
    }
    const transform = getComponent(entityId, 'transform');
    const health = getComponent(entityId, 'health');
    if (transform) {
      transform.x = en.x;
      transform.y = en.y;
    }
    if (health) {
      health.hp = en.h;
      if (en.mh > 0) health.maxHp = en.mh;
    }
  }

  function removeRemoteEnemy(netId) {
    const entityId = remoteEnemyMap.get(netId);
    if (!entityId) return;
    remoteEnemyMap.delete(netId);
    try {
      game.removeChunkEnemyEntity?.(entityId);
    } catch (err) {
      console.warn('[net/client] removeChunkEnemyEntity failed', netId, err);
    }
    try {
      game.destroyEntity?.(entityId);
    } catch (err) {
      console.warn('[net/client] destroyEntity failed', netId, err);
    }
  }

  function applyEntityDelta(data) {
    if (!active || !worldReady || !data || typeof data !== 'object') return;
    if (Array.isArray(data.r)) data.r.forEach(applyResourceUpdate);
    if (Array.isArray(data.e)) data.e.forEach(applyEnemyUpdate);
    if (Array.isArray(data.eR)) data.eR.forEach(removeRemoteEnemy);
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
  netTransport.subscribe(NET_CHANNELS.ENTITY_DELTA, (data) => {
    applyEntityDelta(data);
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
    remoteResourceMap.clear();
    remoteEnemyMap.clear();
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
    remoteResourceMap.clear();
    remoteEnemyMap.clear();
    state.netTick = 0;
  }

  Object.assign(game, {
    netClientStart: startClient,
    netClientStop: stopClient,
    netClientTick: clientTick
  });
})(window.TidalIsle);
