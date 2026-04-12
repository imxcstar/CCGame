(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.meat = {
    name: '熟肉',
    type: 'consumable',
    icon: '🍖',
    stack: 12,
    tint: '#ff9d8f',
    description: '恢复大量饥饿，并稍微回复生命。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 30);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 4);
      player.survival.energy = Math.min(100, player.survival.energy + 8);
      runtime.showMessage?.('吃下熟肉');
      return true;
    }
  };
})(window.TidalIsle);
