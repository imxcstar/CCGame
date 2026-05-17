(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.berryJam = {
    name: '浆果果酱',
    type: 'consumable',
    icon: '🍯',
    stack: 8,
    tint: '#b87bb4',
    description: '熬煮浓缩的浆果，糖分很高，能持续大量恢复饥饿与生命。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 30);
      player.survival.energy = Math.min(100, player.survival.energy + 12);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 8);
      runtime.showMessage?.('舀了一勺浆果果酱');
      return true;
    }
  };
})(window.TidalIsle);
