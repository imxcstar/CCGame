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

  Object.assign(game, {
    NET_PROTOCOL_VERSION: PROTOCOL_VERSION,
    NET_CHANNELS: CHANNELS,
    NET_ROLES: ROLES,
    netMakeHello: makeHello,
    netMakePeerInfo: makePeerInfo,
    netMakeChat: makeChat
  });
})(window.TidalIsle);
