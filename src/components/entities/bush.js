(function (game) {
  const { ctx } = game;

  game.entityComponentRegistry = game.entityComponentRegistry || {};
  game.entityComponentRegistry.bush = {
    hp: 5,
    radius: 14,
    respawn: 58,
    loot: { fiber: [2, 4], berry: [1, 3] },
    burst: { color: '#7fda7d', count: 8 },
    canSpawn(tile, random) {
      return (tile === 'grass' || tile === 'meadow') && random > 0.73 && random < 0.79;
    },
    getDamage(tool) {
      if (tool === 'hands') return 2.5;
      return 2.1;
    },
    draw(view, screen) {
      ctx.save();
      if (view.hitTimer > 0) ctx.globalAlpha = 0.72;
      ctx.translate(screen.x, screen.y);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, view.radius - 2, view.radius * 0.9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#347646';
      ctx.beginPath();
      ctx.arc(-7, 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(7, 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -4, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff7f8a';
      ctx.beginPath();
      ctx.arc(-4, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, 4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(1, 6, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
})(window.TidalIsle);
