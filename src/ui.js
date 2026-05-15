(function (game) {
  function initUi() {
    game.createCraftButtons();
    game.bindInventoryUi();
    game.bindOverlayButtons();
    game.bindMobileControls?.();
    game.bindMultiplayerUi?.();
  }

  Object.assign(game, {
    initUi
  });
})(window.TidalIsle);
