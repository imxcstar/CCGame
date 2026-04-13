(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.pumpkin = {
    name: '南瓜',
    type: 'consumable',
    icon: '🎃',
    stack: 10,
    tint: '#ffb562',
    description: '种植后收获的蔬食，能同时恢复饥饿和体力。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 18);
      player.survival.energy = Math.min(100, player.survival.energy + 8);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 2);
      runtime.showMessage?.('吃下一块南瓜');
      return true;
    }
  };
})(window.TidalIsle);
