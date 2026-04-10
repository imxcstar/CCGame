(function (game) {
  const { state, dist, moveActorEntity, getStructureIds, getComponent, getPlayerSnapshot, isNight } = game;

  function updatePlayerSystem(dt, activeKeys) {
    const player = getPlayerSnapshot();
    if (!player?.transform || !player.player || !player.survival || !player.health) return;

    player.player.attackCooldown = Math.max(0, player.player.attackCooldown - dt);
    player.player.hurtTimer = Math.max(0, player.player.hurtTimer - dt);
    player.health.hitTimer = Math.max(0, player.health.hitTimer - dt);

    let moveX = (activeKeys.KeyD ? 1 : 0) - (activeKeys.KeyA ? 1 : 0);
    let moveY = (activeKeys.KeyS ? 1 : 0) - (activeKeys.KeyW ? 1 : 0);
    const length = Math.hypot(moveX, moveY) || 1;
    moveX /= length;
    moveY /= length;

    let speed = player.player.speed;
    if ((activeKeys.ShiftLeft || activeKeys.ShiftRight) && player.survival.energy > 2 && (moveX || moveY)) {
      speed = player.player.sprint;
      player.survival.energy = Math.max(0, player.survival.energy - dt * 24);
    } else {
      player.survival.energy = Math.min(100, player.survival.energy + dt * 16);
    }

    moveActorEntity(state.playerId, moveX * speed * dt, moveY * speed * dt);

    player.survival.hunger = Math.max(0, player.survival.hunger - dt * 0.22);
    player.survival.thirst = Math.max(0, player.survival.thirst - dt * 0.31);

    if (player.survival.hunger <= 0 || player.survival.thirst <= 0) {
      player.health.hp = Math.max(0, player.health.hp - dt * 4.5);
    }

    const nearLitCampfire = getStructureIds().some((structureId) => {
      const transform = getComponent(structureId, 'transform');
      const structure = getComponent(structureId, 'structure');
      return transform && structure?.kind === 'campfire' && structure.fuel > 0 && dist(player.transform.x, player.transform.y, transform.x, transform.y) < 90;
    });

    if (nearLitCampfire && isNight() && player.survival.hunger > 8 && player.survival.thirst > 8) {
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + dt * 1.5);
      player.survival.energy = Math.min(100, player.survival.energy + dt * 20);
    }
  }

  Object.assign(game, {
    updatePlayerSystem
  });
})(window.TidalIsle);
