(function (game) {
  function initUi() {
    game.createCraftButtons();
    game.bindInventoryUi();
    game.bindOverlayButtons();
  }

  Object.assign(game, {
    initUi
  });
})(window.TidalIsle);
