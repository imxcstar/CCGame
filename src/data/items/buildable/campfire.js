(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.campfire = {
    name: '篝火套件',
    type: 'buildable',
    icon: '🔥',
    stack: 6,
    tint: '#ffca74',
    description: '放置后在夜晚提供光亮和恢复。',
    buildKind: 'campfire',
    onPrimaryAction({ game: runtime }) {
      return runtime.tryPlaceStructure?.() === true;
    }
  };
})(window.TidalIsle);
