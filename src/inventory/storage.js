(function (game) {
  const { HOTBAR_SIZE, getItemConfig } = game;

  function createInventory(size = 16) {
    return {
      size,
      slots: Array.from({ length: size }, () => null),
      hotbar: Array.from({ length: HOTBAR_SIZE }, () => null)
    };
  }

  function sanitizeHotbar(inventory) {
    if (!inventory) return;
    const current = Array.isArray(inventory.hotbar) ? inventory.hotbar : [];
    inventory.hotbar = Array.from({ length: HOTBAR_SIZE }, (_, index) => {
      const slotIndex = current[index];
      return Number.isInteger(slotIndex) && inventory.slots?.[slotIndex] ? slotIndex : null;
    });
  }

  function cloneInventorySlots(inventory) {
    return (inventory?.slots || []).map((slot) => (slot ? { ...slot } : null));
  }

  function getInventoryUsedSlots(inventory) {
    if (!inventory?.slots) return 0;
    return inventory.slots.filter(Boolean).length;
  }

  function countInventoryItem(inventory, key) {
    if (!inventory?.slots) return 0;
    return inventory.slots.reduce((total, slot) => total + (slot?.key === key ? slot.amount : 0), 0);
  }

  function storeItemInSlots(slots, key, amount) {
    if (!Array.isArray(slots) || amount <= 0) return { added: 0, left: Math.max(0, amount || 0) };

    const config = getItemConfig(key);
    let remaining = amount;
    let added = 0;

    for (const slot of slots) {
      if (!slot || slot.key !== key || slot.amount >= config.stack) continue;
      const moved = Math.min(config.stack - slot.amount, remaining);
      slot.amount += moved;
      remaining -= moved;
      added += moved;
      if (remaining <= 0) return { added, left: 0 };
    }

    for (let index = 0; index < slots.length && remaining > 0; index++) {
      if (slots[index]) continue;
      const moved = Math.min(config.stack, remaining);
      slots[index] = { key, amount: moved };
      remaining -= moved;
      added += moved;
    }

    return { added, left: remaining };
  }

  function addItemToInventory(inventory, key, amount) {
    if (!inventory?.slots) return { added: 0, left: Math.max(0, amount || 0) };
    sanitizeHotbar(inventory);
    return storeItemInSlots(inventory.slots, key, amount);
  }

  function addItemsToInventory(inventory, items) {
    const added = {};
    const leftover = {};
    if (!inventory?.slots) return { added, leftover: { ...items } };

    sanitizeHotbar(inventory);
    Object.entries(items).forEach(([key, amount]) => {
      const result = addItemToInventory(inventory, key, amount);
      if (result.added > 0) added[key] = result.added;
      if (result.left > 0) leftover[key] = result.left;
    });

    return { added, leftover };
  }

  function canStoreAllItems(inventory, items) {
    if (!inventory?.slots) return false;
    const testSlots = cloneInventorySlots(inventory);
    return Object.entries(items).every(([key, amount]) => storeItemInSlots(testSlots, key, amount).left === 0);
  }

  function removeItemFromInventory(inventory, key, amount) {
    if (!inventory?.slots || amount <= 0) return 0;

    let remaining = amount;
    for (let index = inventory.slots.length - 1; index >= 0 && remaining > 0; index--) {
      const slot = inventory.slots[index];
      if (!slot || slot.key !== key) continue;
      const moved = Math.min(slot.amount, remaining);
      slot.amount -= moved;
      remaining -= moved;
      if (slot.amount <= 0) inventory.slots[index] = null;
    }

    sanitizeHotbar(inventory);
    return amount - remaining;
  }

  function removeItemFromInventorySlot(inventory, slotIndex, amount = 1) {
    if (!inventory?.slots || amount <= 0) return 0;
    const slot = inventory.slots[slotIndex];
    if (!slot) return 0;

    const removed = Math.min(slot.amount, amount);
    slot.amount -= removed;
    if (slot.amount <= 0) inventory.slots[slotIndex] = null;
    sanitizeHotbar(inventory);
    return removed;
  }

  Object.assign(game, {
    createInventory,
    sanitizeHotbar,
    getInventoryUsedSlots,
    countInventoryItem,
    addItemToInventory,
    addItemsToInventory,
    canStoreAllItems,
    removeItemFromInventory,
    removeItemFromInventorySlot
  });
})(window.TidalIsle);
