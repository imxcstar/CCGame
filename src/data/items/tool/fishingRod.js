(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.fishingRod = {
    name: '鱼竿',
    type: 'tool',
    icon: '🎣',
    stack: 1,
    tint: '#8fd9ff',
    description: '对准近处水面抛竿，浮标下沉时再收线。',
    toolKey: 'fishingRod',
    onPrimaryAction({ game: runtime }) {
      return runtime.handleFishingAction?.() === true;
    }
  };
})(window.TidalIsle);
