(function (game) {
  function render() {
    game.renderScene();
  }

  Object.assign(game, {
    render
  });
})(window.TidalIsle);
