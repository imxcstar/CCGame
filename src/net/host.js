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
    netMakeSnapshot,
    netMakeEntityDelta,
    getComponent,
    getResourceIds,
    getEnemyIds,
    getEntityConfig
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

  function broadcastEntityDelta(targetPeer, fullSync) {
    if (!active) return;
    const { list: resources, currentDirty } = collectResourceUpdates(!!fullSync);
    const { list: enemies, seen } = collectEnemyUpdates();
    const removed = [];
    if (!targetPeer) {
      // 只在广播路径上做"消失检测"：peer-specific 的全量补帧不应该误删 ghost
      prevEnemyNetIds.forEach((id) => {
        if (!seen.has(id)) removed.push(id);
      });
      prevEnemyNetIds = seen;
      prevDirtyResourceNetIds = currentDirty;
    }
    // 没有任何变化时不发，节省带宽
    if (!fullSync && !targetPeer && resources.length === 0 && enemies.length === 0 && removed.length === 0) {
      return;
    }
    const payload = netMakeEntityDelta({
      tick: state.netTick,
      resources,
      enemies,
      removedEnemies: removed,
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
  }

  // 一次性订阅：transport 的订阅在 session 初始化时已建好通道，这里加 handler。
  netTransport.subscribe(NET_CHANNELS.INPUT, (data, peerId) => {
    handleInput(data, peerId);
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
  }

  Object.assign(game, {
    netHostStart: startHost,
    netHostStop: stopHost,
    netHostTick: hostTick,
    netHostBroadcastSnapshot: broadcastSnapshot,
    netHostBroadcastEntityDelta: broadcastEntityDelta
  });
})(window.TidalIsle);
