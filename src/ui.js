(function (game) {
  function initUi() {
    game.createCraftButtons();
    game.bindInventoryUi();
    game.bindOverlayButtons();
    game.bindMobileControls?.();
  }

  Object.assign(game, {
    initUi
  });
})(window.TidalIsle);
