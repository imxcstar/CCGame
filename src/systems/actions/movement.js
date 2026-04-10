(function (game) {
  const { tileWalkable, tileAtWorld, dist, getStructureIds, getComponent } = game;

  function isBlocked(x, y, radius, actorId = null) {
    const samples = [
      [x, y],
      [x + radius * 0.7, y],
      [x - radius * 0.7, y],
      [x, y + radius * 0.7],
      [x, y - radius * 0.7]
    ];

    for (const [sampleX, sampleY] of samples) {
      if (!tileWalkable(tileAtWorld(sampleX, sampleY))) return true;
    }

    for (const structureId of getStructureIds()) {
      if (actorId === structureId) continue;
      const transform = getComponent(structureId, 'transform');
      const collider = getComponent(structureId, 'collider');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !collider || !structure) continue;
      if (structure.kind === 'floor') continue;
      if (collider.radius > 0 && dist(x, y, transform.x, transform.y) < radius + collider.radius) return true;
    }

    return false;
  }

  function moveActorEntity(entityId, dx, dy) {
    const transform = getComponent(entityId, 'transform');
    const collider = getComponent(entityId, 'collider');
    if (!transform || !collider) return;

    if (!isBlocked(transform.x + dx, transform.y, collider.radius, entityId)) transform.x += dx;
    if (!isBlocked(transform.x, transform.y + dy, collider.radius, entityId)) transform.y += dy;
  }

  Object.assign(game, {
    isBlocked,
    moveActorEntity
  });
})(window.TidalIsle);
