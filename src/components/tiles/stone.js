(function (game) {
  const { ctx } = game;

  game.tileComponentRegistry = game.tileComponentRegistry || {};
  game.tileComponentRegistry.stone = {
    baseColor: '#606a63',
    draw(screen) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(screen.x + 7, screen.y + 8, 10, 4);
      ctx.fillRect(screen.x + 18, screen.y + 18, 6, 3);
    }
  };
})(window.TidalIsle);
