(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.mackerel = {
    name: '鲭鱼',
    type: 'consumable',
    icon: '🐠',
    stack: 8,
    tint: '#8fd5d0',
    description: '更肥美的鱼获，恢复更多体力。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 22);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 3);
      player.survival.energy = Math.min(100, player.survival.energy + 4);
      runtime.showMessage?.('吃下鲭鱼');
      return true;
    }
  };
})(window.TidalIsle);
