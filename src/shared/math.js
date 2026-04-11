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

  function getFacingDirection(x, y, fallback = 'down') {
    if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) return fallback;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
  }

  Object.assign(game, {
    clamp,
    lerp,
    dist,
    angleDelta,
    getFacingDirection
  });
})(window.TidalIsle);
