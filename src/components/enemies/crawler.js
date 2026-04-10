(function (game) {
  const { ctx } = game;

  game.enemyComponentRegistry = game.enemyComponentRegistry || {};
  game.enemyComponentRegistry.crawler = {
    radius: 13,
    baseHp: 9,
    hpPerDay: 0.8,
    speedBase: 68,
    speedPerDay: 2.6,
    attackCooldown: 1.1,
    playerDamage: 9,
    sunlightDamage: 5.4,
    meatLoot: [1, 2],
    getDamage(tool) {
      if (tool === 'spear') return 4.3;
      if (tool === 'axe') return 2.2;
      if (tool === 'pickaxe') return 1.8;
      return 1.2;
    },
    draw(view, screen) {
      ctx.save();
      if (view.hitTimer > 0) ctx.globalAlpha = 0.72;
      ctx.translate(screen.x, screen.y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a1730';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b5264b';
      ctx.beginPath();
      ctx.arc(0, -3, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f66a8b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, 5);
      ctx.lineTo(-20, 10);
      ctx.moveTo(13, 5);
      ctx.lineTo(20, 10);
      ctx.moveTo(-10, 10);
      ctx.lineTo(-16, 16);
      ctx.moveTo(10, 10);
      ctx.lineTo(16, 16);
      ctx.stroke();
      ctx.fillStyle = '#fff1f3';
      ctx.fillRect(-5, -5, 3, 3);
      ctx.fillRect(2, -5, 3, 3);
      ctx.restore();
    }
  };
})(window.TidalIsle);
