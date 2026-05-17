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
    // 是否支持调整方向（0..3 共 4 个方向，每次旋转 90°）。
    // drawStructureSprite 会根据该标记和 structure.rotation 统一应用 ctx.rotate。
    supportsRotation: true,
    initialState() {
      return { rotation: 0 };
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
