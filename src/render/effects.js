(function (game) {
  const { ctx, state, view, clamp, worldToScreen, getDaylight, getComponent, getStructureIds, getStructureLight } = game;

  const lightCanvas = document.createElement('canvas');
  const lightCtx = lightCanvas.getContext('2d');

  function ensureLightCanvas() {
    if (lightCanvas.width !== view.width) lightCanvas.width = view.width;
    if (lightCanvas.height !== view.height) lightCanvas.height = view.height;
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function getEveningAtmosphere() {
    if (state.time < 0.55 && state.time > 0.18) return null;

    const phase = state.time >= 0.55 ? state.time : state.time + 1;
    const dusk = smoothstep(0.55, 0.72, phase) * (1 - smoothstep(0.9, 1.06, phase));
    const night = smoothstep(0.68, 0.88, phase) * (1 - smoothstep(1.02, 1.18, phase));
    const ember = smoothstep(0.56, 0.74, phase) * (1 - smoothstep(0.78, 0.94, phase));

    return { dusk, night, ember };
  }

  function drawAtmosphere() {
    const atmosphere = getEveningAtmosphere();
    if (!atmosphere) return;

    const { dusk, night, ember } = atmosphere;
    if (dusk <= 0.01 && night <= 0.01 && ember <= 0.01) return;

    ctx.save();

    const skyGradient = ctx.createLinearGradient(0, 0, 0, view.height);
    skyGradient.addColorStop(0, `rgba(255, 177, 110, ${0.05 * ember + 0.04 * dusk})`);
    skyGradient.addColorStop(0.28, `rgba(255, 119, 78, ${0.12 * ember + 0.08 * dusk})`);
    skyGradient.addColorStop(0.62, `rgba(74, 92, 158, ${0.06 * dusk + 0.11 * night})`);
    skyGradient.addColorStop(1, `rgba(6, 18, 36, ${0.1 * dusk + 0.24 * night})`);
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, view.width, view.height);

    const horizonGradient = ctx.createLinearGradient(0, view.height * 0.16, 0, view.height);
    horizonGradient.addColorStop(0, 'rgba(255, 112, 62, 0)');
    horizonGradient.addColorStop(0.5, `rgba(255, 132, 76, ${0.13 * ember + 0.04 * dusk})`);
    horizonGradient.addColorStop(0.78, `rgba(18, 48, 89, ${0.08 * dusk + 0.12 * night})`);
    horizonGradient.addColorStop(1, `rgba(4, 10, 18, ${0.08 * night})`);
    ctx.fillStyle = horizonGradient;
    ctx.fillRect(0, 0, view.width, view.height);

    if (night > 0.02) {
      const vignette = ctx.createRadialGradient(
        view.width * 0.5,
        view.height * 0.42,
        view.width * 0.14,
        view.width * 0.5,
        view.height * 0.48,
        Math.max(view.width, view.height) * 0.78
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(0.64, `rgba(7, 18, 34, ${0.08 * night})`);
      vignette.addColorStop(1, `rgba(2, 6, 14, ${0.24 * night})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, view.width, view.height);
    }

    ctx.restore();
  }

  function drawLighting() {
    const darkness = clamp((0.58 - getDaylight()) * 1.35, 0, 0.75);
    if (darkness <= 0.01) return;

    ensureLightCanvas();
    lightCtx.clearRect(0, 0, view.width, view.height);
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = `rgba(2, 8, 18, ${darkness})`;
    lightCtx.fillRect(0, 0, view.width, view.height);
    lightCtx.globalCompositeOperation = 'destination-out';

    const playerTransform = getComponent(state.playerId, 'transform');
    const lights = playerTransform ? [{ x: playerTransform.x, y: playerTransform.y - 6, radius: 170, strength: 1, core: 34 }] : [];
    for (const structureId of getStructureIds()) {
      const light = getStructureLight(structureId);
      if (light) lights.push(light);
    }

    for (const light of lights) {
      const screen = worldToScreen(light.x, light.y);
      const coreRadius = light.core ?? Math.max(14, light.radius * 0.12);
      const strength = clamp(light.strength ?? 0.72, 0, 1);
      const gradient = lightCtx.createRadialGradient(screen.x, screen.y, coreRadius, screen.x, screen.y, light.radius);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gradient.addColorStop(0.28, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lightCtx.fillStyle = gradient;
      lightCtx.beginPath();
      lightCtx.arc(screen.x, screen.y, light.radius, 0, Math.PI * 2);
      lightCtx.fill();
    }

    lightCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0);
  }

  Object.assign(game, {
    getEveningAtmosphere,
    drawAtmosphere,
    drawLighting
  });
})(window.TidalIsle);
