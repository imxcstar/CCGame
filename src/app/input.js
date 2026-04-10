(function (game) {
  const { canvas, keys, state, view, resize, HOTBAR_SIZE } = game;

  function cycleHotbar(delta) {
    state.selectedSlot = (state.selectedSlot + delta + HOTBAR_SIZE) % HOTBAR_SIZE;
  }

  function bindInput() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat && event.code === 'KeyE') return;
      keys[event.code] = true;

      if (event.code.startsWith('Digit')) {
        const value = Number(event.code.replace('Digit', ''));
        if (value >= 1 && value <= HOTBAR_SIZE) state.selectedSlot = value - 1;
      }
      if (event.code === 'KeyE') game.interact?.();
      if (event.code === 'Escape') game.closeItemMenu?.();
    });

    window.addEventListener('keyup', (event) => {
      keys[event.code] = false;
    });

    canvas.addEventListener('mousemove', (event) => {
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
    });

    canvas.addEventListener('mousedown', (event) => {
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
      game.closeItemMenu?.();
      if (event.button === 0) game.primaryAction?.();
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        cycleHotbar(event.deltaY > 0 ? 1 : -1);
        game.closeItemMenu?.();
      },
      { passive: false }
    );

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('resize', () => {
      resize();
      if (!state.pointer.x && !state.pointer.y) {
        state.pointer.x = view.width * 0.5;
        state.pointer.y = view.height * 0.5;
      }
    });
  }

  Object.assign(game, {
    cycleHotbar,
    bindInput
  });
})(window.TidalIsle);
