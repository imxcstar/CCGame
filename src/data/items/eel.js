(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.eel = {
    name: '鳗鱼',
    type: 'consumable',
    icon: '🐡',
    stack: 6,
    tint: '#d3b7ff',
    description: '夜间更容易钓上的稀有鱼获。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 18);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 4);
      player.survival.energy = Math.min(100, player.survival.energy + 10);
      runtime.showMessage?.('吃下鳗鱼');
      return true;
    }
  };
})(window.TidalIsle);
