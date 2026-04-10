(function (game) {
  const { randomBetween, spawnParticleEntity, getEnemyConfig, randomInt } = game;

  function burst(x, y, color, count, power = 54) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(power * 0.4, power);
      spawnParticleEntity(
        x,
        y,
        color,
        randomBetween(0.2, 0.45),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        randomBetween(2, 4)
      );
    }
  }

  function rollEnemyMeat(kind) {
    const config = getEnemyConfig(kind);
    if (!config) return 0;
    return randomInt(config.meatLoot[0], config.meatLoot[1]);
  }

  Object.assign(game, {
    burst,
    rollEnemyMeat
  });
})(window.TidalIsle);
