(function (game) {
  const { ctx } = game;

  game.structureComponentRegistry = game.structureComponentRegistry || {};
  game.structureComponentRegistry.wall = {
    name: '木墙',
    cost: { wood: 3, stone: 1 },
    hp: 20,
    radius: 16,
    collisionRadius: 12,
    shadowRadius: 18,
    initialState() {
      return {};
    },
    draw() {
      ctx.fillStyle = '#8a6442';
      ctx.fillRect(-14, -12, 28, 24);
      ctx.fillStyle = '#c89a68';
      ctx.fillRect(-10, -12, 4, 24);
      ctx.fillRect(-2, -12, 4, 24);
      ctx.fillRect(6, -12, 4, 24);
    }
  };
})(window.TidalIsle);
