(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.fisherStew = {
    name: '渔夫炖菜',
    type: 'consumable',
    icon: '🥘',
    stack: 4,
    tint: '#e8b14a',
    description: '把当日的鱼获、南瓜和蘑菇一同慢炖出的丰盛大餐，几乎能全面恢复状态。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 52);
      player.survival.thirst = Math.min(100, player.survival.thirst + 20);
      player.survival.energy = Math.min(100, player.survival.energy + 26);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 14);
      runtime.showMessage?.('一口下去：渔夫炖菜满血复活');
      return true;
    }
  };
})(window.TidalIsle);
