(function (game) {
  const GRILLED_FISH_RESTORE = {
    hunger: 28,
    energy: 10,
    hp: 4
  };

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
      player.survival.hunger = Math.min(100, player.survival.hunger + GRILLED_FISH_RESTORE.hunger);
      player.survival.energy = Math.min(100, player.survival.energy + GRILLED_FISH_RESTORE.energy);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + GRILLED_FISH_RESTORE.hp);
      runtime.showMessage?.('吃下热腾腾的烤鱼');
      return true;
    }
  };
})(window.TidalIsle);
