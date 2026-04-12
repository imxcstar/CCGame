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

  function newGame() {
    state.seed = randomSeed();
    state.day = 1;
    state.time = 0.35;
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
    state.lastTimestamp = 0;
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
  }

  function update(dt, activeKeys) {
    if (!state.playerId) return;

    state.worldAge += dt;
    state.time += dt / DAY_LENGTH;
    if (state.time >= 1) {
      state.time -= 1;
      state.day += 1;
      showMessage('天亮了：第 ' + state.day + ' 天');
    }

    game.updatePlayerSystem?.(dt, activeKeys);
    game.updateChunkStreamingSystem?.(dt);
    game.updateFishingSystem?.(dt);
    game.updateResourceRespawnSystem?.(dt);
    game.updateEnemySystem?.(dt);
    game.updateStructureSystem?.(dt);
    game.updateParticleSystem?.(dt);
    game.updateHintSystem?.();
    setScore();

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
