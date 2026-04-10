(function (game) {
  const { ctx } = game;

  game.structureComponentRegistry = game.structureComponentRegistry || {};
  game.structureComponentRegistry.floor = {
    name: '木地板',
    cost: { wood: 2 },
    hp: 14,
    radius: 0,
    shadowRadius: 15,
    initialState() {
      return {};
    },
    canOverlap(otherKind) {
      return otherKind === 'floor';
    },
    draw() {
      ctx.fillStyle = '#8d6741';
      ctx.fillRect(-14, -14, 28, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-12, -8, 24, 2);
      ctx.fillRect(-12, 0, 24, 2);
      ctx.fillRect(-12, 8, 24, 2);
    }
  };
})(window.TidalIsle);
