(function (game) {
  const { ctx } = game;

  game.tileComponentRegistry = game.tileComponentRegistry || {};
  game.tileComponentRegistry.sand = {
    baseColor: '#b79f68',
    draw(screen) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(screen.x + 4, screen.y + 8, 4, 2);
      ctx.fillRect(screen.x + 20, screen.y + 18, 3, 2);
    }
  };
})(window.TidalIsle);
