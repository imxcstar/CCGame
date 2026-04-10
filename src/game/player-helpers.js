(function (game) {
  const { state, countInventoryItem } = game;

  function getPlayerComponent(name) {
    if (!state.playerId || typeof game.getComponent !== 'function') return null;
    return game.getComponent(state.playerId, name);
  }

  function setScore() {
    const inventory = getPlayerComponent('inventory');
    if (!inventory) {
      state.score = 0;
      return;
    }

    const structures = typeof game.queryEntities === 'function' ? game.queryEntities(['structure']).length : 0;
    const built = structures * 12;
    const survived = (state.day - 1) * 100 + Math.floor(state.time * 100);
    state.score = built + survived + Math.floor(countInventoryItem(inventory, 'meat') * 8);
  }

  function addInventory(loot) {
    const inventory = getPlayerComponent('inventory');
    if (!inventory) return { added: {}, leftover: { ...loot } };

    const result = game.addItemsToInventory(inventory, loot);
    setScore();
    return result;
  }

  function canAfford(cost) {
    const inventory = getPlayerComponent('inventory');
    if (!inventory) return false;
    return Object.entries(cost).every(([key, amount]) => countInventoryItem(inventory, key) >= amount);
  }

  function spendCost(cost) {
    const inventory = getPlayerComponent('inventory');
    if (!inventory || !canAfford(cost)) return false;

    Object.entries(cost).forEach(([key, amount]) => {
      game.removeItemFromInventory(inventory, key, amount);
    });

    setScore();
    return true;
  }

  function formatCost(cost) {
    return Object.entries(cost)
      .map(([key, value]) => game.getItemConfig(key).name + ' ' + value)
      .join(' · ');
  }

  Object.assign(game, {
    getPlayerComponent,
    setScore,
    addInventory,
    canAfford,
    spendCost,
    formatCost
  });
})(window.TidalIsle);
