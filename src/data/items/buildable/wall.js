(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.wall = {
    name: '木墙',
    type: 'buildable',
    icon: '🧱',
    stack: 12,
    tint: '#d0a06c',
    description: '拦住敌人的简单防线。',
    buildKind: 'wall',
    onPrimaryAction({ game: runtime }) {
      return runtime.tryPlaceStructure?.() === true;
    }
  };
})(window.TidalIsle);
