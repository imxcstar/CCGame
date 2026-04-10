(function (game) {
  const {
    RESOURCE_NAMES,
    randomBetween,
    rollLoot,
    addInventory,
    canStoreAllItems,
    showMessage,
    getComponent,
    getEntityConfig,
    getPlayerSnapshot,
    burst
  } = game;

  function getResourceDamage(tool, entityId) {
    const resourceNode = getComponent(entityId, 'resourceNode');
    if (!resourceNode) return 1.2;
    return getEntityConfig(resourceNode.kind)?.getDamage?.(tool) ?? 1.2;
  }

  function harvestResource(entityId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(entityId, 'transform');
    const health = getComponent(entityId, 'health');
    const resourceNode = getComponent(entityId, 'resourceNode');
    if (!player?.inventory || !transform || !health || !resourceNode) return;

    const config = getEntityConfig(resourceNode.kind);
    if (!config) return;

    const loot = rollLoot(config.loot);
    if (Object.keys(loot).length > 0 && !canStoreAllItems(player.inventory, loot)) {
      health.hp = Math.max(1, health.hp);
      health.hitTimer = 0.1;
      showMessage('背包空间不足');
      return;
    }

    resourceNode.alive = false;
    resourceNode.respawnTimer = config.respawn * randomBetween(0.85, 1.2);
    health.hp = 0;
    health.hitTimer = 0;

    const result = addInventory(loot);
    if (config.burst) burst(transform.x, transform.y, config.burst.color, config.burst.count);

    const text = Object.entries(result.added)
      .map(([key, value]) => '+' + value + ' ' + RESOURCE_NAMES[key])
      .join(' ');

    showMessage(text || '采集完成');
  }

  Object.assign(game, {
    getResourceDamage,
    harvestResource
  });
})(window.TidalIsle);
