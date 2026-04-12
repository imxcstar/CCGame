(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.floor = {
    name: '木地板',
    type: 'buildable',
    icon: '▦',
    stack: 16,
    tint: '#c89a68',
    description: '用于铺设营地地面。',
    buildKind: 'floor',
    onPrimaryAction({ game: runtime }) {
      return runtime.tryPlaceStructure?.() === true;
    }
  };
})(window.TidalIsle);
