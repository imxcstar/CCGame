(function (game) {
  const { ctx } = game;

  game.entityComponentRegistry = game.entityComponentRegistry || {};
  game.entityComponentRegistry.mushroomPatch = {
    hp: 4,
    radius: 12,
    respawn: 64,
    loot: { mushroom: [1, 3], fiber: [0, 1] },
    burst: { color: '#e6a07c', count: 7 },
    canSpawn(tile, random) {
      // 落在 bush(<0.79) 与 rock(>0.81) 之间的间隙，避免影响既有资源的位置布局。
      return (tile === 'grass' || tile === 'meadow') && random >= 0.79 && random < 0.81;
    },
    getDamage(tool) {
      if (tool === 'hands') return 2.5;
      return 2.1;
    },
    draw(view, screen) {
      ctx.save();
      if (view.hitTimer > 0) ctx.globalAlpha = 0.72;
      ctx.translate(screen.x, screen.y);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, view.radius - 2, view.radius * 0.85, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 几朵蘑菇
      const caps = [
        { x: -6, y: 2, r: 5, color: '#c44a3a' },
        { x: 5, y: 4, r: 4, color: '#d96a4d' },
        { x: 0, y: -3, r: 4, color: '#a8362b' }
      ];
      for (const cap of caps) {
        // 菌柄
        ctx.fillStyle = '#f4e6d2';
        ctx.fillRect(cap.x - 1.5, cap.y - 1, 3, cap.r + 1);
        // 菌盖
        ctx.fillStyle = cap.color;
        ctx.beginPath();
        ctx.ellipse(cap.x, cap.y - 1, cap.r, cap.r * 0.7, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        // 菌斑
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(cap.x - cap.r * 0.4, cap.y - 1.4, 0.9, 0, Math.PI * 2);
        ctx.arc(cap.x + cap.r * 0.3, cap.y - 1.8, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };
})(window.TidalIsle);
