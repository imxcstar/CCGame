(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.collector = {
    name: '雨水收集器',
    type: 'buildable',
    icon: '💧',
    stack: 6,
    tint: '#81e7ff',
    description: '会缓慢积攒可饮用的淡水。',
    buildKind: 'collector',
    onPrimaryAction({ game: runtime }) {
      return runtime.tryPlaceStructure?.() === true;
    }
  };
})(window.TidalIsle);
