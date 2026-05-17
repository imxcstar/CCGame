(function (game) {
  const {
    dom,
    resolveInventoryReference,
    positionFloatingElement,
    useItemReference,
    dropItemReference
  } = game;

  let menuState = null;

  function getItemMenuState() {
    return menuState;
  }

  function closeItemMenu() {
    menuState = null;
    dom.itemMenuEl.classList.remove('show');
    if (dom.itemMenuDescEl) {
      dom.itemMenuDescEl.textContent = '';
      dom.itemMenuDescEl.classList.remove('show');
    }
  }

  function openItemMenu(source, index, x, y, options = {}) {
    const reference = resolveInventoryReference(source, index);
    if (!reference || reference.isFallback) {
      closeItemMenu();
      return;
    }

    menuState = { source, index };
    const item = reference.item;
    const canUse = item.type !== 'material';

    dom.itemMenuTitleEl.innerHTML = `<span aria-hidden="true">${item.icon}</span><strong>${item.name}</strong>`;
    dom.itemMenuUseBtn.textContent = item.type === 'consumable' ? '立即使用' : '设为手持';
    dom.itemMenuUseBtn.disabled = !canUse;
    dom.itemMenuBindBtn.hidden = true;
    dom.itemMenuClearBtn.hidden = true;

    // 是否在菜单内显示物品描述（移动端把 tooltip 合并到这里）
    if (dom.itemMenuDescEl) {
      const showDesc = options.showDescription === true;
      if (showDesc) {
        dom.itemMenuDescEl.textContent = item.description || '暂无描述。';
        dom.itemMenuDescEl.classList.add('show');
      } else {
        dom.itemMenuDescEl.textContent = '';
        dom.itemMenuDescEl.classList.remove('show');
      }
    }

    dom.itemMenuEl.classList.add('show');
    positionFloatingElement(dom.itemMenuEl, x, y, 8, 8);
  }

  function bindContextMenuButtons() {
    dom.itemMenuUseBtn.addEventListener('click', () => {
      if (!menuState) return;
      const reference = resolveInventoryReference(menuState.source, menuState.index);
      const isEquip = reference && !reference.isFallback && reference.item?.type !== 'consumable' && reference.item?.type !== 'material';
      useItemReference(menuState.source, menuState.index);
      closeItemMenu();
      game.closeTooltip?.();
      // 移动端：设为手持后自动关闭背包面板，让玩家立刻看到地图（特别是建造物方格）
      if (isEquip && game.isTouchMode?.() && game.closeMobilePanel) {
        game.closeMobilePanel('inventoryPanel');
      }
      game.updateUI();
    });

    dom.itemMenuDropBtn.addEventListener('click', () => {
      if (!menuState) return;
      dropItemReference(menuState.source, menuState.index);
      closeItemMenu();
      game.closeTooltip?.();
      game.updateUI();
    });

  }

  Object.assign(game, {
    getItemMenuState,
    closeItemMenu,
    openItemMenu,
    bindContextMenuButtons
  });
})(window.TidalIsle);
