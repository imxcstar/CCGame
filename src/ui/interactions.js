(function (game) {
  const {
    state,
    dom,
    getDisplayReference,
    closeTooltip,
    renderTooltip,
    openItemMenu,
    closeItemMenu,
    bindContextMenuButtons,
    selectItemReference,
    showMessage,
    setScore
  } = game;

  function getSlotTarget(target) {
    return target?.closest?.('[data-slot-source][data-slot-index]') || null;
  }

  function bindSlotSurface(surface, source) {
    surface.addEventListener('mousemove', (event) => {
      const slot = getSlotTarget(event.target);
      if (!slot) {
        closeTooltip();
        return;
      }
      const index = Number(slot.dataset.slotIndex);
      renderTooltip(getDisplayReference(source, index), source, index, event.clientX, event.clientY);
    });

    surface.addEventListener('mouseleave', () => {
      closeTooltip();
    });

    surface.addEventListener('contextmenu', (event) => {
      const slot = getSlotTarget(event.target);
      if (!slot) return;
      event.preventDefault();
      const index = Number(slot.dataset.slotIndex);
      openItemMenu(source, index, event.clientX, event.clientY);
      renderTooltip(getDisplayReference(source, index), source, index, event.clientX, event.clientY);
    });

    surface.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const slot = getSlotTarget(event.target);
      if (!slot) return;
      const index = Number(slot.dataset.slotIndex);

      if (source === 'inventory') {
        event.preventDefault();
        selectItemReference(source, index);
        closeItemMenu();
        game.updateUI?.();
      }
    });
  }

  function bindInventoryUi() {
    bindSlotSurface(dom.inventoryEl, 'inventory');
    bindContextMenuButtons();

    document.addEventListener('pointerdown', (event) => {
      if (dom.itemMenuEl.contains(event.target)) return;
      if (event.button === 2) return;
      closeItemMenu();
    });

    window.addEventListener('blur', () => {
      closeItemMenu();
      closeTooltip();
    });
  }

  function bindOverlayButtons() {
    dom.startBtn.addEventListener('click', () => {
      dom.startOverlay.classList.remove('show');
      dom.gameOverOverlay.classList.remove('show');
      state.running = true;
      showMessage('先收集材料，再制作工具和建造套件');
      setScore();
    });

    dom.restartBtn.addEventListener('click', () => {
      dom.gameOverOverlay.classList.remove('show');
      game.newGame();
      dom.startOverlay.classList.remove('show');
      state.running = true;
      showMessage('新的潮汐开始了');
      setScore();
      game.updateUI();
    });
  }

  Object.assign(game, {
    bindInventoryUi,
    bindOverlayButtons
  });
})(window.TidalIsle);
