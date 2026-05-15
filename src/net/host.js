/*
 * Host 模块（第 2~3 步：星型权威同步）
 *
 * Host 在房主本机维持完整的单机权威世界（资源刷新、敌人 AI、昼夜推进、
 * 建筑结算等仍按原逻辑跑），并通过 WebRTC DataChannel：
 *   - 接收 INPUT：客户端上报的位置 / 朝向 / 动画相位，作为远端 ghost 缓存
 *   - 广播 SNAPSHOT：~15 Hz 推送当前 day / time + 所有玩家位置
 *   - 广播 ENTITY_DELTA：~6 Hz 推送资源 (hp/alive/respawn)、敌人 (位置/hp)
 *     与"被销毁敌人"列表，让 client 看到 host 对世界的修改
 *
 * 房间内有任意新成员加入时立刻发一份"补帧 SNAPSHOT + 全量 ENTITY_DELTA"，
 * 让新玩家尽快看到房主目前所处的时间 / 玩家分布 / 已被修改的资源 / 当前
 * 仍活着的敌人。
 *
 * 仍未做（下一轮）：
 *   - ACTION_REQ / ACTION_ACK：client 端的采集 / 战斗 / 建造仍只在本地生效
 *   - INVENTORY_UPDATE：背包定向同步
 *   - 输入预测 + reconciliation
 */
