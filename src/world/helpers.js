(function (game) {
  const { state, WORLD_SIZE, TILE, view, lerp } = game;

  function hash2(x, y, offset = 0) {
    let value = Math.imul(x + 37 * offset + state.seed, 374761393) ^ Math.imul(y + 17 * offset + state.seed, 668265263);
    value = (value ^ (value >>> 13)) >>> 0;
    value = Math.imul(value, 1274126177) >>> 0;
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function smoothNoise(x, y, offset = 0) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash2(xi, yi, offset);
    const b = hash2(xi + 1, yi, offset);
    const c = hash2(xi, yi + 1, offset);
    const d = hash2(xi + 1, yi + 1, offset);
    const ux = xf * xf * (3 - 2 * xf);
    const uy = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  }

  function fbm(x, y, offset = 0) {
    let value = 0;
    let amplitude = 0.55;
    let frequency = 1;
    for (let index = 0; index < 4; index++) {
      value += smoothNoise(x * frequency, y * frequency, offset + index * 11) * amplitude;
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_SIZE || ty >= WORLD_SIZE) return 'deep';
    return typeof game.getGeneratedTile === 'function' ? game.getGeneratedTile(tx, ty) : 'deep';
  }

  function tileAtWorld(x, y) {
    return tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  function tileWalkable(tile) {
    return tile !== 'deep' && tile !== 'water';
  }

  function worldToScreen(x, y, shakeX = 0, shakeY = 0) {
    return {
      x: x - state.camera.x + view.width * 0.5 + shakeX,
      y: y - state.camera.y + view.height * 0.5 + shakeY
    };
  }

  function screenToWorld(x, y) {
    return {
      x: x + state.camera.x - view.width * 0.5,
      y: y + state.camera.y - view.height * 0.5
    };
  }

  Object.assign(game, {
    hash2,
    smoothNoise,
    fbm,
    tileAt,
    tileAtWorld,
    tileWalkable,
    worldToScreen,
    screenToWorld
  });
})(window.TidalIsle);
