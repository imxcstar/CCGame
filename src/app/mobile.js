(function (game) {
  const { state, keys, dom, enableTouchMode } = game;

  // ----------------------------------------------------------------
  // 虚拟摇杆：根据触摸位置更新 KeyW/A/S/D 状态
  // ----------------------------------------------------------------
  function bindJoystick() {
    const joystick = document.getElementById('joystick');
    const stick = document.getElementById('joystickStick');
    if (!joystick || !stick) return;

    const DEAD_ZONE = 0.18;
    let activePointer = null;
    let center = { x: 0, y: 0 };
    let radius = 50; // 视觉拖动半径

    function clearKeys() {
      keys.KeyW = false;
      keys.KeyA = false;
      keys.KeyS = false;
      keys.KeyD = false;
    }

    function resetStick() {
      stick.style.transform = '';
      joystick.classList.remove('active');
      clearKeys();
    }

    function setStick(dx, dy) {
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function applyDirection(dx, dy) {
      const distance = Math.hypot(dx, dy);
      const normalized = distance > 0 ? Math.min(1, distance / radius) : 0;
      const visualScale = distance > 0 ? Math.min(radius, distance) / distance : 0;
      setStick(dx * visualScale, dy * visualScale);

      if (normalized < DEAD_ZONE) {
        clearKeys();
        return;
      }

      const ndx = dx / distance;
      const ndy = dy / distance;
      // 用阈值同时允许斜向行走
      const threshold = 0.4;
      keys.KeyA = ndx < -threshold;
      keys.KeyD = ndx > threshold;
      keys.KeyW = ndy < -threshold;
      keys.KeyS = ndy > threshold;
    }

    function onDown(event) {
      if (activePointer !== null) return;
      enableTouchMode?.();
      activePointer = event.pointerId;
      const rect = joystick.getBoundingClientRect();
      center.x = rect.left + rect.width / 2;
      center.y = rect.top + rect.height / 2;
      radius = rect.width * 0.36;
      joystick.classList.add('active');
      try {
        joystick.setPointerCapture(event.pointerId);
      } catch (_err) {
        /* ignore */
      }
      applyDirection(event.clientX - center.x, event.clientY - center.y);
      event.preventDefault();
    }

    function onMove(event) {
      if (event.pointerId !== activePointer) return;
      applyDirection(event.clientX - center.x, event.clientY - center.y);
      event.preventDefault();
    }

    function onUp(event) {
      if (event.pointerId !== activePointer) return;
      activePointer = null;
      try {
        joystick.releasePointerCapture(event.pointerId);
      } catch (_err) {
        /* ignore */
      }
      resetStick();
    }

    joystick.addEventListener('pointerdown', onDown);
    joystick.addEventListener('pointermove', onMove);
    joystick.addEventListener('pointerup', onUp);
    joystick.addEventListener('pointercancel', onUp);
    joystick.addEventListener('lostpointercapture', resetStick);
  }

  // ----------------------------------------------------------------
  // 动作按钮：攻击 / 交互 / 冲刺
  // ----------------------------------------------------------------
  function bindHoldButton(buttonId, onPress, onRelease) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    let pressed = false;

    function press(event) {
      enableTouchMode?.();
      if (pressed) return;
      pressed = true;
      button.classList.add('pressing');
      onPress?.();
      event?.preventDefault();
    }

    function release(event) {
      if (!pressed) return;
      pressed = false;
      button.classList.remove('pressing');
      onRelease?.();
      event?.preventDefault();
    }

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    // 触屏长按时浏览器默认菜单
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  function bindActionButtons() {
    // 攻击 / 主动作（按下即触发；按住可重复触发动作冷却由游戏内部控制）
    let attackInterval = null;
    bindHoldButton(
      'btnAttack',
      () => {
        game.primaryAction?.();
        attackInterval = setInterval(() => game.primaryAction?.(), 220);
      },
      () => {
        if (attackInterval) {
          clearInterval(attackInterval);
          attackInterval = null;
        }
      }
    );

    // 交互
    bindHoldButton('btnInteract', () => {
      game.interact?.();
    });

    // 冲刺：按住映射为 ShiftLeft
    bindHoldButton(
      'btnSprint',
      () => {
        keys.ShiftLeft = true;
      },
      () => {
        keys.ShiftLeft = false;
      }
    );
  }

  // ----------------------------------------------------------------
  // 面板切换：桌面端通过快捷键切换显示/隐藏（添加 .panel-hidden）；
  // 移动端通过顶部按钮切换显示（添加 .show-mobile，同一时间最多一个）
  // ----------------------------------------------------------------
  const PANEL_TOGGLES = [
    { btnId: 'togglePanelMinimap', panelId: 'minimapPanel' },
    { btnId: 'togglePanelInventory', panelId: 'inventoryPanel' },
    { btnId: 'togglePanelCraft', panelId: 'craftPanel' }
  ];

  function isTouchMode() {
    return document.body.classList.contains('touch-mode');
  }

  function getToggleEntries() {
    return PANEL_TOGGLES
      .map(({ btnId, panelId }) => ({
        btn: document.getElementById(btnId),
        panel: document.getElementById(panelId)
      }))
      .filter((entry) => entry.panel);
  }

  function setMobileVisible(entry, visible) {
    if (!entry.panel) return;
    entry.panel.classList.toggle('show-mobile', visible);
    entry.btn?.classList.toggle('active', visible);
  }

  // 公开的统一面板切换：根据当前是否为触屏决定行为
  function togglePanel(panelId) {
    const entries = getToggleEntries();
    const entry = entries.find((item) => item.panel?.id === panelId);
    if (!entry) return;

    if (isTouchMode()) {
      const willOpen = !entry.panel.classList.contains('show-mobile');
      entries.forEach((other) => {
        if (other !== entry) setMobileVisible(other, false);
      });
      setMobileVisible(entry, willOpen);
    } else {
      const willHide = !entry.panel.classList.contains('panel-hidden');
      entry.panel.classList.toggle('panel-hidden', willHide);
      entry.btn?.classList.toggle('active', !willHide);
    }
    game.playSound?.('panel');
  }

  function bindPanelToggles() {
    const entries = getToggleEntries();
    entries.forEach((entry) => {
      if (!entry.btn) return;
      entry.btn.addEventListener('click', () => {
        togglePanel(entry.panel.id);
      });
    });
  }

  // ----------------------------------------------------------------
  // 背包格触屏点击 = 选中物品并打开介绍 + 操作菜单（无需长按）
  // 移动端：将操作菜单与介绍组合成底部停靠面板，避免相互遮挡
  // ----------------------------------------------------------------
  function dockTooltipAndMenuAtBottom() {
    const tipEl = dom.itemTooltipEl;
    const menuEl = dom.itemMenuEl;
    if (!tipEl || !menuEl) return;

    const sideMargin = 12;
    const bottomMargin = 12;
    const gap = 8;

    const menuVisible = menuEl.classList.contains('show');

    // 统一宽度并贴左右边缘，保证可读区域最大化
    [tipEl, menuEl].forEach((el) => {
      el.style.left = sideMargin + 'px';
      el.style.right = sideMargin + 'px';
      el.style.width = 'auto';
      el.style.maxWidth = 'none';
      el.style.top = 'auto';
    });

    menuEl.style.bottom = bottomMargin + 'px';

    // 介绍贴在菜单上方；若菜单未显示（如默认拳头），介绍直接贴底
    const menuHeight = menuVisible ? menuEl.offsetHeight : 0;
    const tipBottom = bottomMargin + (menuVisible ? menuHeight + gap : 0);
    tipEl.style.bottom = tipBottom + 'px';
  }

  function bindInventoryTouchMenu() {
    const surface = dom.inventoryEl;
    if (!surface) return;

    let target = null;
    let startX = 0;
    let startY = 0;
    let cancelled = false;

    function reset() {
      target = null;
      cancelled = false;
    }

    surface.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      const slot = event.target.closest?.('[data-slot-source][data-slot-index]');
      if (!slot) return;
      target = slot;
      startX = event.clientX;
      startY = event.clientY;
      cancelled = false;
    });

    surface.addEventListener('pointermove', (event) => {
      if (!target) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) {
        cancelled = true;
      }
    });

    surface.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse') return;
      if (!target || cancelled) {
        reset();
        return;
      }
      const source = target.dataset.slotSource;
      const index = Number(target.dataset.slotIndex);

      // 先按桌面坐标打开（内部会做边界钳制），随后改用底部停靠布局覆盖位置
      const rect = target.getBoundingClientRect();
      game.openItemMenu?.(source, index, rect.left, rect.bottom);
      const reference = game.getDisplayReference?.(source, index);
      if (reference) {
        game.renderTooltip?.(reference, source, index, rect.left, rect.top);
      }
      // 等待菜单/介绍渲染后取真实高度，再统一停靠到底部
      dockTooltipAndMenuAtBottom();

      reset();
    });

    surface.addEventListener('pointercancel', reset);
  }

  function bindMobileControls() {
    bindJoystick();
    bindActionButtons();
    bindPanelToggles();
    bindInventoryTouchMenu();
  }

  Object.assign(game, {
    bindMobileControls,
    togglePanel
  });

  // 兼容游戏内 state 未使用的引用，避免被打包工具警告
  void state;
})(window.TidalIsle);
