(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.grilledMushroom = {
    name: '烤蘑菇',
    type: 'consumable',
    icon: '🍄‍🟫',
    stack: 10,
    tint: '#d6975c',
    description: '在篝火上烘烤的蘑菇串，恢复饥饿、体力，还能稍稍解渴。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 24);
      player.survival.energy = Math.min(100, player.survival.energy + 14);
      player.survival.thirst = Math.min(100, player.survival.thirst + 4);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 2);
      runtime.showMessage?.('吃下香气四溢的烤蘑菇');
      return true;
    }
  };
})(window.TidalIsle);
