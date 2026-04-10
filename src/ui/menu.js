(function (game) {
  const {
    dom,
    resolveInventoryReference,
    positionFloatingElement,
    useItemReference,
    bindItemReference,
    dropItemReference,
    clearHotbarReference
  } = game;

  let menuState = null;

  function getItemMenuState() {
    return menuState;
  }

  function closeItemMenu() {
    menuState = null;
    dom.itemMenuEl.classList.remove('show');
  }

  function openItemMenu(source, index, x, y) {
    const reference = resolveInventoryReference(source, index);
    if (!reference || reference.isFallback) {
      closeItemMenu();
      return;
    }

    menuState = { source, index };
    const item = reference.item;
    const canUse = item.type !== 'material';

    dom.itemMenuTitleEl.innerHTML = `<span aria-hidden="true">${item.icon}</span><strong>${item.name}</strong>`;
    dom.itemMenuUseBtn.disabled = !canUse;
    dom.itemMenuBindBtn.hidden = source !== 'inventory';
    dom.itemMenuClearBtn.hidden = source !== 'hotbar';
    dom.itemMenuEl.classList.add('show');
    positionFloatingElement(dom.itemMenuEl, x, y, 8, 8);
  }

  function bindContextMenuButtons() {
    dom.itemMenuUseBtn.addEventListener('click', () => {
      if (!menuState) return;
      useItemReference(menuState.source, menuState.index);
      closeItemMenu();
      game.updateUI();
    });

    dom.itemMenuBindBtn.addEventListener('click', () => {
      if (!menuState) return;
      bindItemReference(menuState.source, menuState.index);
      closeItemMenu();
      game.updateUI();
    });

    dom.itemMenuDropBtn.addEventListener('click', () => {
      if (!menuState) return;
      dropItemReference(menuState.source, menuState.index);
      closeItemMenu();
      game.updateUI();
    });

    dom.itemMenuClearBtn.addEventListener('click', () => {
      if (!menuState) return;
      clearHotbarReference(menuState.index);
      closeItemMenu();
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
