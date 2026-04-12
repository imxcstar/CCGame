(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.pickaxe = {
    name: '石镐',
    type: 'tool',
    icon: '⛏',
    stack: 1,
    tint: '#c9d4de',
    description: '更适合采石与破坏坚硬目标。',
    toolKey: 'pickaxe',
    onPrimaryAction({ game: runtime }) {
      return runtime.performEquippedAttack?.('pickaxe') === true;
    }
  };
})(window.TidalIsle);
