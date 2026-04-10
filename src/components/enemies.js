(function (game) {
  const { getComponent, ENEMY_COMPONENTS } = game;

  function getEnemyConfig(kind) {
    return ENEMY_COMPONENTS[kind] || null;
  }

  function drawEnemySprite(entityId, screen) {
    const transform = getComponent(entityId, 'transform');
    const enemy = getComponent(entityId, 'enemy');
    const health = getComponent(entityId, 'health');
    if (!transform || !enemy || !health) return;

    const component = getEnemyConfig(enemy.kind);
    if (!component?.draw) return;

    component.draw(
      {
        x: transform.x,
        y: transform.y,
        hitTimer: health.hitTimer
      },
      screen
    );
  }

  Object.assign(game, {
    getEnemyConfig,
    drawEnemySprite
  });
})(window.TidalIsle);
