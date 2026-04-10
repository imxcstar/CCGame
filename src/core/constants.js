(function (game) {
  const TILE = 32;
  const WORLD_SIZE = 128;
  const DAY_LENGTH = 170;
  const ATTACK_RANGE = 70;
  const HOTBAR_SIZE = 5;

  Object.assign(game, {
    TILE,
    WORLD_SIZE,
    DAY_LENGTH,
    ATTACK_RANGE,
    HOTBAR_SIZE
  });
})(window.TidalIsle);
