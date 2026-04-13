(function (game) {
  const PUMPKIN_RESTORE = {
    hunger: 18,
    energy: 8,
    hp: 2
  };

  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.pumpkin = {
    name: '南瓜',
    type: 'consumable',
    icon: '🎃',
    stack: 10,
    tint: '#ffb562',
    description: '种植后收获的蔬果，能同时恢复饥饿和体力。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + PUMPKIN_RESTORE.hunger);
      player.survival.energy = Math.min(100, player.survival.energy + PUMPKIN_RESTORE.energy);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + PUMPKIN_RESTORE.hp);
      runtime.showMessage?.('吃下一块南瓜');
      return true;
    }
  };
})(window.TidalIsle);
