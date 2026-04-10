(function (game) {
  const factories = {
    createPlayerEntity: (...args) => game.createPlayerEntity(...args),
    createResourceEntity: (...args) => game.createResourceEntity(...args),
    createStructureEntity: (...args) => game.createStructureEntity(...args),
    createEnemyEntity: (...args) => game.createEnemyEntity(...args),
    spawnParticleEntity: (...args) => game.spawnParticleEntity(...args),
    burst: (...args) => game.burst(...args)
  };

  Object.assign(game, {
    factories
  });
})(window.TidalIsle);
