(function (game) {
  const { ctx, TILE, TILE_COMPONENTS } = game;

  function drawTileSprite(tile, screen, tileX, tileY, now = performance.now()) {
    const component = TILE_COMPONENTS[tile] || TILE_COMPONENTS.grass;
    ctx.fillStyle = component.baseColor;
    ctx.fillRect(screen.x, screen.y, TILE + 1, TILE + 1);
    component.draw?.(screen, tileX, tileY, now);
  }

  Object.assign(game, {
    drawTileSprite
  });
})(window.TidalIsle);
