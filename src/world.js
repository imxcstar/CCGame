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
    state.over = false;
    state.running = false;
    state.playerId = null;
    state.message = '';
    state.messageTimer = 0;
    state.hint = '';
    state.score = 0;
    state.shake = 0;
    state.lastTimestamp = 0;

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
    dom.gameOverText.textContent = `你撑到了第 ${state.day} 天 ${getTimeLabel()}，最终评分 ${state.score}。重新整理营地，再试一次。`;
    dom.gameOverOverlay.classList.add('show');
  }

  function update(dt, activeKeys) {
    if (!state.playerId) return;

    state.time += dt / DAY_LENGTH;
    if (state.time >= 1) {
      state.time -= 1;
      state.day += 1;
      showMessage('天亮了：第 ' + state.day + ' 天');
    }

    game.updatePlayerSystem?.(dt, activeKeys);
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
