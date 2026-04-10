(function (game) {
  const { ctx } = game;

  game.structureComponentRegistry = game.structureComponentRegistry || {};
  game.structureComponentRegistry.collector = {
    name: '雨水收集器',
    cost: { wood: 4, fiber: 4, stone: 2 },
    hp: 18,
    radius: 18,
    shadowRadius: 15,
    initialState() {
      return { water: 1, fill: 0 };
    },
    draw(structure) {
      ctx.fillStyle = '#7d5e41';
      ctx.fillRect(-13, -10, 26, 20);
      ctx.fillStyle = '#6bd7ff';
      const waterHeight = 4 + structure.water * 3;
      ctx.fillRect(-11, 10 - waterHeight, 22, waterHeight);
      ctx.fillStyle = '#d2dce4';
      ctx.beginPath();
      ctx.moveTo(-14, -10);
      ctx.lineTo(0, -20);
      ctx.lineTo(14, -10);
      ctx.closePath();
      ctx.fill();
    }
  };
})(window.TidalIsle);
