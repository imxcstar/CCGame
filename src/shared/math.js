(function (game) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function angleDelta(a, b) {
    let delta = a - b;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  // 8 方向朝向：将 (x, y) 向量按 45° 扇区映射为 8 个方向之一。
  // 注：画布坐标系 y 向下为正，因此 down = +y、up = -y。
  // 序号顺序与 Math.atan2(y, x) 对齐，便于以 round(angle / (π/4)) 取扇区索引。
  const FACING_NAMES_8 = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];

  function getFacingDirection(x, y, fallback = 'down') {
    if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) return fallback;
    const angle = Math.atan2(y, x);
    const idx = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    return FACING_NAMES_8[idx];
  }

  Object.assign(game, {
    clamp,
    lerp,
    dist,
    angleDelta,
    getFacingDirection
  });
})(window.TidalIsle);
