(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.mushroom = {
    name: '蘑菇',
    type: 'consumable',
    icon: '🍄',
    stack: 16,
    tint: '#e6a07c',
    description: '林地间的菌菇，能略微恢复饥饿与体力，还能解一点渴。',
    use({ player, game: runtime }) {
      if (!player?.survival) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 14);
      player.survival.energy = Math.min(100, player.survival.energy + 8);
      player.survival.thirst = Math.min(100, player.survival.thirst + 6);
      runtime.showMessage?.('吃下一朵蘑菇');
      return true;
    }
  };
})(window.TidalIsle);
