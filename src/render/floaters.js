(function (game) {
  // 浮动提示文字系统：用于"采集 +N 木材"之类的反馈，从角色头顶上升并渐变消失。
  // 与 particle 系统并行，但不挂在 ECS 上（生命周期短、只为视觉反馈）。
  const { state, ctx, clamp, worldToScreen, getComponent } = game;

  if (!Array.isArray(state.floaters)) state.floaters = [];

  const DEFAULTS = {
    life: 1.1,         // 总时长（秒）
    rise: 32,          // 上升距离（世界坐标）
    color: '#fff7d8',
    stroke: 'rgba(8, 20, 30, 0.78)',
    headOffset: 26     // 文字起始位置在 transform 上方多少像素（角色头顶）
  };

  function spawnFloater(x, y, text, options = {}) {
    if (!text) return;
    const life = options.life ?? DEFAULTS.life;
    state.floaters.push({
      x,
      y,
      startY: y,
      text: String(text),
      color: options.color || DEFAULTS.color,
      stroke: options.stroke || DEFAULTS.stroke,
      life,
      maxLife: life,
      rise: options.rise ?? DEFAULTS.rise,
      headOffset: options.headOffset ?? DEFAULTS.headOffset
    });
  }

  // 在指定实体头顶弹出浮动文字（实体存在时跟随实体的 transform）。
  function spawnFloaterAboveEntity(entityId, text, options = {}) {
    const transform = getComponent(entityId, 'transform');
    if (!transform) return;
    spawnFloater(transform.x, transform.y, text, { ...options, attachId: entityId });
    const floater = state.floaters[state.floaters.length - 1];
    if (floater) floater.attachId = entityId;
  }

  function updateFloaterSystem(dt) {
    if (!state.floaters.length) return;
    for (let index = state.floaters.length - 1; index >= 0; index--) {
      const floater = state.floaters[index];
      floater.life -= dt;
      if (floater.life <= 0) {
        state.floaters.splice(index, 1);
        continue;
      }
      // 跟随实体（角色移动时也保持在头顶）
      if (floater.attachId) {
        const transform = getComponent(floater.attachId, 'transform');
        if (transform) {
          floater.x = transform.x;
          floater.startY = transform.y;
        }
      }
    }
  }

  function drawFloaters(shakeX, shakeY) {
    if (!state.floaters.length) return;
    ctx.save();
    ctx.font = '700 13px "Microsoft YaHei", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    for (const floater of state.floaters) {
      const progress = clamp(1 - floater.life / floater.maxLife, 0, 1);
      // 上升 + 缓出
      const ease = 1 - (1 - progress) * (1 - progress);
      const worldY = floater.startY - floater.headOffset - floater.rise * ease;
      const screen = worldToScreen(floater.x, worldY, shakeX, shakeY);
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = floater.stroke;
      ctx.strokeText(floater.text, screen.x, screen.y);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, screen.x, screen.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  Object.assign(game, {
    spawnFloater,
    spawnFloaterAboveEntity,
    updateFloaterSystem,
    drawFloaters
  });
})(window.TidalIsle);
