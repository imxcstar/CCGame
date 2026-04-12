(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.sardine = {
    name: '沙丁鱼',
    type: 'consumable',
    icon: '🐟',
    stack: 10,
    tint: '#a9d8ff',
    description: '小巧的海鱼，能恢复一些饥饿。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 14);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 2);
      runtime.showMessage?.('吃下沙丁鱼');
      return true;
    }
  };
})(window.TidalIsle);
