(function (game) {
  const TILE_COMPONENTS = {
    ...(game.tileComponentRegistry || {})
  };

  Object.assign(game, {
    TILE_COMPONENTS
  });
})(window.TidalIsle);
