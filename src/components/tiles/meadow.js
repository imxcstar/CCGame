(function (game) {
  const { ctx } = game;

  game.tileComponentRegistry = game.tileComponentRegistry || {};
  game.tileComponentRegistry.meadow = {
    baseColor: '#4b8950',
    draw(screen) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(screen.x + 5, screen.y + 7, 2, 6);
      ctx.fillRect(screen.x + 13, screen.y + 10, 2, 5);
      ctx.fillRect(screen.x + 22, screen.y + 6, 2, 7);
    }
  };
})(window.TidalIsle);
