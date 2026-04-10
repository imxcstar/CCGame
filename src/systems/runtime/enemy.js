(function (game) {
  const {
    state,
    dist,
    randomBetween,
    getComponent,
    destroyEntity,
    getEnemyConfig,
    getPlayerSnapshot,
    getStructureIds,
    getEnemyIds,
    moveActorEntity,
    burst,
    getDaylight,
    isNight,
    handleEnemyDeath,
    spawnEnemy
  } = game;

  function updateEnemySystem(dt) {
    if (isNight()) {
      state.enemySpawnTimer -= dt;
      const limit = 4 + Math.min(8, state.day * 2);
      if (state.enemySpawnTimer <= 0 && getEnemyIds().length < limit) {
        spawnEnemy();
        state.enemySpawnTimer = randomBetween(4.5, 8.5);
      }
    } else {
      state.enemySpawnTimer = Math.max(state.enemySpawnTimer, 2.4);
    }

    const player = getPlayerSnapshot();
    if (!player?.transform || !player.player || !player.health) return;

    for (const enemyId of [...getEnemyIds()]) {
      const transform = getComponent(enemyId, 'transform');
      const health = getComponent(enemyId, 'health');
      const enemy = getComponent(enemyId, 'enemy');
      if (!transform || !health || !enemy) continue;

      const config = getEnemyConfig(enemy.kind);
      if (!config) continue;

      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      enemy.wanderTime -= dt;
      health.hitTimer = Math.max(0, health.hitTimer - dt);

      if (getDaylight() > 0.62) {
        health.hp -= dt * config.sunlightDamage;
      }

      const distance = dist(transform.x, transform.y, player.transform.x, player.transform.y);
      let angle = enemy.wanderAngle;
      let speedFactor = 0.48;

      if (distance < 220 || isNight()) {
        angle = Math.atan2(player.transform.y - transform.y, player.transform.x - transform.x);
        speedFactor = 1;
      } else if (enemy.wanderTime <= 0) {
        enemy.wanderAngle = Math.random() * Math.PI * 2;
        enemy.wanderTime = randomBetween(1.4, 3.1);
        angle = enemy.wanderAngle;
      }

      moveActorEntity(enemyId, Math.cos(angle) * enemy.speed * speedFactor * dt, Math.sin(angle) * enemy.speed * speedFactor * dt);

      const wallId = getStructureIds().find((structureId) => {
        const wallTransform = getComponent(structureId, 'transform');
        const structure = getComponent(structureId, 'structure');
        return wallTransform && structure?.kind === 'wall' && dist(transform.x, transform.y, wallTransform.x, wallTransform.y) < 24;
      });

      if (wallId) {
        const wallTransform = getComponent(wallId, 'transform');
        const wallHealth = getComponent(wallId, 'health');
        if (wallTransform && wallHealth) {
          wallHealth.hp -= dt * 5.5;
          if (wallHealth.hp <= 0) {
            burst(wallTransform.x, wallTransform.y, '#d5b287', 12, 55);
            destroyEntity(wallId);
          }
        }
      }

      if (distance < 28 && enemy.cooldown <= 0) {
        enemy.cooldown = config.attackCooldown;
        player.health.hp = Math.max(0, player.health.hp - config.playerDamage);
        player.player.hurtTimer = 0.35;
        state.shake = Math.max(state.shake, 8);
        const knockback = Math.atan2(player.transform.y - transform.y, player.transform.x - transform.x);
        moveActorEntity(state.playerId, Math.cos(knockback) * 14, Math.sin(knockback) * 14);
        burst(player.transform.x, player.transform.y, '#ff8596', 10, 72);
      }

      if (health.hp <= 0) {
        handleEnemyDeath(enemyId);
      }
    }
  }

  Object.assign(game, {
    updateEnemySystem
  });
})(window.TidalIsle);
