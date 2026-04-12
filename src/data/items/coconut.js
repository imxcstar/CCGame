(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.coconut = {
    name: '椰子',
    type: 'consumable',
    icon: '🥥',
    stack: 10,
    tint: '#d7e2b9',
    description: '补充口渴，也能提供少量饱腹。',
    use({ player, game: runtime }) {
      if (!player?.survival) return false;
      player.survival.thirst = Math.min(100, player.survival.thirst + 28);
      player.survival.hunger = Math.min(100, player.survival.hunger + 6);
      runtime.showMessage?.('饮下椰汁');
      return true;
    }
  };
})(window.TidalIsle);
