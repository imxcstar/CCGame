(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.grilledFish = {
    name: '烤鱼',
    type: 'consumable',
    icon: '🍢',
    stack: 10,
    tint: '#ffc887',
    description: '在篝火旁烤熟的鱼，能更好地恢复饥饿与体力。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 28);
      player.survival.energy = Math.min(100, player.survival.energy + 10);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 4);
      runtime.showMessage?.('吃下热腾腾的烤鱼');
      return true;
    }
  };
})(window.TidalIsle);
