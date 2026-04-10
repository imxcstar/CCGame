(function (game) {
  const { getComponent, ENTITY_COMPONENTS } = game;

  function pickEntityKind(tile, random) {
    for (const [kind, component] of Object.entries(ENTITY_COMPONENTS)) {
      if (component.canSpawn?.(tile, random)) return kind;
    }
    return null;
  }

  function getEntityConfig(kind) {
    return ENTITY_COMPONENTS[kind] || null;
  }

  function drawEntitySprite(entityId, screen) {
    const transform = getComponent(entityId, 'transform');
    const collider = getComponent(entityId, 'collider');
    const health = getComponent(entityId, 'health');
    const resourceNode = getComponent(entityId, 'resourceNode');
    if (!transform || !collider || !health || !resourceNode) return;

    const component = getEntityConfig(resourceNode.kind);
    if (!component?.draw) return;

    component.draw(
      {
        x: transform.x,
        y: transform.y,
        radius: collider.radius,
        hitTimer: health.hitTimer
      },
      screen
    );
  }

  Object.assign(game, {
    pickEntityKind,
    getEntityConfig,
    drawEntitySprite
  });
})(window.TidalIsle);
