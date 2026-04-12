(function (game) {
  const { ctx } = game;

  game.structureComponentRegistry = game.structureComponentRegistry || {};
  game.structureComponentRegistry.campfire = {
    name: '篝火',
    cost: { wood: 5, stone: 4 },
    hp: 18,
    radius: 18,
    collisionRadius: 11,
    shadowRadius: 15,
    initialState() {
      return { fuel: 72 };
    },
    getLight(structure) {
      if (structure.fuel <= 0) return null;
      return { radius: 200, strength: 0.92 };
    },
    draw(structure) {
      ctx.fillStyle = '#7f6e64';
      for (let index = 0; index < 6; index++) {
        const angle = (Math.PI * 2 * index) / 6;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 9, Math.sin(angle) * 5 + 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#6b4428';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 11);
      ctx.lineTo(0, -2);
      ctx.lineTo(8, 11);
      ctx.stroke();
      if (structure.fuel > 0) {
        ctx.fillStyle = '#ffdc85';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.quadraticCurveTo(8, 2, 0, 10);
        ctx.quadraticCurveTo(-9, 1, 0, -10);
        ctx.fill();
        ctx.fillStyle = '#ff8f5f';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.quadraticCurveTo(4, 2, 0, 7);
        ctx.quadraticCurveTo(-5, 1, 0, -6);
        ctx.fill();
      }
    }
  };
})(window.TidalIsle);
