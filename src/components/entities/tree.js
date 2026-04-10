(function (game) {
  const { ctx } = game;

  game.entityComponentRegistry = game.entityComponentRegistry || {};
  game.entityComponentRegistry.tree = {
    hp: 10,
    radius: 18,
    respawn: 92,
    loot: { wood: [3, 5], fiber: [0, 1] },
    burst: { color: '#b98c56', count: 11 },
    canSpawn(tile, random) {
      return (tile === 'grass' || tile === 'meadow') && random > 0.88;
    },
    getDamage(tool) {
      if (tool === 'axe') return 4.2;
      if (tool === 'hands') return 1.4;
      return 1.1;
    },
    draw(view, screen) {
      ctx.save();
      if (view.hitTimer > 0) ctx.globalAlpha = 0.72;
      ctx.translate(screen.x, screen.y);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, view.radius - 2, view.radius * 0.9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6f4c2d';
      ctx.fillRect(-5, -8, 10, 28);
      ctx.fillStyle = '#2c6d3d';
      ctx.beginPath();
      ctx.arc(0, -16, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-12, -8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(12, -7, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3c8c50';
      ctx.beginPath();
      ctx.arc(1, -22, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
})(window.TidalIsle);
