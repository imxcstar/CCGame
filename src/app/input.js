(function (game) {
  const { canvas, keys, state, view, resize, getSelectedItem, setSelectedInventoryIndex, showMessage } = game;

  function bindInput() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat && event.code === 'KeyE') return;
      keys[event.code] = true;

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

      if (event.button === 2) {
        const selected = getSelectedItem?.();
        if (selected && !selected.isFallback) {
          setSelectedInventoryIndex?.(null);
          showMessage?.('已取消手持');
        }
        return;
      }

      if (event.button === 0) game.primaryAction?.();
    });

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
    bindInput
  });
})(window.TidalIsle);
