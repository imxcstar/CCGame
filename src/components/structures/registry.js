(function (game) {
  const STRUCTURE_COMPONENTS = {
    ...(game.structureComponentRegistry || {})
  };

  Object.assign(game, {
    STRUCTURE_COMPONENTS
  });
})(window.TidalIsle);
