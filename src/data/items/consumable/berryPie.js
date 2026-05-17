(function (game) {
  game.itemRegistry = game.itemRegistry || {};
  game.itemRegistry.berryPie = {
    name: '浆果派',
    type: 'consumable',
    icon: '🥧',
    stack: 8,
    tint: '#ffb6c1',
    description: '用浆果和南瓜烤制的甜派，可以大幅恢复饥饿并稍稍恢复生命。',
    use({ player, game: runtime }) {
      if (!player?.survival || !player?.health) return false;
      player.survival.hunger = Math.min(100, player.survival.hunger + 44);
      player.survival.energy = Math.min(100, player.survival.energy + 12);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 6);
      runtime.showMessage?.('吃下一块浆果派');
      return true;
    }
  };
})(window.TidalIsle);
