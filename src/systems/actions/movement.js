(function (game) {
  const {
    tileWalkable,
    tileAtWorld,
    dist,
    getStructureIds,
    getResourceIds,
    getComponent,
    getStructureConfig,
    getEntityConfig
  } = game;

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

      const collisionRadius = getStructureConfig(structure.kind)?.collisionRadius ?? collider.radius;
      if (collisionRadius > 0 && dist(x, y, transform.x, transform.y) < radius + collisionRadius) return true;
    }

    // 资源节点（树木、石头、椰子树、灌木）作为障碍物阻挡移动；
    // 只在 alive 时阻挡，被采集后/重生前可通过。
    for (const entityId of getResourceIds()) {
      if (actorId === entityId) continue;
      const transform = getComponent(entityId, 'transform');
      const collider = getComponent(entityId, 'collider');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (!transform || !collider || !resourceNode?.alive) continue;

      // 优先用配置中的 collisionRadius（可在 entity 配置中独立调节），否则
      // 按 collider 半径的 70% 作为阻挡半径，比命中判定略小，给玩家留出
      // 走位的余地，避免被卡住。
      const config = getEntityConfig?.(resourceNode.kind);
      const collisionRadius =
        config?.collisionRadius != null
          ? config.collisionRadius
          : Math.max(6, collider.radius * 0.7);
      if (collisionRadius > 0 && dist(x, y, transform.x, transform.y) < radius + collisionRadius) return true;
    }

    return false;
  }

  function moveActorEntity(entityId, dx, dy) {
    const transform = getComponent(entityId, 'transform');
    const collider = getComponent(entityId, 'collider');
    if (!transform || !collider) return { x: 0, y: 0 };

    let movedX = 0;
    let movedY = 0;

    if (!isBlocked(transform.x + dx, transform.y, collider.radius, entityId)) {
      transform.x += dx;
      movedX = dx;
    }
    if (!isBlocked(transform.x, transform.y + dy, collider.radius, entityId)) {
      transform.y += dy;
      movedY = dy;
    }

    return { x: movedX, y: movedY };
  }

  Object.assign(game, {
    isBlocked,
    moveActorEntity
  });
})(window.TidalIsle);
