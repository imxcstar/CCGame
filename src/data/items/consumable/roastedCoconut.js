(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.roastedCoconut = {
    name: '烤椰子',
    type: 'consumable',
    icon: '🥥',
    stack: 8,
    tint: '#b8835a',
    description: '篝火烤过的椰肉变得焦香浓郁，饱腹大幅提升，但水分有所流失。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 26);
      player.survival.energy = Math.min(100, player.survival.energy + 10);
      player.survival.thirst = Math.min(100, player.survival.thirst + 12);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 3);
      runtime.showMessage?.('享用焦香的烤椰子');
      return true;
    }
  };
})(window.TidalIsle);
