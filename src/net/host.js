/*
 * Host 模块（第 2 步：星型权威同步 - MVP）
 *
 * Host 在房主本机维持完整的单机权威世界（资源刷新、敌人 AI、昼夜推进、
 * 建筑结算等仍按原逻辑跑），并通过 WebRTC DataChannel：
 *   - 接收 INPUT：客户端上报的位置 / 朝向 / 动画相位，作为远端 ghost 缓存
 *   - 广播 SNAPSHOT：~15 Hz 推送当前 day / time + 所有玩家位置
 *
 * 房间内有任意新成员加入时立刻发一份"补帧 SNAPSHOT"，让新玩家尽快看到
 * 房主目前所处的时间 / 玩家分布。
 *
 * 这一阶段不接管动作（采集 / 战斗 / 建造）—— 各端依旧使用相同的世界种子
 * 各自模拟资源 / 敌人；后续会在此基础上扩展 ACTION_REQ / ACTION_ACK
 * 与 ENTITY_DELTA。
 */
(function (game) {
  const {
    state,
    netTransport,
    NET_CHANNELS,
    NET_ROLES,
    netMakeSnapshot,
    getComponent
  } = game;
  // 注意：netSession 在 session.js 中创建，加载顺序晚于本模块；运行期通过
  // game.netSession 懒读取，避免 TDZ。

  const SNAPSHOT_INTERVAL = 1 / 15; // 15 Hz
  let snapshotAcc = 0;
  let active = false;

  function ensurePeerEntry(peerId) {
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

  function hostTick(dt) {
    if (!active) return;
    if (!state.running || state.over) return;
    snapshotAcc += dt;
    if (snapshotAcc >= SNAPSHOT_INTERVAL) {
      snapshotAcc = 0;
      broadcastSnapshot();
    }
  }

  function onPeerJoin(peerId) {
    if (!active) return;
    ensurePeerEntry(peerId);
    // 立刻补一份 SNAPSHOT，缩短新玩家的"黑屏窗口"
    broadcastSnapshot(peerId);
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
    state.netTick = 0;
    // 清掉单机残留的远端列表（理论上单机模式下就是空的，这里防御一下）
    state.players.clear();
    // 房间已有 peer 时也兜底广播一次
    netTransport.getPeers().forEach((peerId) => {
      ensurePeerEntry(peerId);
    });
    broadcastSnapshot();
  }

  function stopHost() {
    if (!active) return;
    active = false;
    state.netMode = 'single';
    state.players.clear();
    state.netTick = 0;
    snapshotAcc = 0;
  }

  Object.assign(game, {
    netHostStart: startHost,
    netHostStop: stopHost,
    netHostTick: hostTick,
    netHostBroadcastSnapshot: broadcastSnapshot
  });
})(window.TidalIsle);
