(function (game) {
  const ENTITY_COMPONENTS = {
    ...(game.entityComponentRegistry || {})
  };

  Object.assign(game, {
    ENTITY_COMPONENTS
  });
})(window.TidalIsle);
