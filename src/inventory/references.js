(function (game) {
  const { state, HOTBAR_SIZE, getItemConfig, getPlayerComponent, sanitizeHotbar } = game;

  function getInventoryReference(inventory, slotIndex) {
    const slot = inventory?.slots?.[slotIndex];
    if (!slot) return null;

    return {
      source: 'inventory',
      inventoryIndex: slotIndex,
      hotbarIndex: null,
      slot,
      key: slot.key,
      amount: slot.amount,
      item: getItemConfig(slot.key),
      isFallback: false
    };
  }

  function getHotbarItem(inventory, hotbarIndex) {
    sanitizeHotbar(inventory);
    const slotIndex = inventory?.hotbar?.[hotbarIndex];
    if (!Number.isInteger(slotIndex)) return null;

    const slot = inventory?.slots?.[slotIndex];
    if (!slot) return null;

    return {
      source: 'hotbar',
      inventoryIndex: slotIndex,
      hotbarIndex,
      slot,
      key: slot.key,
      amount: slot.amount,
      item: getItemConfig(slot.key),
      isFallback: false
    };
  }

  function assignInventorySlotToHotbar(inventory, inventoryIndex, hotbarIndex) {
    if (!inventory?.slots?.[inventoryIndex]) return false;
    sanitizeHotbar(inventory);
    inventory.hotbar[hotbarIndex] = inventoryIndex;
    return true;
  }

  function clearHotbarSlot(inventory, hotbarIndex) {
    if (!inventory?.hotbar) return;
    sanitizeHotbar(inventory);
    inventory.hotbar[hotbarIndex] = null;
  }

  function getFallbackHandsReference(hotbarIndex = state.selectedSlot) {
    return {
      source: 'virtual',
      inventoryIndex: null,
      hotbarIndex,
      slot: null,
      key: 'hands',
      amount: 1,
      item: getItemConfig('hands'),
      isFallback: true
    };
  }

  function resolveInventoryReference(source, index) {
    const inventory = getPlayerComponent('inventory');
    if (!inventory) return null;
    if (source === 'inventory') return getInventoryReference(inventory, index);
    if (source === 'hotbar') return getHotbarItem(inventory, index);
    return null;
  }

  function setSelectedInventoryIndex(index = null) {
    state.selectedInventoryIndex = Number.isInteger(index) ? index : null;
    return state.selectedInventoryIndex;
  }

  function getSelectedItem() {
    const inventory = getPlayerComponent('inventory');
    if (!inventory) return getFallbackHandsReference();

    const selected = Number.isInteger(state.selectedInventoryIndex)
      ? getInventoryReference(inventory, state.selectedInventoryIndex)
      : null;

    if (selected) return selected;
    if (state.selectedInventoryIndex !== null) state.selectedInventoryIndex = null;
    return getFallbackHandsReference();
  }

  Object.assign(game, {
    getInventoryReference,
    getHotbarItem,
    assignInventorySlotToHotbar,
    clearHotbarSlot,
    getFallbackHandsReference,
    resolveInventoryReference,
    setSelectedInventoryIndex,
    getSelectedItem
  });
})(window.TidalIsle);
