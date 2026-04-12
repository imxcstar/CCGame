(function (game) {
  const { getStructureIds, getComponent, randomBetween, burst, destroyEntity, spawnParticleEntity, isNight, removeChunkStructureEntity } = game;

  function updateStructureSystem(dt) {
    for (const structureId of [...getStructureIds()]) {
      const transform = getComponent(structureId, 'transform');
      const health = getComponent(structureId, 'health');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !health || !structure) continue;

      health.hitTimer = Math.max(0, health.hitTimer - dt);

      if (structure.kind === 'campfire') {
        structure.fuel = Math.max(0, (structure.fuel || 0) - dt * 0.7);
        if (structure.fuel > 0 && Math.random() < 0.28) {
          spawnParticleEntity(
            transform.x + randomBetween(-5, 5),
            transform.y - 6,
            '#ffbf66',
            randomBetween(0.35, 0.8),
            randomBetween(-6, 6),
            randomBetween(-28, -14),
            randomBetween(2, 4)
          );
        }
      }

      if (structure.kind === 'collector') {
        structure.fill = (structure.fill || 0) + dt * (isNight() ? 0.56 : 0.3);
        if (structure.fill >= 18) {
          structure.fill = 0;
          structure.water = Math.min(4, (structure.water || 0) + 1);
        }
      }

      if (health.hp <= 0) {
        burst(transform.x, transform.y, '#d5b287', 12, 55);
        removeChunkStructureEntity?.(structureId);
        destroyEntity(structureId);
      }
    }
  }

  Object.assign(game, {
    updateStructureSystem
  });
})(window.TidalIsle);
