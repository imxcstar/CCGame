(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.planter = {
    name: '种植箱',
    type: 'buildable',
    icon: '🪴',
    stack: 6,
    tint: '#98cf7d',
    description: '用于播种和培育作物，成熟后可收获南瓜。',
    buildKind: 'planter',
    onPrimaryAction({ game: runtime }) {
      return runtime.tryPlaceStructure?.() === true;
    }
  };
})(window.TidalIsle);
