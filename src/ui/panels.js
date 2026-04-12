(function (game) {
  const {
    state,
    dom,
    craftButtons,
    CRAFTING_RECIPES,
    ITEM_DEFS,
    clamp,
    canAfford,
    canStoreAllItems,
    formatCost,
    getItemTypeLabel,
    getInventoryUsedSlots,
    getPlayerSnapshot,
    getSelectedItem,
    resolveInventoryReference,
    getItemMenuState,
    closeItemMenu,
    craftItem,
    getSelectedWorldTargetInfo,
    getTimeLabel,
    getWeatherText
  } = game;

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
    const selected = getSelectedItem();
    const selectedIndex = selected?.inventoryIndex;
    const inventoryMarkup = `
      <div class="inventory-meta">已用 ${usedSlots}/${player.inventory.size} · 左键切换当前手持 · 右键打开物品菜单</div>
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
          const classes = ['bag-slot', 'filled', selectedIndex === index ? 'selected' : ''].filter(Boolean).join(' ');
          return `
            <div class="${classes}" data-slot-source="inventory" data-slot-index="${index}" style="--item-tint:${item.tint}">
              <span class="bag-slot-index">${index + 1}</span>
              <span class="bag-slot-icon" aria-hidden="true">${item.icon}</span>
              <span class="bag-slot-count">${slot.amount}</span>
            </div>
          `;
        })
        .join('')}
    `;

    if (dom.inventoryEl._markup !== inventoryMarkup) {
      dom.inventoryEl.innerHTML = inventoryMarkup;
      dom.inventoryEl._markup = inventoryMarkup;
    }

    if (dom.hotbarEl && dom.hotbarEl._markup !== '') {
      dom.hotbarEl.innerHTML = '';
      dom.hotbarEl._markup = '';
    }

    for (const [key, button] of craftButtons.entries()) {
      const recipe = CRAFTING_RECIPES[key];
      const affordable = canAfford(recipe.cost);
      const hasRoom = canStoreAllItems(player.inventory, { [key]: 1 });
      const craftedCount = player.inventory.slots.reduce((total, slot) => total + (slot?.key === key ? slot.amount : 0), 0);
      const item = ITEM_DEFS[key];
      const unavailable = !affordable || !hasRoom;
      const markup = `
        <div class="craft-row">
          <span class="craft-icon" aria-hidden="true">${item.icon}</span>
          <div>
            <strong>${recipe.name}</strong>
            <div class="subtle">${getItemTypeLabel(item)} · 持有 ${craftedCount}</div>
          </div>
        </div>
        <span class="subtle">${formatCost(recipe.cost)}</span>
      `;

      button.classList.toggle('active', selected.key === key && !selected.isFallback);
      button.classList.toggle('disabled', unavailable);
      button.disabled = false;
      button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');

      if (button._markup !== markup) {
        button.innerHTML = markup;
        button._markup = markup;
      }
    }

    dom.dayInfoEl.textContent = `第 ${state.day} 天 · ${getTimeLabel()}`;
    dom.weatherInfoEl.textContent = getWeatherText();
    dom.scoreInfoEl.textContent = '生存评分 ' + state.score;
    if (dom.minimapInfoEl) {
      const islandCount = Math.max(1, state.mapMeta?.islandCount || 0);
      const loadedChunks = state.mapMeta?.loadedChunks || 0;
      const queuedChunks = state.mapMeta?.queuedChunks || 0;
      dom.minimapInfoEl.textContent = `群岛 ${islandCount} · 区块 ${loadedChunks}${queuedChunks > 0 ? ` (+${queuedChunks})` : ''}`;
    }
    dom.messageEl.textContent = state.message;
    dom.hintEl.textContent = state.hint;

    if (dom.worldTargetPanelEl) {
      const targetInfo = getSelectedWorldTargetInfo?.();
      if (!targetInfo) {
        dom.worldTargetPanelEl.classList.remove('show');
        if (dom.worldTargetPanelEl._markup !== '') {
          dom.worldTargetPanelEl.innerHTML = '';
          dom.worldTargetPanelEl._markup = '';
        }
      } else {
        const markup = `
          <div class="world-target-head">
            <div>
              <div class="world-target-name">${targetInfo.name}</div>
              <div class="world-target-type">${targetInfo.typeLabel}</div>
            </div>
            <div class="world-target-meta">${targetInfo.meta}</div>
          </div>
          <div class="world-target-desc">${targetInfo.description}</div>
          <div class="world-target-actions">
            ${targetInfo.actions
              .map(
                (action) => `<button type="button" data-world-action="${action.id}" ${action.disabled ? 'disabled' : ''}>${action.label}</button>`
              )
              .join('')}
          </div>
        `;

        if (dom.worldTargetPanelEl._markup !== markup) {
          dom.worldTargetPanelEl.innerHTML = markup;
          dom.worldTargetPanelEl._markup = markup;
        }
        dom.worldTargetPanelEl.classList.add('show');
      }
    }

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
