(function (game) {
  const { dist, randomBetween, getPlayerSnapshot, createEnemyEntity, tileWalkable, tileAtWorld } = game;

  function spawnEnemy() {
    const player = getPlayerSnapshot();
    if (!player?.transform) return;

    for (let index = 0; index < 40; index++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(260, 420);
      const x = player.transform.x + Math.cos(angle) * radius;
      const y = player.transform.y + Math.sin(angle) * radius;
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
