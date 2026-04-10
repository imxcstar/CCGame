(function (game) {
  const { WORLD_SIZE, TILE, dist, randomBetween, getPlayerSnapshot, createEnemyEntity, tileWalkable, tileAtWorld } = game;

  function spawnEnemy() {
    const player = getPlayerSnapshot();
    if (!player?.transform) return;

    const center = WORLD_SIZE * TILE * 0.5;
    for (let index = 0; index < 24; index++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = WORLD_SIZE * TILE * randomBetween(0.26, 0.34);
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      if (!tileWalkable(tileAtWorld(x, y))) continue;
      if (dist(x, y, player.transform.x, player.transform.y) < 220) continue;

      createEnemyEntity('crawler', x, y);
      return;
    }
  }

  Object.assign(game, {
    spawnEnemy
  });
})(window.TidalIsle);
