(function (game) {
  const { ctx } = game;

  game.structureComponentRegistry = game.structureComponentRegistry || {};
  game.structureComponentRegistry.planter = {
    name: '种植箱',
    cost: { wood: 4, fiber: 3 },
    hp: 20,
    radius: 18,
    collisionRadius: 12,
    shadowRadius: 15,
    initialState() {
      return { crop: null, growth: 0, ready: false };
    },
    draw(structure) {
      ctx.fillStyle = '#8c6845';
      ctx.fillRect(-14, -8, 28, 18);
      ctx.fillStyle = '#6d4f34';
      ctx.fillRect(-16, -10, 32, 4);
      ctx.fillStyle = '#5a3b26';
      ctx.fillRect(-16, 8, 32, 4);
      ctx.fillStyle = '#5f422c';
      ctx.fillRect(-12, -4, 24, 12);

      if (structure.crop !== 'pumpkin') return;

      if (structure.ready) {
        ctx.fillStyle = '#d6762f';
        ctx.beginPath();
        ctx.arc(0, -2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7cbf59';
        ctx.fillRect(-1.5, -12, 3, 8);
        ctx.beginPath();
        ctx.ellipse(-5, -12, 6, 3, -0.45, 0, Math.PI * 2);
        ctx.ellipse(5, -11, 6, 3, 0.45, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const growth = Math.max(0, Math.min(1, structure.growth || 0));
      const stemHeight = 5 + growth * 10;
      ctx.fillStyle = '#7cbf59';
      ctx.fillRect(-1.5, 8 - stemHeight, 3, stemHeight);
      ctx.beginPath();
      ctx.ellipse(-4, 5 - stemHeight * 0.55, 4 + growth * 2, 2.4, -0.45, 0, Math.PI * 2);
      ctx.ellipse(4, 3 - stemHeight * 0.35, 4 + growth * 2, 2.4, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  };
})(window.TidalIsle);
