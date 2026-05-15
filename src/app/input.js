(function (game) {
  const { canvas, keys, state, view, resize, getSelectedItem, setSelectedInventoryIndex, showMessage } = game;

  // 是否已经识别为触屏模式（虚拟摇杆等控件由此显示）
  function enableTouchMode() {
    if (document.body.classList.contains('touch-mode')) return;
    document.body.classList.add('touch-mode');
    // 进入触屏后不再使用十字光标
    canvas.style.cursor = 'default';
  }

  // 起点：用于区分轻触（点击）与拖动（瞄准）
  let pointerStart = null;

  function bindInput() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat && event.code === 'KeyE') return;
      keys[event.code] = true;

      if (event.code === 'KeyE') game.interact?.();
      if (event.code === 'Escape') game.closeItemMenu?.();

      // 面板显示 / 隐藏快捷键（避免拦截输入框 / 修饰键组合）
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const tag = event.target?.tagName;
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable;
        if (!isEditable) {
          if (event.code === 'KeyM') {
            game.togglePanel?.('minimapPanel');
            event.preventDefault();
          } else if (event.code === 'KeyB') {
            game.togglePanel?.('inventoryPanel');
            event.preventDefault();
          } else if (event.code === 'KeyC') {
            game.togglePanel?.('craftPanel');
            event.preventDefault();
          }
        }
      }
    });

    window.addEventListener('keyup', (event) => {
      keys[event.code] = false;
    });

    // 使用 pointer events 同时支持鼠标 / 触摸 / 触控笔
    canvas.addEventListener('pointermove', (event) => {
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        enableTouchMode();
      }

      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
      pointerStart = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        button: event.button,
        type: event.pointerType
      };
      game.closeItemMenu?.();

      // 鼠标右键 = 取消手持
      if (event.button === 2) {
        const selected = getSelectedItem?.();
        if (selected && !selected.isFallback) {
          setSelectedInventoryIndex?.(null);
          showMessage?.('已取消手持');
        }
        return;
      }

      // 鼠标左键立即触发主动作（保持桌面端原行为）
      if (event.button === 0 && event.pointerType === 'mouse') {
        game.primaryAction?.();
      }
    });

    canvas.addEventListener('pointerup', (event) => {
      // 触摸：抬起时若是轻触（位移小、时间短）才触发主动作；
      // 这样可以让玩家用拖动来调整瞄准方向而不会误触
      if (pointerStart && pointerStart.type !== 'mouse' && event.button === 0) {
        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;
        const distance = Math.hypot(dx, dy);
        const elapsed = performance.now() - pointerStart.time;
        if (distance < 12 && elapsed < 400) {
          state.pointer.x = event.clientX;
          state.pointer.y = event.clientY;
          game.primaryAction?.();
        }
      }
      pointerStart = null;
    });

    canvas.addEventListener('pointercancel', () => {
      pointerStart = null;
    });

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    window.addEventListener('resize', () => {
      resize();
      if (!state.pointer.x && !state.pointer.y) {
        state.pointer.x = view.width * 0.5;
        state.pointer.y = view.height * 0.5;
      }
    });

    // 首次出现任何 touch 事件，开启触屏模式（兼容不暴露 pointer events 的浏览器）
    window.addEventListener(
      'touchstart',
      () => {
        enableTouchMode();
      },
      { once: true, passive: true }
    );

    // 小屏设备也默认开启触屏控件，便于鼠标用户在窄窗预览
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      enableTouchMode();
    }
  }

  Object.assign(game, {
    bindInput,
    enableTouchMode
  });
})(window.TidalIsle);
