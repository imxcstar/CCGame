(function (game) {
  const { state, keys } = game;

  function frame(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const dt = Math.min(0.033, (timestamp - state.lastTimestamp) / 1000 || 0.016);
    state.lastTimestamp = timestamp;

    if (state.running && !state.over) {
      game.update?.(dt, keys);
    }

    game.render?.();
    requestAnimationFrame(frame);
  }

  function startMainLoop() {
    requestAnimationFrame(frame);
  }

  Object.assign(game, {
    frame,
    startMainLoop
  });
})(window.TidalIsle);
