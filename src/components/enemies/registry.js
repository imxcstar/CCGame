(function (game) {
  const ENEMY_COMPONENTS = {
    ...(game.enemyComponentRegistry || {})
  };

  Object.assign(game, {
    ENEMY_COMPONENTS
  });
})(window.TidalIsle);
