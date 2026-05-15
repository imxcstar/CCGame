(function (game) {
  const { HOTBAR_SIZE } = game;

  const state = {
    running: false,
    over: false,
    seed: 0,
    world: null,
    worldAge: 0,
    playerId: null,
    // 联机相关：单机模式下保持默认值，host/client 会在 net 模块中切换
    netMode: 'single',      // 'single' | 'host' | 'client'
    netTick: 0,             // host 自增、client 镜像最近一次 SNAPSHOT 的 tick
    players: new Map(),     // peerId -> { id,name,color,x,y,facing,isMoving,animationTime,hp,maxHp,lastUpdate }
    selectedSlot: 0,
    selectedInventoryIndex: null,
    selectedWorldTarget: null,
    day: 1,
    time: 0.35,
    enemySpawnTimer: 8,
    camera: { x: 0, y: 0 },
    message: '',
    messageTimer: 0,
    hint: '',
    score: 0,
    lastTimestamp: 0,
    shake: 0,
    pointer: { x: 0, y: 0 },
    fishing: {
      active: false,
      phase: 'idle',
      x: 0,
      y: 0,
      tile: '',
      waitTimer: 0,
      reelWindow: 0,
      ripple: 0,
      animationTime: 0
    },
    mapMeta: {
      islandCount: 0,
      islands: [],
      loadedChunks: 0,
      queuedChunks: 0,
      minimapDirty: true
    }
  };

  const craftButtons = new Map();
  const keys = {};
  const HOTBAR = Array.from({ length: HOTBAR_SIZE }, (_, index) => ({ index }));

  function showMessage(text, duration = 2.3) {
    state.message = text;
    state.messageTimer = duration;
  }

  // 让 state.localPlayerId 成为 state.playerId 的别名，方便未来在多玩家代码中
  // 使用更准确的命名（"本地玩家"），同时保持原有所有 state.playerId 读写不变。
  Object.defineProperty(state, 'localPlayerId', {
    enumerable: false,
    configurable: false,
    get() { return state.playerId; },
    set(value) { state.playerId = value; }
  });

  Object.assign(game, {
    state,
    craftButtons,
    keys,
    HOTBAR,
    showMessage
  });
})(window.TidalIsle);
