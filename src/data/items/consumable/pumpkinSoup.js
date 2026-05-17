(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.pumpkinSoup = {
    name: '南瓜浓汤',
    type: 'consumable',
    icon: '🍲',
    stack: 6,
    tint: '#ff9c4f',
    description: '南瓜和蘑菇熬煮的浓汤，热腾腾下肚，几乎能完全解渴并大幅恢复饥饿。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 38);
      player.survival.thirst = Math.min(100, player.survival.thirst + 24);
      player.survival.energy = Math.min(100, player.survival.energy + 16);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 5);
      runtime.showMessage?.('一碗热乎的南瓜浓汤');
      return true;
    }
  };
})(window.TidalIsle);
