(function (game) {
  const {
    state,
    dom,
    craftButtons,
    HOTBAR_SIZE,
    CRAFTING_RECIPES,
    ITEM_DEFS,
    clamp,
    canAfford,
    canStoreAllItems,
    formatCost,
    getItemTypeLabel,
    getInventoryUsedSlots,
    getPlayerSnapshot,
    getHotbarItem,
    getSelectedItem,
    resolveInventoryReference,
    getItemMenuState,
    closeItemMenu,
    craftItem,
    getTimeLabel,
    getWeatherText
  } = game;

  function getHotbarLinks(inventory, inventoryIndex) {
    const links = [];
    for (let index = 0; index < HOTBAR_SIZE; index++) {
      if (inventory.hotbar?.[index] === inventoryIndex) links.push(index + 1);
    }
    return links;
  }

  function createCraftButtons() {
    dom.craftListEl.innerHTML = '';
    craftButtons.clear();

    Object.entries(CRAFTING_RECIPES).forEach(([key]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (state.over) return;
        craftItem(key);
      });
      craftButtons.set(key, button);
      dom.craftListEl.appendChild(button);
    });
  }

  function updateUI() {
    const player = getPlayerSnapshot();
    if (!player?.inventory || !player.survival || !player.health) return;

    dom.barsEl.innerHTML = [
      ['生命', player.health.hp, 'health'],
      ['饥饿', player.survival.hunger, 'hunger'],
      ['口渴', player.survival.thirst, 'thirst'],
      ['体力', player.survival.energy, 'energy']
    ]
      .map(
        ([name, value, className]) => `
          <div class="bar">
            <span>${name}</span>
            <div class="bar-track"><div class="bar-fill ${className}" style="width:${clamp(value, 0, 100)}%"></div></div>
            <span>${Math.round(value)}</span>
          </div>
        `
      )
      .join('');

    const usedSlots = getInventoryUsedSlots(player.inventory);
    dom.inventoryEl.innerHTML = `
      <div class="inventory-meta">已用 ${usedSlots}/${player.inventory.size} · 右键打开物品菜单</div>
      ${player.inventory.slots
        .map((slot, index) => {
          if (!slot) {
            return `
              <div class="bag-slot empty">
                <span class="bag-slot-index">${index + 1}</span>
              </div>
            `;
          }

          const item = ITEM_DEFS[slot.key] || { name: slot.key, icon: '•', tint: '#dbe8f0', type: 'material' };
          const links = getHotbarLinks(player.inventory, index);
          return `
            <div class="bag-slot filled" data-slot-source="inventory" data-slot-index="${index}" style="--item-tint:${item.tint}">
              <span class="bag-slot-index">${index + 1}</span>
              <span class="bag-slot-icon" aria-hidden="true">${item.icon}</span>
              <span class="bag-slot-count">${slot.amount}</span>
              <span class="bag-slot-links">${links.map((value) => `<em>${value}</em>`).join('')}</span>
            </div>
          `;
        })
        .join('')}
    `;

    const selected = getSelectedItem();
    dom.hotbarEl.innerHTML = Array.from({ length: HOTBAR_SIZE }, (_, index) => {
      const actual = getHotbarItem(player.inventory, index);
      const display = actual || (index === state.selectedSlot ? selected : null);
      const item = display?.item;
      const classes = [
        'slot',
        index === state.selectedSlot ? 'active' : '',
        actual ? 'filled' : 'empty',
        !actual && index === state.selectedSlot ? 'fallback' : ''
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <div class="${classes}" data-slot-source="hotbar" data-slot-index="${index}">
          <span class="slot-key">${index + 1}</span>
          <span class="slot-icon" aria-hidden="true">${item?.icon || ''}</span>
          ${actual && actual.amount > 1 ? `<span class="slot-count">${actual.amount}</span>` : ''}
        </div>
      `;
    }).join('');

    for (const [key, button] of craftButtons.entries()) {
      const recipe = CRAFTING_RECIPES[key];
      const affordable = canAfford(recipe.cost);
      const hasRoom = canStoreAllItems(player.inventory, { [key]: 1 });
      const craftedCount = player.inventory.slots.reduce((total, slot) => total + (slot?.key === key ? slot.amount : 0), 0);
      const item = ITEM_DEFS[key];
      button.classList.toggle('active', selected.key === key && !selected.isFallback);
      button.classList.toggle('disabled', !affordable || !hasRoom);
      button.disabled = !affordable || !hasRoom;
      button.innerHTML = `
        <div class="craft-row">
          <span class="craft-icon" aria-hidden="true">${item.icon}</span>
          <div>
            <strong>${recipe.name}</strong>
            <div class="subtle">${getItemTypeLabel(item)} · 持有 ${craftedCount}</div>
          </div>
        </div>
        <span class="subtle">${formatCost(recipe.cost)}</span>
      `;
    }

    dom.dayInfoEl.textContent = `第 ${state.day} 天 · ${getTimeLabel()}`;
    dom.weatherInfoEl.textContent = getWeatherText();
    dom.scoreInfoEl.textContent = '生存评分 ' + state.score;
    dom.messageEl.textContent = state.message;
    dom.hintEl.textContent = state.hint;

    const menuState = getItemMenuState();
    if (menuState && !resolveInventoryReference(menuState.source, menuState.index)) {
      closeItemMenu();
    }
  }

  Object.assign(game, {
    createCraftButtons,
    updateUI
  });
})(window.TidalIsle);
