(function (game) {
  const TILE = 32;
  const WORLD_SIZE = 5120;
  const WORLD_CHUNK_SIZE = 32;
  const WORLD_ACTIVE_CHUNK_RADIUS = 2;
  const WORLD_KEEP_CHUNK_RADIUS = 4;
  const MINIMAP_BASE_SIZE = 512;
  const DAY_LENGTH = 170;
  const ATTACK_RANGE = 70;
  const HOTBAR_SIZE = 5;

  Object.assign(game, {
    TILE,
    WORLD_SIZE,
    WORLD_CHUNK_SIZE,
    WORLD_ACTIVE_CHUNK_RADIUS,
    WORLD_KEEP_CHUNK_RADIUS,
    MINIMAP_BASE_SIZE,
    DAY_LENGTH,
    ATTACK_RANGE,
    HOTBAR_SIZE
  });
})(window.TidalIsle);
