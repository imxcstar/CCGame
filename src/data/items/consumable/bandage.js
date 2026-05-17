(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.bandage = {
    name: '绷带',
    type: 'consumable',
    icon: '🩹',
    stack: 8,
    tint: '#f4e8c5',
    description: '由韧性纤维卷成的简易绷带，可以专门用于回复生命。',
    use({ player, game: runtime }) {
      if (!player?.health) return false;
      if (player.health.hp >= player.health.maxHp) {
        runtime.showMessage?.('生命已满');
        return false;
      }
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 22);
      runtime.showMessage?.('用绷带包扎伤口');
      return true;
    }
  };
})(window.TidalIsle);
