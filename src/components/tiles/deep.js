(function (game) {
  const { ctx, TILE } = game;

  game.tileComponentRegistry = game.tileComponentRegistry || {};
  game.tileComponentRegistry.deep = {
    baseColor: '#08304d',
    draw(screen, tileX, tileY, now) {
      const wave = Math.sin((tileX * 0.6 + tileY * 0.4 + now * 0.002) * 0.8) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(145, 210, 255, ${0.05 + wave * 0.08})`;
      ctx.fillRect(screen.x + 3, screen.y + 5 + wave * 4, TILE - 6, 3);
    }
  };
})(window.TidalIsle);
