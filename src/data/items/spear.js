(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.spear = {
    name: '长矛',
    type: 'weapon',
    icon: '🗡',
    stack: 1,
    tint: '#ffd37c',
    description: '更适合对抗夜晚的爬行生物。',
    toolKey: 'spear',
    onPrimaryAction({ game: runtime }) {
      return runtime.performEquippedAttack?.('spear') === true;
    }
  };
})(window.TidalIsle);
