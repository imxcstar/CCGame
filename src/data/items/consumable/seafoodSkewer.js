(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.seafoodSkewer = {
    name: '海鲜串',
    type: 'consumable',
    icon: '🍢',
    stack: 6,
    tint: '#7fd0c4',
    description: '鲭鱼与鳗鱼穿成的双拼烤串，鲜美油润，大幅恢复饥饿与体力。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 40);
      player.survival.energy = Math.min(100, player.survival.energy + 20);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 6);
      runtime.showMessage?.('享用鲜美的海鲜串');
      return true;
    }
  };
})(window.TidalIsle);