(function (game) {
  const {
    state,
    netTransport,
    NET_CHANNELS,
    NET_ROLES,
    ATTACK_RANGE,
    netMakeSnapshot,
    netMakeEntityDelta,
    netMakeInventoryUpdate,
    getComponent,
    getResourceIds,
    getEnemyIds,
    getStructureIds,
    getEntityConfig,
    getEnemyConfig,
    getResourceDamage,
    getEnemyDamage,
    rollLoot,
    rollEnemyMeat,
    dist,
    burst,
    destroyEntity,
    removeChunkEnemyEntity,
    randomBetween
  } = game;
  // 注意：netSession 在 session.js 中创建，加载顺序晚于本模块；运行期通过
  // game.netSession 懒读取，避免 TDZ。

  const SNAPSHOT_INTERVAL = 1 / 15; // 15 Hz
  const ENTITY_DELTA_INTERVAL = 1 / 6; // 6 Hz：覆盖敌人位置同步，又足够省带宽
  let snapshotAcc = 0;
  let entityDeltaAcc = 0;
  let active = false;

  function ensurePeerEntry(peerId) {
    if (!peerId || typeof peerId !== 'string') return null;
    let entry = state.players.get(peerId);
    if (!entry) {
      const peerInfo = game.netSession?.state?.peers?.get(peerId);
      entry = {
        id: peerId,
        name: peerInfo?.name || `玩家-${peerId.slice(0, 4)}`,
        color: peerInfo?.color || '#9f927d',
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
    } else {
      // 同步昵称 / 颜色（session 在 HELLO/PEER_INFO 收到后会写入 peers）
      const peerInfo = game.netSession?.state?.peers?.get(peerId);
      if (peerInfo) {
        entry.name = peerInfo.name || entry.name;
        entry.color = peerInfo.color || entry.color;
      }
    }
    return entry;
  }

  function handleInput(data, peerId) {
    if (!active || !data || typeof data !== 'object') return;
    const entry = ensurePeerEntry(peerId);
    if (!entry) return;
    if (typeof data.x === 'number') entry.x = data.x;
    if (typeof data.y === 'number') entry.y = data.y;
    if (typeof data.f === 'string') entry.facing = data.f;
    entry.isMoving = data.m === 1;
    if (typeof data.a === 'number') entry.animationTime = data.a;
    if (typeof data.h === 'number' && data.h >= 0) entry.hp = data.h;
    entry.lastUpdate = performance.now();
  }

  function collectSnapshotPlayers() {
    const list = [];

    // 本地（房主）玩家
    if (state.playerId) {
      const transform = getComponent(state.playerId, 'transform');
      const player = getComponent(state.playerId, 'player');
      const health = getComponent(state.playerId, 'health');
      if (transform) {
        const selfId = netTransport.getSelfId();
        const selfPeer = selfId ? game.netSession?.state?.peers?.get(selfId) : null;
        list.push({
          id: selfId || 'host',
          name: selfPeer?.name || game.netSession?.state?.localName || '房主',
          color: selfPeer?.color || game.netSession?.state?.localColor || '#19c8b9',
          x: transform.x,
          y: transform.y,
          facing: player?.facing || 'down',
          isMoving: !!player?.isMoving,
          animationTime: player?.animationTime || 0,
          hp: health ? health.hp : -1
        });
      }
    }

    // 远端玩家 ghost
    state.players.forEach((entry) => {
      if (entry.isLocal) return;
      list.push({
        id: entry.id,
        name: entry.name,
        color: entry.color,
        x: entry.x,
        y: entry.y,
        facing: entry.facing,
        isMoving: entry.isMoving,
        animationTime: entry.animationTime,
        hp: entry.hp
      });
    });

    return list;
  }

  function broadcastSnapshot(targetPeer) {
    if (!active) return;
    state.netTick += 1;
    const payload = netMakeSnapshot({
      tick: state.netTick,
      day: state.day,
      time: state.time,
      players: collectSnapshotPlayers()
    });
    netTransport.send(NET_CHANNELS.SNAPSHOT, payload, targetPeer);
  }

  // ---------------- ENTITY_DELTA ----------------

  // 上一帧广播过的活敌人 netId 集合；当前帧不再出现的 netId = 被销毁。
  let prevEnemyNetIds = new Set();
  // 上一帧标记为 dirty 的资源 netId 集合。资源从 dirty 转为 clean（重生回满）
  // 后会从 dirty 检测里掉出去，但需要再发一次"clean"状态让 client 看到恢复。
  let prevDirtyResourceNetIds = new Set();
  // 上一帧广播过的活建筑 netId 集合；用于检测"被拆/烧毁"。
  let prevStructureNetIds = new Set();

  function enemyNetId(enemyId) {
    const enemy = getComponent(enemyId, 'enemy');
    if (!enemy) return null;
    // 来自 chunk hydration 的敌人：chunkKey + slot 在 host/client 端一致，
    // 直接用确定性 netId，client 可以本地匹配到由同种子生成的实体。
    if (enemy.fromChunk && enemy.chunkKey && enemy.slotIndex >= 0) {
      return `e:${enemy.chunkKey}:${enemy.slotIndex}`;
    }
    // 动态生成（spawnEnemy）：用 host 本地实体 id 当唯一标识，client 端按
    // netId 创建独立实体（不与 chunk slot 关联）。
    return `e:d:${enemyId}`;
  }

  function resourceNetId(entityId) {
    const node = getComponent(entityId, 'resourceNode');
    if (!node?.chunkKey || node.slotIndex < 0) return null;
    return `r:${node.chunkKey}:${node.slotIndex}`;
  }

  function structureNetId(entityId) {
    const structure = getComponent(entityId, 'structure');
    if (!structure) return null;
    // 当前所有建筑都是 player-built（fromChunk=false），统一用 `s:d:<entityId>`。
    // 若以后做出 "chunk 预生成的遗迹/废墟" 之类，可在此分支用 `s:chunkKey:slot`。
    if (structure.fromChunk && structure.chunkKey && structure.slotIndex >= 0) {
      return `s:${structure.chunkKey}:${structure.slotIndex}`;
    }
    return `s:d:${entityId}`;
  }

  // 抽取建筑的"可同步状态"。控制白名单避免 JSON.stringify 上意外字段。
  function extractStructureState(structure) {
    if (!structure) return {};
    const out = {};
    // 通用：燃烧 / 储水 / 作物。读取时容错：未定义字段不写入，减少包大小。
    if (typeof structure.fuel === 'number') out.fuel = Math.round(structure.fuel * 10) / 10;
    if (typeof structure.water === 'number') out.water = Math.round(structure.water * 100) / 100;
    if (typeof structure.fill === 'number') out.fill = Math.round(structure.fill * 100) / 100;
    if (typeof structure.crop !== 'undefined') out.crop = structure.crop || null;
    if (typeof structure.growth === 'number') out.growth = Math.round(structure.growth * 100) / 100;
    if (typeof structure.ready === 'boolean') out.ready = structure.ready;
    return out;
  }

  function collectResourceUpdates(fullSync) {
    const list = [];
    const currentDirty = new Set();
    for (const entityId of getResourceIds()) {
      const node = getComponent(entityId, 'resourceNode');
      const health = getComponent(entityId, 'health');
      const transform = getComponent(entityId, 'transform');
      if (!node || !health || !transform) continue;
      const config = getEntityConfig(node.kind);
      const maxHp = health.maxHp || config?.hp || 1;
      const dirty = !node.alive || health.hp < maxHp || (node.respawnTimer || 0) > 0;
      const id = resourceNetId(entityId);
      if (!id) continue;
      // 触发条件：full sync / 当前 dirty / 上一帧 dirty 但本帧 clean（恢复事件）
      const wasDirty = prevDirtyResourceNetIds.has(id);
      if (!fullSync && !dirty && !wasDirty) continue;
      if (dirty) currentDirty.add(id);
      list.push({
        netId: id,
        chunkKey: node.chunkKey,
        slotIndex: node.slotIndex,
        kind: node.kind,
        hp: health.hp,
        maxHp,
        alive: !!node.alive,
        respawnTimer: node.respawnTimer
      });
    }
    // 只在广播路径更新基线；peer-specific 的 full sync 不影响"上一帧"。
    return { list, currentDirty };
  }

  function collectEnemyUpdates() {
    const list = [];
    const seen = new Set();
    for (const entityId of getEnemyIds()) {
      const transform = getComponent(entityId, 'transform');
      const health = getComponent(entityId, 'health');
      const enemy = getComponent(entityId, 'enemy');
      if (!transform || !health || !enemy) continue;
      if (health.hp <= 0) continue;
      const id = enemyNetId(entityId);
      if (!id) continue;
      seen.add(id);
      list.push({
        netId: id,
        kind: enemy.kind,
        x: transform.x,
        y: transform.y,
        hp: health.hp,
        maxHp: health.maxHp,
        chunkKey: enemy.fromChunk ? enemy.chunkKey : '',
        slotIndex: enemy.fromChunk ? enemy.slotIndex : -1
      });
    }
    return { list, seen };
  }

  function collectStructureUpdates() {
    const list = [];
    const seen = new Set();
    if (typeof getStructureIds !== 'function') return { list, seen };
    for (const entityId of getStructureIds()) {
      const transform = getComponent(entityId, 'transform');
      const health = getComponent(entityId, 'health');
      const structure = getComponent(entityId, 'structure');
      if (!transform || !structure) continue;
      const id = structureNetId(entityId);
      if (!id) continue;
      seen.add(id);
      list.push({
        netId: id,
        kind: structure.kind,
        x: transform.x,
        y: transform.y,
        hp: health ? health.hp : 0,
        maxHp: health ? health.maxHp : 0,
        state: extractStructureState(structure)
      });
    }
    return { list, seen };
  }

  function broadcastEntityDelta(targetPeer, fullSync) {
    if (!active) return;
    const { list: resources, currentDirty } = collectResourceUpdates(!!fullSync);
    const { list: enemies, seen } = collectEnemyUpdates();
    const { list: structures, seen: structuresSeen } = collectStructureUpdates();
    const removed = [];
    const removedStructures = [];
    if (!targetPeer) {
      // 只在广播路径上做"消失检测"：peer-specific 的全量补帧不应该误删 ghost
      prevEnemyNetIds.forEach((id) => {
        if (!seen.has(id)) removed.push(id);
      });
      prevStructureNetIds.forEach((id) => {
        if (!structuresSeen.has(id)) removedStructures.push(id);
      });
      prevEnemyNetIds = seen;
      prevDirtyResourceNetIds = currentDirty;
      prevStructureNetIds = structuresSeen;
    }
    // 没有任何变化时不发，节省带宽
    if (!fullSync && !targetPeer
        && resources.length === 0 && enemies.length === 0 && removed.length === 0
        && structures.length === 0 && removedStructures.length === 0) {
      return;
    }
    const payload = netMakeEntityDelta({
      tick: state.netTick,
      resources,
      enemies,
      removedEnemies: removed,
      structures,
      removedStructures,
      full: !!fullSync
    });
    netTransport.send(NET_CHANNELS.ENTITY_DELTA, payload, targetPeer);
  }

  function hostTick(dt) {
    if (!active) return;
    if (!state.running || state.over) return;
    snapshotAcc += dt;
    if (snapshotAcc >= SNAPSHOT_INTERVAL) {
      snapshotAcc = 0;
      broadcastSnapshot();
    }
    entityDeltaAcc += dt;
    if (entityDeltaAcc >= ENTITY_DELTA_INTERVAL) {
      entityDeltaAcc = 0;
      broadcastEntityDelta();
    }
  }

  // ---------------- ACTION_REQ -> INVENTORY ----------------

  // 解析 client 发来的 netId，返回 host 端的本地 entityId 与 group。
  // 规则与上面 enemyNetId / resourceNetId 对称：
  //   r:<chunkKey>:<slot>     -> chunk.loadedResourceIds[slot]
  //   e:<chunkKey>:<slot>     -> chunk.loadedEnemyIds[slot]
  //   e:d:<entityId>          -> 直接 parse 出 host 本地 entityId
  function resolveTargetByNetId(netId) {
    if (typeof netId !== 'string' || !netId) return null;
    if (netId.startsWith('r:')) {
      const rest = netId.slice(2);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 0) return null;
      const chunkKey = rest.slice(0, lastColon);
      const slot = parseInt(rest.slice(lastColon + 1), 10);
      const chunk = state.world?.chunks?.get(chunkKey);
      if (!chunk || !Array.isArray(chunk.loadedResourceIds)) return null;
      const id = chunk.loadedResourceIds[slot];
      return id ? { group: 'resource', id } : null;
    }
    if (netId.startsWith('e:d:')) {
      const id = parseInt(netId.slice(4), 10);
      if (!Number.isFinite(id)) return null;
      // 防御性：仅在该 id 仍是活敌人时才返回（否则可能是已销毁的旧 id）
      if (!getEnemyIds().includes(id)) return null;
      return { group: 'enemy', id };
    }
    if (netId.startsWith('e:')) {
      const rest = netId.slice(2);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 0) return null;
      const chunkKey = rest.slice(0, lastColon);
      const slot = parseInt(rest.slice(lastColon + 1), 10);
      const chunk = state.world?.chunks?.get(chunkKey);
      if (!chunk || !Array.isArray(chunk.loadedEnemyIds)) return null;
      const id = chunk.loadedEnemyIds[slot];
      return id ? { group: 'enemy', id } : null;
    }
    return null;
  }

  // 客户端 peer 的简易 attack cooldown，避免他刷网络包打超快。
  // 与 action-system.js 中的本地 attackCooldown (0.26s = 260ms) 对齐：
  // 服务端略宽容 20ms 以容忍网络抖动，既能拦截恶意客户端的高频请求，
  // 又不会拒绝正常节奏的合法包。
  const peerActionCooldown = new Map(); // peerId -> last attack timestamp (ms)
  const PEER_ATTACK_COOLDOWN_MS = 240;
  // 距离校验的延迟容忍量：远端玩家的位置以 ~15Hz INPUT 上报，
  // 在 ATTACK_RANGE + collider.radius 的基础上再放宽 PEER_RANGE_SLACK
  // 像素，避免合法攻击因为 ghost 还没更新而被服务端拒绝。
  const PEER_RANGE_SLACK = 24;

  function handleResourceAttackByPeer(peerId, target, peerEntry, toolKey) {
    const transform = getComponent(target.id, 'transform');
    const health = getComponent(target.id, 'health');
    const node = getComponent(target.id, 'resourceNode');
    if (!transform || !health || !node?.alive) return;

    // 距离校验：使用 client 报告的位置（peerEntry.x/y），加少量宽容值。
    const collider = getComponent(target.id, 'collider');
    const radius = collider?.radius || 0;
    const distance = dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y);
    if (distance > ATTACK_RANGE + radius + PEER_RANGE_SLACK) return; // 容忍 ghost 延迟

    const damage = getResourceDamage(toolKey, target.id);
    health.hp -= damage;
    health.hitTimer = 0.18;

    if (health.hp <= 0) {
      const config = getEntityConfig(node.kind);
      if (!config) return;
      const loot = rollLoot(config.loot);
      node.alive = false;
      node.respawnTimer = config.respawn * randomBetween(0.85, 1.2);
      health.hp = 0;
      health.hitTimer = 0;
      if (config.burst) burst(transform.x, transform.y, config.burst.color, config.burst.count);
      if (Object.keys(loot).length > 0) {
        netTransport.send(
          NET_CHANNELS.INVENTORY,
          netMakeInventoryUpdate({ items: loot, reason: 'harvest' }),
          peerId
        );
      }
    }
  }

  function handleEnemyAttackByPeer(peerId, target, peerEntry, toolKey) {
    const transform = getComponent(target.id, 'transform');
    const health = getComponent(target.id, 'health');
    const enemy = getComponent(target.id, 'enemy');
    if (!transform || !health || !enemy) return;

    const collider = getComponent(target.id, 'collider');
    const radius = collider?.radius || 0;
    const distance = dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y);
    if (distance > ATTACK_RANGE + radius + PEER_RANGE_SLACK) return;

    const damage = getEnemyDamage(toolKey, target.id);
    health.hp -= damage;
    health.hitTimer = 0.18;
    burst(transform.x, transform.y, '#ff7a8d', 5, 50);

    if (health.hp <= 0) {
      const meat = rollEnemyMeat(enemy.kind);
      burst(transform.x, transform.y, '#ffd37c', 10, 70);
      if (meat > 0) {
        netTransport.send(
          NET_CHANNELS.INVENTORY,
          netMakeInventoryUpdate({ items: { meat }, reason: 'kill' }),
          peerId
        );
      }
      try { removeChunkEnemyEntity?.(target.id); } catch (err) { console.warn('[net/host] removeChunkEnemyEntity', err); }
      try { destroyEntity(target.id); } catch (err) { console.warn('[net/host] destroyEntity', err); }
    }
  }

  // 建造距离上限（与 building.js 的 canPlaceStructure 中 118 对齐，加一点宽容）
  const PEER_BUILD_RANGE = 118 + PEER_RANGE_SLACK;

  // 服务端对建造请求的校验：取代 building.js#canPlaceStructure 中"以本地玩家
  // 为参照"的部分，改成以 peer 上报的 ghost 位置为参照。复用 game 上的
  // tileAtWorld / tileWalkable / canStructureOverlap 等只读工具。
  function canPeerPlaceStructure(peerEntry, kind, x, y) {
    if (typeof game.tileAtWorld !== 'function' || typeof game.tileWalkable !== 'function') return false;
    if (typeof game.canStructureOverlap !== 'function') return false;
    if (!game.tileWalkable(game.tileAtWorld(x, y))) return false;
    const px = peerEntry.x || 0;
    const py = peerEntry.y || 0;
    if (dist(px, py, x, y) > PEER_BUILD_RANGE) return false;

    // 与已有建筑冲突
    for (const structureId of getStructureIds()) {
      const transform = getComponent(structureId, 'transform');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !structure) continue;
      if (!game.canStructureOverlap(kind, structure.kind) && dist(transform.x, transform.y, x, y) < 26) return false;
    }
    // 与活体资源节点冲突
    for (const entityId of getResourceIds()) {
      const transform = getComponent(entityId, 'transform');
      const collider = getComponent(entityId, 'collider');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (!transform || !collider || !resourceNode?.alive) continue;
      if (dist(transform.x, transform.y, x, y) < collider.radius + 12) return false;
    }
    // 不允许直接踩在 peer 本人身上
    if (dist(px, py, x, y) < 26) return false;
    return true;
  }

  // 退款：把刚被 client 本地扣掉的建造物加回去。client 端 addInventory 会自
  // 动塞回合适的格子（不一定是原槽位，但物品不丢）。
  function refundPeerBuild(peerId, itemKey, reason) {
    if (!peerId || !itemKey) return;
    netTransport.send(
      NET_CHANNELS.INVENTORY,
      netMakeInventoryUpdate({ items: { [itemKey]: 1 }, reason: reason || 'build_refund' }),
      peerId
    );
  }

  function handleBuildByPeer(peerId, peerEntry, data) {
    const itemKey = typeof data.t === 'string' ? data.t : '';
    const kind = typeof data.k === 'string' ? data.k : '';
    const x = Number(data.x) || 0;
    const y = Number(data.y) || 0;
    if (!itemKey || !kind) { refundPeerBuild(peerId, itemKey, 'build_invalid'); return; }
    // 物品必须确实是 buildable，且 buildKind 与请求 kind 一致 —— 防止用一个低价
    // 建材请求建造高级建筑。
    const itemConfig = typeof game.getItemConfig === 'function' ? game.getItemConfig(itemKey) : null;
    if (!itemConfig || itemConfig.type !== 'buildable' || itemConfig.buildKind !== kind) {
      refundPeerBuild(peerId, itemKey, 'build_invalid_item');
      return;
    }
    if (!canPeerPlaceStructure(peerEntry, kind, x, y)) {
      refundPeerBuild(peerId, itemKey, 'build_invalid_pos');
      return;
    }
    if (typeof game.createStructureEntity !== 'function') {
      refundPeerBuild(peerId, itemKey, 'build_unavailable');
      return;
    }
    const entityId = game.createStructureEntity(kind, x, y);
    if (!entityId) {
      refundPeerBuild(peerId, itemKey, 'build_failed');
      return;
    }
    if (typeof burst === 'function') burst(x, y, '#83f5ce', 8, 36);
    // 下一拍 broadcastEntityDelta 会把这个新建筑（含 netId）推给所有 client。
  }

  function handleActionReq(data, peerId) {
    if (!active || !state.running || state.over) return;
    if (!data || typeof data !== 'object' || !peerId) return;
    const peerEntry = state.players.get(peerId);
    if (!peerEntry) return;

    // 简易速率限制：attack 与 build 共用一个 cooldown 桶，避免同一 peer 在
    // 一帧内同时刷 attack+build。
    const now = performance.now();
    const last = peerActionCooldown.get(peerId) || 0;
    if (now - last < PEER_ATTACK_COOLDOWN_MS) {
      // build 被速率限制拒绝时也要退款，否则 client 端物品消失了
      if (data.a === 'build') {
        refundPeerBuild(peerId, typeof data.t === 'string' ? data.t : '', 'build_throttled');
      }
      return;
    }
    peerActionCooldown.set(peerId, now);

    if (data.a === 'build') {
      handleBuildByPeer(peerId, peerEntry, data);
      return;
    }
    if (data.a !== 'attack') return; // 其它动作类型留待后续
    const target = resolveTargetByNetId(data.t);
    if (!target) return;

    const toolKey = typeof data.tk === 'string' ? data.tk : '';
    if (target.group === 'resource') {
      handleResourceAttackByPeer(peerId, target, peerEntry, toolKey);
    } else if (target.group === 'enemy') {
      handleEnemyAttackByPeer(peerId, target, peerEntry, toolKey);
    }
    // 状态变化通过下一个 ENTITY_DELTA tick 自动广播给所有 peer
  }

  function onPeerJoin(peerId) {
    if (!active) return;
    ensurePeerEntry(peerId);
    // 立刻补一份 SNAPSHOT + 全量 ENTITY_DELTA，缩短新玩家"看不到世界"的窗口
    broadcastSnapshot(peerId);
    broadcastEntityDelta(peerId, /* fullSync */ true);
  }

  function onPeerLeave(peerId) {
    if (!active) return;
    state.players.delete(peerId);
    peerActionCooldown.delete(peerId);
  }

  // 一次性订阅：transport 的订阅在 session 初始化时已建好通道，这里加 handler。
  netTransport.subscribe(NET_CHANNELS.INPUT, (data, peerId) => {
    handleInput(data, peerId);
  });
  netTransport.subscribe(NET_CHANNELS.ACTION_REQ, (data, peerId) => {
    handleActionReq(data, peerId);
  });
  netTransport.onPeerJoin(onPeerJoin);
  netTransport.onPeerLeave(onPeerLeave);

  function startHost() {
    if (active) return;
    active = true;
    state.netMode = 'host';
    snapshotAcc = 0;
    entityDeltaAcc = 0;
    state.netTick = 0;
    prevEnemyNetIds = new Set();
    prevDirtyResourceNetIds = new Set();
    // 清掉单机残留的远端列表（理论上单机模式下就是空的，这里防御一下）
    state.players.clear();
    // 房间已有 peer 时也兜底广播一次
    netTransport.getPeers().forEach((peerId) => {
      ensurePeerEntry(peerId);
    });
    broadcastSnapshot();
    broadcastEntityDelta(undefined, /* fullSync */ true);
  }

  function stopHost() {
    if (!active) return;
    active = false;
    state.netMode = 'single';
    state.players.clear();
    state.netTick = 0;
    snapshotAcc = 0;
    entityDeltaAcc = 0;
    prevEnemyNetIds = new Set();
    prevDirtyResourceNetIds = new Set();
    prevStructureNetIds = new Set();
    peerActionCooldown.clear();
  }

  Object.assign(game, {
    netHostStart: startHost,
    netHostStop: stopHost,
    netHostTick: hostTick,
    netHostBroadcastSnapshot: broadcastSnapshot,
    netHostBroadcastEntityDelta: broadcastEntityDelta
  });
})(window.TidalIsle);
