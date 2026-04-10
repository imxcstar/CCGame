(function (game) {
  const { getResourceIds, getComponent, getEntityConfig } = game;

  function updateResourceRespawnSystem(dt) {
    for (const entityId of getResourceIds()) {
      const health = getComponent(entityId, 'health');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (!health || !resourceNode) continue;

      health.hitTimer = Math.max(0, health.hitTimer - dt);
      if (resourceNode.alive) continue;

      resourceNode.respawnTimer -= dt;
      if (resourceNode.respawnTimer > 0) continue;

      const config = getEntityConfig(resourceNode.kind);
      if (!config) continue;
      resourceNode.alive = true;
      resourceNode.respawnTimer = 0;
      health.hp = config.hp;
      health.maxHp = config.hp;
      health.hitTimer = 0;
    }
  }

  Object.assign(game, {
    updateResourceRespawnSystem
  });
})(window.TidalIsle);
