(function (game) {
  const { ctx } = game;

  game.entityComponentRegistry = game.entityComponentRegistry || {};
  game.entityComponentRegistry.rock = {
    hp: 11,
    radius: 16,
    respawn: 108,
    loot: { stone: [3, 5] },
    burst: { color: '#cfd8d6', count: 10 },
    canSpawn(tile, random) {
      return (tile === 'grass' || tile === 'meadow' || tile === 'stone') && random > 0.81 && random < 0.86;
    },
    getDamage(tool) {
      if (tool === 'pickaxe') return 4.1;
      if (tool === 'hands') return 0.8;
      return 1.4;
    },
    draw(view, screen) {
      ctx.save();
      if (view.hitTimer > 0) ctx.globalAlpha = 0.72;
      ctx.translate(screen.x, screen.y);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, view.radius - 2, view.radius * 0.9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#98a29f';
      ctx.beginPath();
      ctx.moveTo(-16, 10);
      ctx.lineTo(-12, -4);
      ctx.lineTo(-4, -14);
      ctx.lineTo(11, -10);
      ctx.lineTo(15, 2);
      ctx.lineTo(9, 12);
      ctx.lineTo(-6, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#cad2cf';
      ctx.fillRect(-5, -4, 10, 3);
      ctx.restore();
    }
  };
})(window.TidalIsle);
