(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.axe = {
    name: '石斧',
    type: 'tool',
    icon: '🪓',
    stack: 1,
    tint: '#ffb86c',
    description: '大幅提升砍树效率。',
    toolKey: 'axe',
    onPrimaryAction({ game: runtime }) {
      return runtime.performEquippedAttack?.('axe') === true;
    }
  };
})(window.TidalIsle);
