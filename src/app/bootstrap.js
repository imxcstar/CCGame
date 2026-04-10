(function (game) {
  const { state, view, resize } = game;

  function initApp() {
    resize();
    state.pointer.x = view.width * 0.5;
    state.pointer.y = view.height * 0.5;
    game.initUi?.();
    game.newGame?.();
    game.updateUI?.();
    game.render?.();
  }

  Object.assign(game, {
    initApp
  });
})(window.TidalIsle);
