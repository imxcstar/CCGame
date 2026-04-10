(function (game) {
  const { ctx } = game;

  game.entityComponentRegistry = game.entityComponentRegistry || {};
  game.entityComponentRegistry.palm = {
    hp: 8,
    radius: 18,
    respawn: 86,
    loot: { wood: [2, 4], coconut: [1, 2] },
    burst: { color: '#b98c56', count: 11 },
    canSpawn(tile, random) {
      return tile === 'sand' && random > 0.93;
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
      ctx.fillStyle = '#84613f';
      ctx.fillRect(-4, -4, 8, 24);
      ctx.fillStyle = '#3b8a53';
      for (let index = 0; index < 5; index++) {
        const angle = -Math.PI * 0.5 + index * 0.55 - 1.1;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18 - 10);
        ctx.lineTo(Math.cos(angle + 0.2) * 7, Math.sin(angle + 0.2) * 7 - 6);
        ctx.fill();
      }
      ctx.fillStyle = '#6a4a2a';
      ctx.beginPath();
      ctx.arc(0, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
})(window.TidalIsle);
