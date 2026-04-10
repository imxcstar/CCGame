(function (game) {
  const { getParticleIds, getComponent, destroyEntity } = game;

  function updateParticleSystem(dt) {
    for (const particleId of getParticleIds()) {
      const transform = getComponent(particleId, 'transform');
      const particle = getComponent(particleId, 'particle');
      if (!transform || !particle) continue;

      particle.life -= dt;
      transform.x += particle.vx * dt;
      transform.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      particle.vy += 18 * dt;

      if (particle.life <= 0) destroyEntity(particleId);
    }
  }

  Object.assign(game, {
    updateParticleSystem
  });
})(window.TidalIsle);
