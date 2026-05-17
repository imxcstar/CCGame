(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.club = {
    name: '木棒',
    type: 'weapon',
    icon: '🏏',
    stack: 1,
    tint: '#c79762',
    description: '一根削过的硬木棒，挥起来比拳头更有威力，是制作长矛之前的过渡武器。',
    toolKey: 'club',
    onPrimaryAction({ game: runtime }) {
      return runtime.performEquippedAttack?.('club') === true;
    }
  };
})(window.TidalIsle);
