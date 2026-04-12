(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.hands = {
    name: '拳头',
    type: 'weapon',
    icon: '✊',
    stack: 1,
    tint: '#d8cbb3',
    description: '当前未手持物品时，左键可选中目标，资源可直接采集，敌人可直接攻击。',
    toolKey: 'hands',
    virtual: true,
    onPrimaryAction({ game: runtime }) {
      const target = runtime.selectWorldTargetAtPointer?.();
      if (!target) return false;
      if (target.group === 'resource') runtime.runSelectedWorldTargetAction?.('gather');
      if (target.group === 'enemy') runtime.runSelectedWorldTargetAction?.('attack');
      return true;
    }
  };
})(window.TidalIsle);
