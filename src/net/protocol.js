/*
 * 联机协议定义（第 1 步基建）
 *
 * 仅定义消息类型常量与最简单的握手/聊天消息形状，供 transport 与 session
 * 引用。后续步骤会在此处扩展 INPUT / SNAPSHOT / ENTITY_DELTA / ACTION_REQUEST
 * / ACTION_ACK / INVENTORY_UPDATE 等字段。
 *
 * 字段名保持紧凑（单字符或缩写）以便后续做增量编码时减少带宽。
 */
(function (game) {
  const PROTOCOL_VERSION = 1;

  // Trystero `makeAction` 的命名空间最长 12 字节，因此这里使用短名。
  const CHANNELS = {
    HELLO: 'hello',       // 握手：交换版本、玩家名、Host 元数据
    PEER_INFO: 'pinfo',   // 房间内成员变化广播（昵称、颜色等）
    CHAT: 'chat',         // 文字聊天
    INPUT: 'input',       // Client -> Host：输入帧
    SNAPSHOT: 'snap',     // Host -> Client：定时世界快照
    ENTITY_DELTA: 'edlt', // Host -> Client：实体增量
    ACTION_REQ: 'actq',   // Client -> Host：行为请求（采集/攻击/建造/钓鱼...）
    ACTION_ACK: 'acta',   // Host -> Client：行为结果
    INVENTORY: 'inv'      // Host -> Client：背包变更
  };

  const ROLES = {
    HOST: 'host',
    CLIENT: 'client'
  };

  function makeHello({ version = PROTOCOL_VERSION, name, role, seed, day, time } = {}) {
    return {
      v: version,
      n: name || '',
      r: role || ROLES.CLIENT,
      // 仅 Host 在 HELLO 中携带世界元数据，便于后续步骤让 Client 用相同种子做静态地形生成
      s: typeof seed === 'number' ? seed : null,
      d: typeof day === 'number' ? day : null,
      t: typeof time === 'number' ? time : null
    };
  }

  function makePeerInfo({ name, color } = {}) {
    return {
      n: name || '',
      c: color || ''
    };
  }

  function makeChat(text) {
    return {
      t: String(text || '').slice(0, 300),
      ts: Date.now()
    };
  }

  // Client -> Host：每个 tick 发一帧"我的玩家当前状态"。MVP 阶段 Host 不做
  // 物理对账，仅把客户端汇报的位置作为远端 ghost 显示给其他玩家。后续接入
  // 输入预测 / 服务器对账时，只需在保留字段 mv / aim 上追加按键状态。
  function makeInput({ seq, x, y, facing, isMoving, animationTime, hp }) {
    return {
      q: seq | 0,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      f: facing || 'down',
      m: isMoving ? 1 : 0,
      a: Math.round((animationTime || 0) * 100) / 100,
      h: typeof hp === 'number' ? Math.round(hp) : -1
    };
  }

  // Host -> Client：定时世界快照。MVP 只携带玩家位置 + 全局 day/time，
  // 其他实体（敌人、资源、建筑）仍由各端使用相同种子各自模拟。
  function makeSnapshot({ tick, day, time, players }) {
    return {
      k: tick | 0,
      d: typeof day === 'number' ? day : 1,
      t: typeof time === 'number' ? time : 0,
      p: (players || []).map((peer) => ({
        i: peer.id,
        n: peer.name || '',
        c: peer.color || '',
        x: Math.round(peer.x * 10) / 10,
        y: Math.round(peer.y * 10) / 10,
        f: peer.facing || 'down',
        m: peer.isMoving ? 1 : 0,
        a: Math.round((peer.animationTime || 0) * 100) / 100,
        h: typeof peer.hp === 'number' ? Math.round(peer.hp) : -1
      }))
    };
  }

  // Host -> Client：实体增量。包含：
  //   r  - 处于"非初始状态"的资源（被砍/被打、正在重生）
  //   e  - 当前所有活着的敌人（位置 / hp / kind / 可选 chunkKey+slot）
  //   eR - 自上一帧起被销毁的敌人 netId 列表
  // chunk-bound 实体使用 `${group}:${chunkKey}:${slot}` 这种确定性 netId，
  // 客户端用同种子在本地生成的 entity 直接按 (chunkKey, slot) 查表配对；
  // host 端运行时动态生成的实体使用 `${group}:d:${counter}` 形式，由 host
  // 在 add/创建 路径上自增分配。
  function makeEntityDelta({ tick, resources, enemies, removedEnemies, full } = {}) {
    return {
      k: tick | 0,
      f: full ? 1 : 0,
      r: (resources || []).map((res) => ({
        d: res.netId,            // string netId
        ck: res.chunkKey,        // chunkKey 字符串（便于客户端兜底查找）
        s: res.slotIndex | 0,
        k: res.kind || '',
        h: Math.round(res.hp || 0),
        mh: Math.round(res.maxHp || 0),
        a: res.alive ? 1 : 0,
        rt: Math.max(0, Math.round((res.respawnTimer || 0) * 10) / 10)
      })),
      e: (enemies || []).map((enemy) => ({
        d: enemy.netId,
        k: enemy.kind,
        x: Math.round(enemy.x * 10) / 10,
        y: Math.round(enemy.y * 10) / 10,
        h: Math.round(enemy.hp || 0),
        mh: Math.round(enemy.maxHp || 0),
        ck: enemy.chunkKey || '',
        s: typeof enemy.slotIndex === 'number' ? enemy.slotIndex : -1
      })),
      eR: (removedEnemies || []).slice()
    };
  }

  Object.assign(game, {
    NET_PROTOCOL_VERSION: PROTOCOL_VERSION,
    NET_CHANNELS: CHANNELS,
    NET_ROLES: ROLES,
    netMakeHello: makeHello,
    netMakePeerInfo: makePeerInfo,
    netMakeChat: makeChat,
    netMakeInput: makeInput,
    netMakeSnapshot: makeSnapshot,
    netMakeEntityDelta: makeEntityDelta
  });
})(window.TidalIsle);
