(function (game) {
  const {
    state,
    CRAFTING_RECIPES,
    RESOURCE_NAMES,
    showMessage,
    setScore,
    addInventory,
    spendCost,
    canAfford,
    canStoreAllItems,
    removeItemFromInventorySlot,
    getPlayerSnapshot,
    getItemConfig,
    isConsumableItem,
    isEquippableItem,
    getInventoryReference,
    resolveInventoryReference,
    assignInventorySlotToHotbar,
    clearHotbarSlot
  } = game;

  function craftItem(key) {
    if (!state.running || state.over) return false;

    const player = getPlayerSnapshot();
    const recipe = CRAFTING_RECIPES[key];
    if (!player?.inventory || !recipe) return false;

    if (!canAfford(recipe.cost)) {
      showMessage('材料不足');
      return false;
    }

    if (!canStoreAllItems(player.inventory, { [key]: 1 })) {
      showMessage('背包空间不足');
      return false;
    }

    spendCost(recipe.cost);
    addInventory({ [key]: 1 });
    showMessage('已制作 ' + getItemConfig(key).name);
    return true;
  }

  function applyConsumableEffect(player, key) {
    if (key === 'berry') {
      player.survival.hunger = Math.min(100, player.survival.hunger + 20);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 3);
      showMessage('吃下浆果');
      return true;
    }

    if (key === 'coconut') {
      player.survival.thirst = Math.min(100, player.survival.thirst + 28);
      player.survival.hunger = Math.min(100, player.survival.hunger + 6);
      showMessage('饮下椰汁');
      return true;
    }

    if (key === 'meat') {
      player.survival.hunger = Math.min(100, player.survival.hunger + 30);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 4);
      player.survival.energy = Math.min(100, player.survival.energy + 8);
      showMessage('吃下熟肉');
      return true;
    }

    if (key === 'sardine') {
      player.survival.hunger = Math.min(100, player.survival.hunger + 14);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 2);
      showMessage('吃下沙丁鱼');
      return true;
    }

    if (key === 'mackerel') {
      player.survival.hunger = Math.min(100, player.survival.hunger + 22);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 3);
      player.survival.energy = Math.min(100, player.survival.energy + 4);
      showMessage('吃下鲭鱼');
      return true;
    }

    if (key === 'eel') {
      player.survival.hunger = Math.min(100, player.survival.hunger + 18);
      player.health.hp = Math.min(player.health.maxHp, player.health.hp + 4);
      player.survival.energy = Math.min(100, player.survival.energy + 10);
      showMessage('吃下鳗鱼');
      return true;
    }

    return false;
  }

  function consumeInventorySlot(inventoryIndex) {
    if (!state.running || state.over) return false;

    const player = getPlayerSnapshot();
    const reference = getInventoryReference(player?.inventory, inventoryIndex);
    if (!player?.inventory || !player.survival || !player.health || !reference) return false;
    if (!isConsumableItem(reference.item)) {
      showMessage(reference.item.name + ' 不能直接食用');
      return false;
    }

    const removed = removeItemFromInventorySlot(player.inventory, inventoryIndex, 1);
    if (removed <= 0) return false;

    applyConsumableEffect(player, reference.key);
    setScore();
    return true;
  }

  function useConsumable(type) {
    const player = getPlayerSnapshot();
    if (!player?.inventory) return false;

    const slotIndex = player.inventory.slots.findIndex((slot) => slot?.key === type);
    if (slotIndex < 0) {
      showMessage('没有' + RESOURCE_NAMES[type]);
      return false;
    }

    return consumeInventorySlot(slotIndex);
  }

  function bindItemReference(source, index, hotbarIndex = state.selectedSlot) {
    const player = getPlayerSnapshot();
    const reference = resolveInventoryReference(source, index);
    if (!player?.inventory || !reference || reference.isFallback) return false;

    assignInventorySlotToHotbar(player.inventory, reference.inventoryIndex, hotbarIndex);
    state.selectedSlot = hotbarIndex;
    showMessage(getItemConfig(reference.key).name + ' 已放入快捷栏 ' + (hotbarIndex + 1));
    return true;
  }

  function clearHotbarReference(hotbarIndex) {
    const player = getPlayerSnapshot();
    if (!player?.inventory) return false;
    clearHotbarSlot(player.inventory, hotbarIndex);
    showMessage('快捷栏 ' + (hotbarIndex + 1) + ' 已清空');
    return true;
  }

  function dropItemReference(source, index) {
    const player = getPlayerSnapshot();
    const reference = resolveInventoryReference(source, index);
    if (!player?.inventory || !reference || reference.isFallback) return false;

    const removed = removeItemFromInventorySlot(player.inventory, reference.inventoryIndex, 1);
    if (removed <= 0) return false;

    showMessage('丢弃 1 个 ' + getItemConfig(reference.key).name);
    setScore();
    return true;
  }

  function useItemReference(source, index) {
    const reference = resolveInventoryReference(source, index);
    if (!reference) {
      if (source === 'hotbar' && index === state.selectedSlot) {
        showMessage('当前为空手');
      }
      return false;
    }

    if (isConsumableItem(reference.item)) {
      return consumeInventorySlot(reference.inventoryIndex);
    }

    if (isEquippableItem(reference.item)) {
      if (source === 'inventory') return bindItemReference(source, index, state.selectedSlot);
      state.selectedSlot = index;
      showMessage('已切换到 ' + reference.item.name);
      return true;
    }

    showMessage(reference.item.name + ' 不能直接使用');
    return false;
  }

  Object.assign(game, {
    craftItem,
    consumeInventorySlot,
    useConsumable,
    bindItemReference,
    clearHotbarReference,
    dropItemReference,
    useItemReference
  });
})(window.TidalIsle);
