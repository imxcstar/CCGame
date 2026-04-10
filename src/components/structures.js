(function (game) {
  const { ctx, getComponent, STRUCTURE_COMPONENTS } = game;

  const RECIPES = Object.fromEntries(
    Object.entries(STRUCTURE_COMPONENTS).map(([kind, component]) => [kind, { name: component.name, cost: component.cost }])
  );

  function getStructureConfig(kind) {
    return STRUCTURE_COMPONENTS[kind] || null;
  }

  function drawStructureSprite(entityId, screen) {
    const transform = getComponent(entityId, 'transform');
    const structure = getComponent(entityId, 'structure');
    if (!transform || !structure) return;

    const component = getStructureConfig(structure.kind);
    if (!component?.draw) return;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 12, component.shadowRadius || 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    component.draw(structure);
    ctx.restore();
  }

  function drawStructureGhost(kind, screen, valid) {
    const component = getStructureConfig(kind);
    if (!component?.draw) return;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.globalAlpha = valid ? 0.42 : 0.2;
    component.draw({ kind, ...(component.initialState?.() || {}) });
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = valid ? '#d5fff1' : '#ffd5dc';
    ctx.lineWidth = 2;
    ctx.strokeRect(screen.x - 16, screen.y - 16, 32, 32);
    ctx.restore();
  }

  function getStructureLight(entityId) {
    const transform = getComponent(entityId, 'transform');
    const structure = getComponent(entityId, 'structure');
    if (!transform || !structure) return null;

    const light = getStructureConfig(structure.kind)?.getLight?.(structure);
    if (!light) return null;
    return { x: transform.x, y: transform.y, radius: light.radius, strength: light.strength };
  }

  function canStructureOverlap(kind, otherKind) {
    return getStructureConfig(kind)?.canOverlap?.(otherKind) === true;
  }

  Object.assign(game, {
    RECIPES,
    getStructureConfig,
    drawStructureSprite,
    drawStructureGhost,
    getStructureLight,
    canStructureOverlap
  });
})(window.TidalIsle);
