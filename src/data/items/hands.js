(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.hands = {
    name: '拳头',
    type: 'weapon',
    icon: '✊',
    stack: 1,
    tint: '#d8cbb3',
    description: '当前未手持物品时，左键可选中地图目标。',
    toolKey: 'hands',
    virtual: true,
    onPrimaryAction({ game: runtime }) {
      runtime.selectWorldTargetAtPointer?.();
      return true;
    }
  };
})(window.TidalIsle);
