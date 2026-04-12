(function (game) {
  const {
    state,
    ATTACK_RANGE,
    screenToWorld,
    dist,
    angleDelta,
    showMessage,
    setScore,
    addInventory,
    getComponent,
    destroyEntity,
    removeChunkEnemyEntity,
    getEntityConfig,
    getEnemyConfig,
    getPlayerSnapshot,
    getResourceIds,
    getEnemyIds,
    burst,
    rollEnemyMeat,
    moveActorEntity
  } = game;

  function getEnemyDamage(tool, entityId) {
    const enemy = getComponent(entityId, 'enemy');
    if (!enemy) return 1.2;
    return getEnemyConfig(enemy.kind)?.getDamage?.(tool) ?? 1.2;
  }

  function handleEnemyDeath(entityId) {
    const transform = getComponent(entityId, 'transform');
    const enemy = getComponent(entityId, 'enemy');
    if (!transform || !enemy) return;

    const meat = rollEnemyMeat(enemy.kind);
    burst(transform.x, transform.y, '#ffd37c', 10, 70);
    if (meat > 0) {
      const result = addInventory({ meat });
      const gained = result.added.meat || 0;
      if (gained > 0) showMessage('+' + gained + ' 熟肉');
      else showMessage('背包已满，没能带走熟肉');
    }
    setScore();
    removeChunkEnemyEntity?.(entityId);
    destroyEntity(entityId);
  }

  function hitEnemy(entityId, damage) {
    const player = getPlayerSnapshot();
    const transform = getComponent(entityId, 'transform');
    const health = getComponent(entityId, 'health');
    if (!player?.transform || !transform || !health) return;

    health.hp -= damage;
    health.hitTimer = 0.18;
    burst(transform.x, transform.y, '#ff7a8d', 7, 62);

    const angle = Math.atan2(transform.y - player.transform.y, transform.x - player.transform.x);
    moveActorEntity(entityId, Math.cos(angle) * 10, Math.sin(angle) * 10);

    if (health.hp <= 0) {
      handleEnemyDeath(entityId);
    }
  }

  function getAttackTarget() {
    const player = getPlayerSnapshot();
    if (!player?.transform) return null;

    const pointerWorld = screenToWorld(state.pointer.x, state.pointer.y);
    const aim = Math.atan2(pointerWorld.y - player.transform.y, pointerWorld.x - player.transform.x);
    let best = null;
    let bestScore = Infinity;

    for (const entityId of getResourceIds()) {
      const transform = getComponent(entityId, 'transform');
      const collider = getComponent(entityId, 'collider');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (!transform || !collider || !resourceNode?.alive) continue;

      const distance = dist(player.transform.x, player.transform.y, transform.x, transform.y);
      if (distance > ATTACK_RANGE + collider.radius) continue;
      const angle = Math.abs(angleDelta(aim, Math.atan2(transform.y - player.transform.y, transform.x - player.transform.x)));
      if (angle > 1.1 && distance > 32) continue;

      const score = distance + angle * 24;
      if (score < bestScore) {
        best = { group: 'resource', id: entityId };
        bestScore = score;
      }
    }

    for (const entityId of getEnemyIds()) {
      const transform = getComponent(entityId, 'transform');
      const collider = getComponent(entityId, 'collider');
      if (!transform || !collider) continue;

      const distance = dist(player.transform.x, player.transform.y, transform.x, transform.y);
      if (distance > ATTACK_RANGE + collider.radius) continue;
      const angle = Math.abs(angleDelta(aim, Math.atan2(transform.y - player.transform.y, transform.x - player.transform.x)));
      if (angle > 1.3 && distance > 30) continue;

      const score = distance + angle * 20 - 6;
      if (score < bestScore) {
        best = { group: 'enemy', id: entityId };
        bestScore = score;
      }
    }

    return best;
  }

  Object.assign(game, {
    getEnemyDamage,
    handleEnemyDeath,
    hitEnemy,
    getAttackTarget
  });
})(window.TidalIsle);
