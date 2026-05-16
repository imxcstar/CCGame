(function (game) {
  const { state, view, dist, randomBetween, getPlayerSnapshot, createEnemyEntity, tileWalkable, tileAtWorld } = game;

  function spawnEnemy() {
    const player = getPlayerSnapshot();
    if (!player?.transform) return;

    // 至少要让生成点落在当前视口之外：取视口半对角线 + 一定缓冲，确保怪物不会
    // 在玩家眼前"突然出现"，而是从画面外移动进来。
    const viewRadius = Math.hypot(view.width, view.height) * 0.5;
    const minRadius = viewRadius + 80;
    const maxRadius = minRadius + 220;

    for (let index = 0; index < 60; index++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(minRadius, maxRadius);
      // 相对相机（≈视口中心）取生成位置，保证一定在画面之外
      const x = state.camera.x + Math.cos(angle) * radius;
      const y = state.camera.y + Math.sin(angle) * radius;
      if (!tileWalkable(tileAtWorld(x, y))) continue;
      if (dist(x, y, player.transform.x, player.transform.y) < minRadius) continue;

      createEnemyEntity('crawler', x, y);
      return;
    }
  }

  Object.assign(game, {
    spawnEnemy
  });
})(window.TidalIsle);
