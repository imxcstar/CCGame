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
    // 记录最近一次看到的 input 序号，下次 SNAPSHOT 会把它作为 ack 一起发回
    // 给 client，让 client 据此裁剪本地未确认 input 历史，做对账判断。
    if (typeof data.q === 'number') entry.ackSeq = data.q | 0;
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
        hp: entry.hp,
        ackSeq: entry.ackSeq || 0
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
  // 规则与上面 enemyNetId / resourceNetId / structureNetId 对称：
  //   r:<chunkKey>:<slot>     -> chunk.loadedResourceIds[slot]
  //   e:<chunkKey>:<slot>     -> chunk.loadedEnemyIds[slot]
  //   e:d:<entityId>          -> 直接 parse 出 host 本地 entityId
  //   s:<chunkKey>:<slot>     -> chunk.loadedStructureIds[slot]（保留位）
  //   s:d:<entityId>          -> 直接 parse 出 host 本地 entityId
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
    if (netId.startsWith('s:d:')) {
      const id = parseInt(netId.slice(4), 10);
      if (!Number.isFinite(id)) return null;
      if (typeof getStructureIds === 'function' && !getStructureIds().includes(id)) return null;
      return { group: 'structure', id };
    }
    if (netId.startsWith('s:')) {
      const rest = netId.slice(2);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 0) return null;
      const chunkKey = rest.slice(0, lastColon);
      const slot = parseInt(rest.slice(lastColon + 1), 10);
      const chunk = state.world?.chunks?.get(chunkKey);
      if (!chunk || !Array.isArray(chunk.loadedStructureIds)) return null;
      const id = chunk.loadedStructureIds[slot];
      return id ? { group: 'structure', id } : null;
    }
    return null;
  }

  // 客户端 peer 的简易动作 cooldown，避免他刷网络包打超快。
  // 与 action-system.js 中的本地 attackCooldown (0.26s = 260ms) 对齐：
  // 服务端略宽容 20ms 以容忍网络抖动，既能拦截恶意客户端的高频请求，
  // 又不会拒绝正常节奏的合法包。attack 与 build 共享同一个桶（同一 peer
  // 不该同帧又打又造）。
  const peerActionCooldown = new Map(); // peerId -> last action timestamp (ms)
  const PEER_ACTION_COOLDOWN_MS = 240;
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

  // 结构相关交互在 host 端的统一入口。client 一般已在本地做了"消耗品扣除 /
  // 视觉反馈"，host 只负责世界状态权威修改与战利品分发；若校验失败可通过
  // INVENTORY 回退已扣材料。
  const STRUCTURE_RANGE = 62 + PEER_RANGE_SLACK;
  const REPAIR_DISMANTLE_RANGE = 82 + PEER_RANGE_SLACK;

  function refundPeerItems(peerId, items, reason) {
    if (!peerId || !items) return;
    const trimmed = {};
    let any = false;
    for (const [k, v] of Object.entries(items)) {
      if (v > 0) { trimmed[k] = v; any = true; }
    }
    if (!any) return;
    netTransport.send(
      NET_CHANNELS.INVENTORY,
      netMakeInventoryUpdate({ items: trimmed, reason: reason || 'refund' }),
      peerId
    );
  }

  function getPeerStructure(target) {
    if (!target || target.group !== 'structure') return null;
    const transform = getComponent(target.id, 'transform');
    const structure = getComponent(target.id, 'structure');
    const health = getComponent(target.id, 'health');
    if (!transform || !structure) return null;
    return { transform, structure, health };
  }

  function handleStructureInteract(peerId, peerEntry, target) {
    const ctx = getPeerStructure(target);
    if (!ctx) return;
    const { transform, structure } = ctx;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > STRUCTURE_RANGE) return;

    if (structure.kind === 'campfire') {
      // 添柴 +1
      structure.fuel = Math.min(120, (structure.fuel || 0) + 28);
      if (typeof burst === 'function') burst(transform.x, transform.y, '#ffca74', 6, 28);
      return;
    }
    if (structure.kind === 'collector') {
      // 取水 -1：若 host 端水量不足说明 client 状态滞后，不修改并让 ENTITY_DELTA 自然回滚
      if ((structure.water || 0) <= 0) return;
      structure.water = Math.max(0, (structure.water || 0) - 1);
      if (typeof burst === 'function') burst(transform.x, transform.y, '#81e7ff', 7, 30);
      return;
    }
    if (structure.kind === 'planter') {
      if (!structure.crop) {
        structure.crop = 'pumpkin';
        structure.growth = 0;
        structure.ready = false;
        if (typeof burst === 'function') burst(transform.x, transform.y, '#9fd77c', 6, 24);
      }
      return;
    }
  }

  function handleStructureRefuel(peerId, peerEntry, target, fillAll) {
    const ctx = getPeerStructure(target);
    if (!ctx) return;
    const { transform, structure } = ctx;
    if (structure.kind !== 'campfire') return;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > STRUCTURE_RANGE) return;
    const missingFuel = Math.max(0, 120 - (structure.fuel || 0));
    if (missingFuel <= 0) return;
    const woodToUse = fillAll ? Math.ceil(missingFuel / 28) : 1;
    structure.fuel = Math.min(120, (structure.fuel || 0) + woodToUse * 28);
    if (typeof burst === 'function') burst(transform.x, transform.y, '#ffca74', 6 + woodToUse, 28 + woodToUse * 3);
  }

  function handleStructureDrink(peerId, peerEntry, target, drinkAll) {
    const ctx = getPeerStructure(target);
    if (!ctx) return;
    const { transform, structure } = ctx;
    if (structure.kind !== 'collector') return;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > STRUCTURE_RANGE) return;
    if ((structure.water || 0) <= 0) return;
    const amount = drinkAll ? (structure.water || 0) : 1;
    structure.water = Math.max(0, (structure.water || 0) - amount);
    if (typeof burst === 'function') burst(transform.x, transform.y, '#81e7ff', 6 + amount, 30 + amount * 2);
  }

  function handleStructureCook(peerId, peerEntry, target) {
    const ctx = getPeerStructure(target);
    if (!ctx) return;
    const { transform, structure } = ctx;
    if (structure.kind !== 'campfire') return;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > STRUCTURE_RANGE) return;
    if ((structure.fuel || 0) < 10) {
      // 燃料不足：把客户端已扣的鱼退回去（fish key 写在 data.k 字段）
      refundPeerItems(peerId, target.refundOnFail ? { [target.refundOnFail]: 1 } : null, 'cook_no_fuel');
      return;
    }
    structure.fuel = Math.max(0, (structure.fuel || 0) - 10);
    if (typeof burst === 'function') burst(transform.x, transform.y, '#ffc887', 7, 28);
    netTransport.send(
      NET_CHANNELS.INVENTORY,
      netMakeInventoryUpdate({ items: { grilledFish: 1 }, reason: 'cook' }),
      peerId
    );
  }

  function handleStructureRepair(peerId, peerEntry, target) {
    const ctx = getPeerStructure(target);
    if (!ctx?.health) return;
    const { transform, structure, health } = ctx;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > REPAIR_DISMANTLE_RANGE) return;
    if (health.hp >= health.maxHp) return;
    health.hp = health.maxHp;
    if (typeof burst === 'function') burst(transform.x, transform.y, '#93f59a', 8, 34);
  }

  function handleStructureDismantle(peerId, peerEntry, target) {
    const ctx = getPeerStructure(target);
    if (!ctx) return;
    const { transform, structure } = ctx;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > REPAIR_DISMANTLE_RANGE) return;
    if (typeof burst === 'function') burst(transform.x, transform.y, '#83f5ce', 10, 42);
    // 物品回收（与本地 dismantleStructure 行为一致）
    netTransport.send(
      NET_CHANNELS.INVENTORY,
      netMakeInventoryUpdate({ items: { [structure.kind]: 1 }, reason: 'dismantle' }),
      peerId
    );
    try { game.removeChunkStructureEntity?.(target.id); } catch (err) { console.warn('[net/host] removeChunkStructureEntity', err); }
    try { destroyEntity(target.id); } catch (err) { console.warn('[net/host] destroyEntity (structure)', err); }
  }

  function handleStructureHarvestPlanter(peerId, peerEntry, target) {
    const ctx = getPeerStructure(target);
    if (!ctx) return;
    const { transform, structure } = ctx;
    if (structure.kind !== 'planter') return;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, transform.x, transform.y) > STRUCTURE_RANGE) return;
    if (!structure.crop || !structure.ready) return;
    structure.crop = null;
    structure.growth = 0;
    structure.ready = false;
    if (typeof burst === 'function') burst(transform.x, transform.y, '#ffb562', 8, 28);
    netTransport.send(
      NET_CHANNELS.INVENTORY,
      netMakeInventoryUpdate({ items: { pumpkin: 2 }, reason: 'harvest_planter' }),
      peerId
    );
  }

  // 钓鱼：MVP 仅在客户端"成功收线"时给奖励。host 校验玩家与浮标距离 + tile
  // 类型 + 简单冷却，避免恶意 client 高频骗鱼。
  function isFishableTile(t) { return t === 'water' || t === 'deep'; }
  function rollFishingCatchHost(tile, dayTime) {
    const night = dayTime > 0.78 || dayTime < 0.18;
    const r = Math.random();
    if (tile === 'deep') {
      if (night && r < 0.24) return { eel: 1 };
      if (r < 0.56) return { mackerel: 1 + (Math.random() < 0.5 ? 1 : 0) };
      if (r < 0.88) return { sardine: 1 + (Math.random() < 0.5 ? 1 : 0) };
      return { eel: 1 };
    }
    if (night && r < 0.12) return { eel: 1 };
    if (r < 0.7) return { sardine: 1 + (Math.random() < 0.5 ? 1 : 0) };
    if (r < 0.95) return { mackerel: 1 };
    return { eel: 1 };
  }

  function handleFishReel(peerId, peerEntry, data) {
    const x = Number(data.x) || 0;
    const y = Number(data.y) || 0;
    const tile = String(data.k || '');
    if (!isFishableTile(tile)) return;
    if (dist(peerEntry.x || 0, peerEntry.y || 0, x, y) > 132 + PEER_RANGE_SLACK) return;
    // 用 host 端的 tileAtWorld 二次校验，避免 client 谎报 tile 类型
    if (typeof game.tileAtWorld === 'function') {
      const t = game.tileAtWorld(x, y);
      if (!isFishableTile(t)) return;
    }
    const loot = rollFishingCatchHost(tile, state.time || 0);
    if (Object.keys(loot).length === 0) return;
    if (typeof burst === 'function') burst(x, y, '#b7f1ff', 8, 26);
    netTransport.send(
      NET_CHANNELS.INVENTORY,
      netMakeInventoryUpdate({ items: loot, reason: 'fish' }),
      peerId
    );
  }

  function handleActionReq(data, peerId) {
    if (!active || !state.running || state.over) return;
    if (!data || typeof data !== 'object' || !peerId) return;
    const peerEntry = state.players.get(peerId);
    if (!peerEntry) return;

    // 简易速率限制：所有动作共用一个 cooldown 桶，避免同一 peer 在一帧内
    // 同时刷多个 action（attack / build / interact 等）。
    const now = performance.now();
    const last = peerActionCooldown.get(peerId) || 0;
    if (now - last < PEER_ACTION_COOLDOWN_MS) {
      // build 被速率限制拒绝时也要退款，否则 client 端物品消失了
      if (data.a === 'build') {
        refundPeerBuild(peerId, typeof data.t === 'string' ? data.t : '', 'build_throttled');
      } else if (data.a === 'refuel' || data.a === 'cook') {
        // 这些动作 client 已扣除 1 wood / 1 fish；被节流时回退
        const refund = {};
        if (data.a === 'refuel') refund.wood = 1;
        if (data.a === 'cook' && typeof data.tk === 'string' && data.tk) refund[data.tk] = 1;
        refundPeerItems(peerId, refund, data.a + '_throttled');
      } else if (data.a === 'interact') {
        // plant 子动作有 seedPack 扣除；其它子动作（取水/添柴）也需要 wood 退回
        const refund = {};
        if (data.k === 'plant') refund.seedPack = 1;
        else if (data.k === 'campfire') refund.wood = 1;
        refundPeerItems(peerId, refund, 'interact_throttled');
      } else if (data.a === 'repair' && typeof data.tk === 'string' && data.tk) {
        try {
          // tk 是 JSON 序列化的 cost 对象，client 在请求时塞进去
          const cost = JSON.parse(data.tk);
          if (cost && typeof cost === 'object') refundPeerItems(peerId, cost, 'repair_throttled');
        } catch { /* ignore */ }
      }
      return;
    }
    peerActionCooldown.set(peerId, now);

    if (data.a === 'build') {
      handleBuildByPeer(peerId, peerEntry, data);
      return;
    }
    if (data.a === 'attack') {
      const target = resolveTargetByNetId(data.t);
      if (!target) return;
      const toolKey = typeof data.tk === 'string' ? data.tk : '';
      if (target.group === 'resource') {
        handleResourceAttackByPeer(peerId, target, peerEntry, toolKey);
      } else if (target.group === 'enemy') {
        handleEnemyAttackByPeer(peerId, target, peerEntry, toolKey);
      }
      return;
    }
    if (data.a === 'fishReel') {
      handleFishReel(peerId, peerEntry, data);
      return;
    }
    // 其余动作都是 structure 相关：t = 结构 netId
    if (data.a === 'interact' || data.a === 'refuel' || data.a === 'drink' ||
        data.a === 'cook' || data.a === 'repair' || data.a === 'dismantle' ||
        data.a === 'harvestPlanter') {
      const target = resolveTargetByNetId(data.t);
      if (!target || target.group !== 'structure') {
        // 找不到目标 → 把 client 已扣除的资源退回去
        if (data.a === 'interact' && data.k === 'plant') refundPeerItems(peerId, { seedPack: 1 }, 'interact_no_target');
        else if (data.a === 'interact' && data.k === 'campfire') refundPeerItems(peerId, { wood: 1 }, 'interact_no_target');
        else if (data.a === 'refuel') refundPeerItems(peerId, { wood: 1 }, 'refuel_no_target');
        else if (data.a === 'cook' && data.tk) refundPeerItems(peerId, { [data.tk]: 1 }, 'cook_no_target');
        else if (data.a === 'repair' && data.tk) {
          try { const cost = JSON.parse(data.tk); if (cost) refundPeerItems(peerId, cost, 'repair_no_target'); } catch { /* ignore */ }
        }
        return;
      }
      // 携带 client 扣除的物品 key（用于失败时退款）
      if (data.a === 'cook') target.refundOnFail = data.tk || null;
      if (data.a === 'interact') handleStructureInteract(peerId, peerEntry, target);
      else if (data.a === 'refuel') handleStructureRefuel(peerId, peerEntry, target, data.k === 'all');
      else if (data.a === 'drink') handleStructureDrink(peerId, peerEntry, target, data.k === 'all');
      else if (data.a === 'cook') handleStructureCook(peerId, peerEntry, target);
      else if (data.a === 'repair') handleStructureRepair(peerId, peerEntry, target);
      else if (data.a === 'dismantle') handleStructureDismantle(peerId, peerEntry, target);
      else if (data.a === 'harvestPlanter') handleStructureHarvestPlanter(peerId, peerEntry, target);
      return;
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

  // 房主主动踢人：给目标 peer 发 KICK，让其自行 leave。也立刻把它从 host
  // 的 players 表里删除，避免再继续广播它的 ghost。
  function kickPeer(peerId, reason = '被房主移出房间') {
    if (!active || !peerId) return false;
    try {
      netTransport.send(NET_CHANNELS.KICK, game.netMakeKick({ reason }), peerId);
    } catch (err) {
      console.warn('[net/host] kick send error', err);
    }
    state.players.delete(peerId);
    peerActionCooldown.delete(peerId);
    return true;
  }

  // 房主主动转让：广播 HOST_TRANSFER 告知所有 peer 新房主身份，然后停掉
  // 本机的 host 循环并切到 client。新房主接到后会自行调用 netHostStart。
  function transferHostTo(peerId) {
    if (!active || !peerId) return false;
    const payload = game.netMakeHostTransfer({
      peerId,
      seed: state.seed,
      day: state.day,
      time: state.time,
      voluntary: true
    });
    try {
      netTransport.send(NET_CHANNELS.HOST_TRANSFER, payload);
    } catch (err) {
      console.warn('[net/host] transfer send error', err);
    }
    return true;
  }

  Object.assign(game, {
    netHostStart: startHost,
    netHostStop: stopHost,
    netHostTick: hostTick,
    netHostBroadcastSnapshot: broadcastSnapshot,
    netHostBroadcastEntityDelta: broadcastEntityDelta,
    netHostKickPeer: kickPeer,
    netHostTransferTo: transferHostTo
  });
})(window.TidalIsle);
