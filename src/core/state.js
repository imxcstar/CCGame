(function (game) {
  const { HOTBAR_SIZE } = game;

  const state = {
    running: false,
    over: false,
    seed: 0,
    world: [],
    playerId: null,
    selectedSlot: 0,
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
    }
  };

  const craftButtons = new Map();
  const keys = {};
  const HOTBAR = Array.from({ length: HOTBAR_SIZE }, (_, index) => ({ index }));

  function showMessage(text, duration = 2.3) {
    state.message = text;
    state.messageTimer = duration;
  }

  Object.assign(game, {
    state,
    craftButtons,
    keys,
    HOTBAR,
    showMessage
  });
})(window.TidalIsle);
