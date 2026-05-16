(function (game) {
  const {
    state,
    dom,
    DAY_LENGTH,
    lerp,
    showMessage,
    setScore,
    randomSeed,
    createWorld,
    createPlayerEntity,
    getComponent,
    getTimeLabel
  } = game;

  function newGame(options = {}) {
    state.seed = typeof options.seed === 'number' ? options.seed : randomSeed();
    state.day = typeof options.day === 'number' ? options.day : 1;
    state.time = typeof options.time === 'number' ? options.time : 0.35;
    state.enemySpawnTimer = 8;
    state.selectedSlot = 0;
    state.selectedInventoryIndex = null;
    state.selectedWorldTarget = null;
    state.over = false;
    state.running = false;
    state.playerId = null;
    state.world = null;
    state.worldAge = 0;
    state.message = '';
    state.messageTimer = 0;
    state.hint = '';
    state.score = 0;
    state.shake = 0;
    if (Array.isArray(state.floaters)) state.floaters.length = 0;
    state.lastTimestamp = 0;
    // 远端玩家 ghost 由网络模块维护；新开局先清空，避免残留旧房间的影子。
    if (state.players && typeof state.players.clear === 'function') {
      state.players.clear();
    }
    state.netTick = 0;
    state.fishing = {
      active: false,
      phase: 'idle',
      x: 0,
      y: 0,
      tile: '',
      waitTimer: 0,
      reelWindow: 0,
      ripple: 0,
      animationTime: 0
    };
    state.mapMeta = {
      islandCount: 0,
      islands: [],
      loadedChunks: 0,
      queuedChunks: 0,
      minimapDirty: true
    };

    const spawn = createWorld();
    state.playerId = createPlayerEntity(spawn.x, spawn.y);
    state.camera.x = spawn.x;
    state.camera.y = spawn.y;
    setScore();

    if (typeof game.updateUI === 'function') {
      game.updateUI();
    }
  }

  function endGame() {
    state.over = true;
    state.running = false;
    if (state.fishing) state.fishing.active = false;
    dom.gameOverText.textContent = `你撑到了第 ${state.day} 天 ${getTimeLabel()}，最终评分 ${state.score}。重新整理营地，再试一次。`;
    dom.gameOverOverlay.classList.add('show');
    game.playSound?.('gameover');
  }

  function update(dt, activeKeys) {
    if (!state.playerId) return;

    state.worldAge += dt;

    const isClient = state.netMode === 'client';

    // 时间推进是世界权威系统：在 client 模式由 SNAPSHOT 同步，不在本地推进。
    if (!isClient) {
      state.time += dt / DAY_LENGTH;
      if (state.time >= 1) {
        state.time -= 1;
        state.day += 1;
        showMessage('天亮了：第 ' + state.day + ' 天');
      }
    }

    // 本地玩家移动 / 视角 / 钓鱼这些"输入相关"系统在所有模式下都跑，
    // 保证手感（client 端做本地预测）。
    game.updatePlayerSystem?.(dt, activeKeys);
    game.updateChunkStreamingSystem?.(dt);
    game.updateFishingSystem?.(dt);

    // 资源刷新 / 敌人 AI / 建筑结算 这些是世界权威系统：
    // - 单机 / Host：本地执行
    // - Client：交给 Host，本地只看 SNAPSHOT；避免与 Host 双向漂移。
    if (!isClient) {
      game.updateResourceRespawnSystem?.(dt);
      game.updateEnemySystem?.(dt);
      game.updateStructureSystem?.(dt);
    }

    // 粒子是纯视觉，所有模式都跑
    game.updateParticleSystem?.(dt);
    game.updateFloaterSystem?.(dt);
    game.updateHintSystem?.();
    setScore();

    // 网络模块的 tick 钩子（host 广播 / client 上行输入）
    game.netHostTick?.(dt);
    game.netClientTick?.(dt);

    const playerTransform = getComponent(state.playerId, 'transform');
    if (playerTransform) {
      state.camera.x = lerp(state.camera.x, playerTransform.x, 0.08);
      state.camera.y = lerp(state.camera.y, playerTransform.y, 0.08);
    }

    state.shake = Math.max(0, state.shake - dt * 18);

    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }

    const playerHealth = getComponent(state.playerId, 'health');
    if (playerHealth && playerHealth.hp <= 0) endGame();

    if (typeof game.updateUI === 'function') {
      game.updateUI();
    }
  }

  Object.assign(game, {
    newGame,
    endGame,
    update
  });
})(window.TidalIsle);
