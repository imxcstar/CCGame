(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.jerky = {
    name: '肉干',
    type: 'consumable',
    icon: '🥓',
    stack: 12,
    tint: '#c46a4b',
    description: '用纤维捆绑风干的肉条，长时间存放也不会坏，能提供持续的饱腹。',
    use({ player, game: runtime }) {
      if (!player?.survival) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 36);
      player.survival.energy = Math.min(100, player.survival.energy + 6);
      runtime.showMessage?.('嚼下一条肉干');
      return true;
    }
  };
})(window.TidalIsle);
