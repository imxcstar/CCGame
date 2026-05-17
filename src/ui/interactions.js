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
    runSelectedWorldTargetAction,
    showMessage,
    setScore
  } = game;

  function getSlotTarget(target) {
    return target?.closest?.('[data-slot-source][data-slot-index]') || null;
  }

  // 判断当前设备是否应当走"触屏"交互路径。
  // 仅依赖 game.isTouchMode()（首次 touch 才会被设上）在 iOS 等环境下不可靠：
  // - iPad 选择"请求桌面网站"时 (pointer: coarse) 可能不匹配
  // - iOS 内嵌浏览器 / 部分版本对 PointerEvent.pointerType 返回空字符串
  // - 首次触摸的 pointerdown 早于 window 的 touchstart 监听
  // 因此这里再叠加 (pointer: coarse) 媒体查询和 ontouchstart 嗅探作为兜底。
  function isTouchCapableEnvironment() {
    if (game.isTouchMode?.()) return true;
    if (typeof window !== 'undefined') {
      if (typeof window.matchMedia === 'function') {
        try {
          if (window.matchMedia('(pointer: coarse)').matches) return true;
          if (window.matchMedia('(hover: none)').matches) return true;
        } catch (_err) {
          /* 旧浏览器：忽略 */
        }
      }
      if ('ontouchstart' in window) return true;
      if (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) return true;
    }
    return false;
  }

  function bindSlotSurface(surface, source) {
    surface.addEventListener('mousemove', (event) => {
      // 触屏模式下，浏览器在 touch 后会合成 mousemove 事件，会让 tooltip
      // 在移动端 itemMenu 打开后再次弹出，遮挡操作菜单，因此直接跳过。
      if (isTouchCapableEnvironment()) return;
      const slot = getSlotTarget(event.target);
      if (!slot) {
        closeTooltip();
        return;
      }
      const index = Number(slot.dataset.slotIndex);
      renderTooltip(getDisplayReference(source, index), source, index, event.clientX, event.clientY);
    });

    surface.addEventListener('mouseleave', () => {
      if (isTouchCapableEnvironment()) return;
      closeTooltip();
    });

    surface.addEventListener('contextmenu', (event) => {
      const slot = getSlotTarget(event.target);
      if (!slot) return;
      event.preventDefault();
      // 触屏长按会触发 contextmenu，但移动端的菜单由 bindInventoryTouchMenu
      // 处理，这里若再次执行会导致 tooltip 出现在移动端 itemMenu 之上。
      if (isTouchCapableEnvironment()) return;
      const index = Number(slot.dataset.slotIndex);
      openItemMenu(source, index, event.clientX, event.clientY);
      renderTooltip(getDisplayReference(source, index), source, index, event.clientX, event.clientY);
    });

    surface.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      // 触屏点击的 pointerdown 同样 button===0，若在此处执行 selectItemReference
      // 会先把物品选中；随后用户在移动端 itemMenu 点击"设为手持"时，
      // selectItemReference 检测到已选中相同槽位会反向取消选中，
      // 导致"设为手持没有效果"。移动端的选中由"设为手持"按钮单独触发。
      // 严格要求 pointerType === 'mouse'：iOS Safari 合成的 pointerdown
      // 有时 pointerType 为空字符串，旧的 `pointerType && pointerType!=='mouse'`
      // 判断会漏放这类事件，导致触屏下被误判为鼠标点击。
      if (event.pointerType !== 'mouse') return;
      if (isTouchCapableEnvironment()) return;
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

    dom.worldTargetPanelEl?.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-world-action]');
      if (!button) return;
      game.playSound?.('click');
      runSelectedWorldTargetAction?.(button.dataset.worldAction);
      game.updateUI?.();
    });

    document.addEventListener('pointerdown', (event) => {
      if (dom.itemMenuEl.contains(event.target)) return;
      if (event.button === 2) return;
      closeItemMenu();
      closeTooltip();
    });

    window.addEventListener('blur', () => {
      closeItemMenu();
      closeTooltip();
    });
  }

  function bindOverlayButtons() {
    dom.startBtn.addEventListener('click', () => {
      game.unlockAudio?.();
      game.playSound?.('start');
      dom.startOverlay.classList.remove('show');
      dom.gameOverOverlay.classList.remove('show');
      state.running = true;
      showMessage('先收集材料，再制作工具和建造套件');
      setScore();
    });

    dom.restartBtn.addEventListener('click', () => {
      game.unlockAudio?.();
      game.playSound?.('start');
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
