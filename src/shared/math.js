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

  Object.assign(game, {
    clamp,
    lerp,
    dist,
    angleDelta
  });
})(window.TidalIsle);
