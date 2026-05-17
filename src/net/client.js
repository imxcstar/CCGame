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
    netMakeActionReq,
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

  // 输入预测 / 对账：保存最近 ~1.5s 的本地 input 历史，便于在收到 SNAPSHOT
  // 中带回的 ack 序号时丢弃已确认的项，并在 host 报告的位置与历史不匹配
  // 时执行 snap & replay。MVP 阶段 host 仍直接信任 client 上报的位置（即
  // host 端没有真正的物理对账），所以正常情况下 history[i].x/y 会与 host
  // 回传一致，不触发 reconcile。这套结构主要是为后续接入 host 端物理仿真
  // 做铺垫。
  const inputHistory = []; // [{ seq, x, y, ts }]
  const INPUT_HISTORY_MAX = 30; // 30 帧 ≈ 2s @ 15Hz
  // 漂移阈值：低于此值视为正常浮点抖动，不 snap。
  const RECONCILE_THRESHOLD = 12;

  // 客户端的 netId -> 本地 entityId 映射。host 端用确定性 netId
  // (`r:chunkKey:slot`、`e:chunkKey:slot`) 标识所有 chunk-bound 实体，
  // 这些 entity 在 client 端由同种子的 chunk hydration 创建，可按
  // chunkKey+slot 在本地反查；host 端动态生成的实体 (`e:d:<id>`) 则
  // 由 client 在第一次看到时本地创建。
  const remoteResourceMap = new Map();   // netId -> entityId
  const remoteEnemyMap = new Map();      // netId -> entityId
  const remoteStructureMap = new Map();  // netId -> entityId（host 广播过的建筑）

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
        if (!peer || !peer.i || typeof peer.i !== 'string') return;
        if (peer.i === selfId) {
          // host 回送的本地玩家权威位置 + ack 序号；做输入预测对账
          reconcileLocalPlayer(peer);
          seen.add(peer.i);
          return;
        }
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

  // 输入预测 / reconciliation：根据 host 回传的 ackSeq (peer.q) 与权威坐标
  // (peer.x/peer.y) 修正本地玩家位置。
  function reconcileLocalPlayer(peer) {
    if (!peer || typeof peer.q !== 'number') return;
    const ack = peer.q | 0;
    if (ack <= 0) return;
    // 找到本地历史中与 ack 对应的快照
    let matchIdx = -1;
    for (let i = 0; i < inputHistory.length; i += 1) {
      if (inputHistory[i].seq === ack) { matchIdx = i; break; }
      if (inputHistory[i].seq > ack) break;
    }
    // 裁掉所有 <= ack 的项（一次性 splice 比循环 shift 更高效）
    let dropCount = 0;
    while (dropCount < inputHistory.length && inputHistory[dropCount].seq <= ack) dropCount += 1;
    if (dropCount > 0) inputHistory.splice(0, dropCount);
    if (matchIdx < 0) return;
    // 比对历史位置与 host 报告位置
    const transform = getComponent(state.playerId, 'transform');
    if (!transform) return;
    const drift = Math.hypot(peer.x - transform.x, peer.y - transform.y);
    if (drift < RECONCILE_THRESHOLD) return;
    // 漂移过大：snap 到 host 位置，剩余未 ack 的输入由本地 player update 自然续推。
    // （注意：未来 host 引入物理对账后，应在此处把 transform 重置为 host 位置，
    //  然后按 inputHistory 中残留的项再次本地模拟以保持手感。MVP 直接 snap。）
    transform.x = peer.x;
    transform.y = peer.y;
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

  // 应用 host 广播的建筑状态。第一次见到 netId 时本地建出一个 ghost 实体，
  // 此后只更新 hp / 类型特有状态。坐标在创建后不再变（建筑不会移动）。
  function applyStructureUpdate(st) {
    if (!st || !st.d || !st.k) return;
    let entityId = remoteStructureMap.get(st.d);
    // 防御：本地 structure runtime 在 hp<=0 时会自行 destroyEntity（与 host 几乎
    // 同时触发），可能让 map 里残留指向已销毁实体的 id。若取到的 entityId 已
    // 没有 structure 组件，把它当作不存在重新创建。
    if (entityId && !getComponent(entityId, 'structure')) {
      remoteStructureMap.delete(st.d);
      entityId = null;
    }
    if (!entityId) {
      if (typeof game.createStructureEntity !== 'function') return;
      // slotIndex:-1 走和 enemy 一样的小技巧：creators.js 在 isInteger(slotIndex)
      // 时不会调 registerChunkStructureEntity；且 fromChunk = false。本地建出的
      // 是个"由 host 控制的 ghost"，不入 chunk 持久化。
      entityId = game.createStructureEntity(st.k, st.x, st.y, {
        hp: st.h,
        slotIndex: -1,
        state: st.st || {}
      });
      if (!entityId) return;
      const structure = getComponent(entityId, 'structure');
      if (structure) {
        structure.chunkKey = null;
        structure.fromChunk = false;
      }
      remoteStructureMap.set(st.d, entityId);
    }
    const transform = getComponent(entityId, 'transform');
    const health = getComponent(entityId, 'health');
    const structure = getComponent(entityId, 'structure');
    if (transform) {
      // 通常不变；防御性地纠正一次，处理 host 发来的位置修正
      transform.x = st.x;
      transform.y = st.y;
    }
    if (health) {
      health.hp = st.h;
      if (st.mh > 0) health.maxHp = st.mh;
    }
    if (structure && st.st && typeof st.st === 'object') {
      for (const [key, value] of Object.entries(st.st)) {
        structure[key] = value;
      }
    }
  }

  function removeRemoteStructure(netId) {
    const entityId = remoteStructureMap.get(netId);
    if (!entityId) return;
    remoteStructureMap.delete(netId);
    try {
      game.removeChunkStructureEntity?.(entityId);
    } catch (err) {
      console.warn('[net/client] removeChunkStructureEntity failed', netId, err);
    }
    try {
      game.destroyEntity?.(entityId);
    } catch (err) {
      console.warn('[net/client] destroyEntity (structure) failed', netId, err);
    }
  }

  function applyEntityDelta(data) {
    if (!active || !worldReady || !data || typeof data !== 'object') return;
    if (Array.isArray(data.r)) data.r.forEach(applyResourceUpdate);
    if (Array.isArray(data.e)) data.e.forEach(applyEnemyUpdate);
    if (Array.isArray(data.eR)) data.eR.forEach(removeRemoteEnemy);
    if (Array.isArray(data.s)) data.s.forEach(applyStructureUpdate);
    if (Array.isArray(data.sR)) data.sR.forEach(removeRemoteStructure);
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
    // 记入本地历史，便于 reconcile
    inputHistory.push({ seq: inputSeq, x: transform.x, y: transform.y, ts: performance.now() });
    while (inputHistory.length > INPUT_HISTORY_MAX) inputHistory.shift();
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

  // ---------------- ACTION_REQ / INVENTORY ----------------

  // 给一个本地 entityId 反推它的 netId。规则与 host 端的 resourceNetId /
  // enemyNetId 对称：chunk-bound 用 chunkKey:slot；动态敌人用反查 remoteEnemyMap。
  function localResourceNetId(entityId) {
    const node = getComponent(entityId, 'resourceNode');
    if (!node?.chunkKey || node.slotIndex < 0) return null;
    return `r:${node.chunkKey}:${node.slotIndex}`;
  }

  function localEnemyNetId(entityId) {
    const enemy = getComponent(entityId, 'enemy');
    if (!enemy) return null;
    if (enemy.fromChunk && enemy.chunkKey && enemy.slotIndex >= 0) {
      return `e:${enemy.chunkKey}:${enemy.slotIndex}`;
    }
    // 动态敌人：反查 remoteEnemyMap
    for (const [netId, localId] of remoteEnemyMap) {
      if (localId === entityId) return netId;
    }
    return null;
  }

  // 结构 netId 反推。chunk-bound 用 chunkKey:slot；host 动态创建后下发到本地的
  // 结构走 remoteStructureMap。
  function localStructureNetId(entityId) {
    const structure = getComponent(entityId, 'structure');
    if (!structure) return null;
    if (structure.fromChunk && structure.chunkKey && structure.slotIndex >= 0) {
      return `s:${structure.chunkKey}:${structure.slotIndex}`;
    }
    for (const [netId, localId] of remoteStructureMap) {
      if (localId === entityId) return netId;
    }
    return null;
  }

  // 把本地 attack 目标 + 工具发给 host。返回 true 表示已派发。
  function requestPrimaryAttack() {
    if (!active || !worldReady) return false;
    const getAttackTarget = game.getAttackTarget;
    const getActiveToolKey = game.getActiveToolKey;
    if (typeof getAttackTarget !== 'function') return false;

    const target = getAttackTarget();
    if (!target) return false;

    const netId = target.group === 'resource'
      ? localResourceNetId(target.id)
      : localEnemyNetId(target.id);
    if (!netId) return false;

    const transform = getComponent(state.playerId, 'transform');
    const payload = netMakeActionReq({
      action: 'attack',
      target: netId,
      tool: typeof getActiveToolKey === 'function' ? (getActiveToolKey() || '') : '',
      x: transform?.x || 0,
      y: transform?.y || 0
    });
    netTransport.send(NET_CHANNELS.ACTION_REQ, payload);
    // 客户端不做 reconcile：状态变化会经由 ENTITY_DELTA 回来。这里仅给一点
    // 命中反馈让玩家看到自己确实出手了（与 host 端 burst 是双端各画一次）。
    if (transform && typeof game.burst === 'function') {
      game.burst(transform.x, transform.y, 'rgba(230,245,255,0.8)', 3, 30);
    }
    return true;
  }

  // 把客户端的建造请求发给 host：host 在校验通过后会创建实体并通过下一个
  // ENTITY_DELTA 的 `s` 字段同步给所有人（包括本 client）。校验失败时 host
  // 会回发 INVENTORY 退款。注意 inventory 扣除在 building.js 中已经本地完成，
  // 这里只负责派发请求。
  function requestPlaceStructure(itemKey, kind, x, y) {
    if (!active || !worldReady) return false;
    if (!itemKey || !kind) return false;
    const payload = netMakeActionReq({
      action: 'build',
      target: itemKey,
      kind,
      x,
      y
    });
    netTransport.send(NET_CHANNELS.ACTION_REQ, payload);
    return true;
  }

  // 把对结构的交互请求发给 host。client 已在本地完成消耗品扣除 / 视觉反馈，
  // 这里只负责派发；host 在校验失败时会通过 INVENTORY 回退已扣物品。
  //   action: 'interact' | 'refuel' | 'drink' | 'cook' | 'repair' |
  //           'dismantle' | 'harvestPlanter'
  //   structureId: 本地 entityId（自动反推 netId）
  //   options.kind: 用于扩展 'interact' / 'refuel' / 'drink' 等子动作的附加信息
  //                 - interact 时填 structure.kind（plant 走 'planter' 时填 'plant'）
  //                 - refuel/drink 时 'all' 表示填满 / 畅饮
  //   options.tool: 用于 cook 时携带"client 实际扣除的食材 JSON"（{ key: count }），
  //                 或 repair 时携带 cost JSON
  function requestStructureAction(action, structureId, options = {}) {
    if (!active || !worldReady) return false;
    if (!action || !structureId) return false;
    const netId = localStructureNetId(structureId);
    if (!netId) return false;
    const transform = getComponent(state.playerId, 'transform');
    const payload = netMakeActionReq({
      action,
      target: netId,
      tool: options.tool || '',
      kind: options.kind || '',
      x: transform?.x || 0,
      y: transform?.y || 0
    });
    netTransport.send(NET_CHANNELS.ACTION_REQ, payload);
    return true;
  }

  // 钓鱼收线：把 (tile, x, y) 上报给 host，host 校验后通过 INVENTORY 下发战利品。
  function requestFishReel(tile, x, y) {
    if (!active || !worldReady) return false;
    if (!tile) return false;
    const payload = netMakeActionReq({
      action: 'fishReel',
      target: '',
      kind: tile,
      x,
      y
    });
    netTransport.send(NET_CHANNELS.ACTION_REQ, payload);
    return true;
  }

  function applyInventoryUpdate(data) {
    if (!active || !worldReady || !data || typeof data !== 'object') return;
    const items = data.it;
    if (!items || typeof items !== 'object') return;
    if (typeof game.addInventory !== 'function') return;
    const result = game.addInventory(items);
    // 弹一条简短提示，复用 host harvest/kill 的视觉反馈。
    const RESOURCE_NAMES = game.RESOURCE_NAMES || {};
    const text = Object.entries(result?.added || {})
      .map(([key, value]) => '+' + value + ' ' + (RESOURCE_NAMES[key] || key))
      .join(' ');
    if (text) game.showMessage?.(text);
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
  netTransport.subscribe(NET_CHANNELS.INVENTORY, (data) => {
    applyInventoryUpdate(data);
  });

  // 被房主踢出：尽快 leave 房间并提示玩家。
  netTransport.subscribe(NET_CHANNELS.KICK, (data) => {
    if (!active) return;
    const reason = (data && typeof data.r === 'string' && data.r) || '被房主移出房间';
    game.showMessage?.('已被踢出：' + reason, 3.2);
    // 不直接调 leave；交给 session 层执行，保证 UI 状态同步
    if (game.netSession?.leave) {
      Promise.resolve().then(() => game.netSession.leave()).catch(() => { /* ignore */ });
    }
  });

  // 房主转让：所有 peer 都会收到。被指定为新房主的 peer 切到 host 角色，
  // 其他 peer 继续作为 client，但要更新自己的 session.peers 中谁是 host。
  netTransport.subscribe(NET_CHANNELS.HOST_TRANSFER, (data, peerId) => {
    if (!active || !data || typeof data !== 'object') return;
    const newHostId = data.p;
    if (!newHostId) return;
    const selfId = netTransport.getSelfId();
    if (newHostId === selfId) {
      // 自己被升格为新房主：保留本地世界（已经与原 host 同步），停掉 client，
      // 启动 host 循环。session 层会负责更新 UI 与发出 HELLO。
      game.netSession?.acceptHostPromotion?.({
        fromPeerId: peerId,
        seed: data.s,
        day: data.d,
        time: data.t,
        voluntary: data.v === 1
      });
    } else {
      // 其他 peer：更新 session 里谁是 host
      game.netSession?.notePeerIsHost?.(newHostId);
    }
  });

  function startClient() {
    if (active) return;
    active = true;
    worldReady = false;
    inputAcc = 0;
    inputSeq = 0;
    inputHistory.length = 0;
    state.netMode = 'client';
    state.netTick = 0;
    state.players.clear();
    remoteResourceMap.clear();
    remoteEnemyMap.clear();
    remoteStructureMap.clear();
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
    inputHistory.length = 0;
    state.netMode = 'single';
    state.players.clear();
    remoteResourceMap.clear();
    remoteEnemyMap.clear();
    remoteStructureMap.clear();
    state.netTick = 0;
  }

  // 当本机被升格为新房主时：保留当前世界状态（已通过 SNAPSHOT/ENTITY_DELTA
  // 与原 host 同步），把本地映射表里的 chunk-bound 实体重新登记为"自己"
  // 拥有的实体。MVP 阶段直接复用 client 端已经建出来的本地实体，只是不再
  // 接收 SNAPSHOT/ENTITY_DELTA 而是自己发。
  function detachClientForPromotion() {
    if (!active) return;
    active = false;
    worldReady = false;
    inputAcc = 0;
    inputHistory.length = 0;
    // 注意：不 clear remoteXxxMap、不 clear state.players，因为新 host 接管时
    // 还要看到当前世界上的远端 ghost 玩家。
    state.netTick = 0;
  }

  Object.assign(game, {
    netClientStart: startClient,
    netClientStop: stopClient,
    netClientTick: clientTick,
    netClientRequestAttack: requestPrimaryAttack,
    netClientRequestPlaceStructure: requestPlaceStructure,
    netClientRequestStructureAction: requestStructureAction,
    netClientRequestFishReel: requestFishReel,
    netClientDetachForPromotion: detachClientForPromotion
  });
})(window.TidalIsle);
