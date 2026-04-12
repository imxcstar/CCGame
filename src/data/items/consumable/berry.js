(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.berry = {
    name: '浆果',
    type: 'consumable',
    icon: '🫐',
    stack: 16,
    tint: '#8fa2ff',
    description: '恢复少量饥饿与生命。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 20);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 3);
      runtime.showMessage?.('吃下浆果');
      return true;
    }
  };
})(window.TidalIsle);
