(function (game) {
  const { state, getComponent, queryEntities } = game;

  function getEntitySnapshot(entityId) {
    if (!entityId) return null;
    return {
      id: entityId,
      transform: getComponent(entityId, 'transform'),
      collider: getComponent(entityId, 'collider'),
      health: getComponent(entityId, 'health'),
      player: getComponent(entityId, 'player'),
      survival: getComponent(entityId, 'survival'),
      inventory: getComponent(entityId, 'inventory'),
      resourceNode: getComponent(entityId, 'resourceNode'),
      structure: getComponent(entityId, 'structure'),
      enemy: getComponent(entityId, 'enemy'),
      particle: getComponent(entityId, 'particle')
    };
  }

  function getPlayerSnapshot() {
    return getEntitySnapshot(state.playerId);
  }

  function getStructureIds() {
    return queryEntities(['structure', 'transform']);
  }

  function getResourceIds() {
    return queryEntities(['resourceNode', 'transform', 'health', 'collider']);
  }

  function getEnemyIds() {
    return queryEntities(['enemy', 'transform', 'health', 'collider']);
  }

  function getParticleIds() {
    return queryEntities(['particle', 'transform']);
  }

  Object.assign(game, {
    getEntitySnapshot,
    getPlayerSnapshot,
    getStructureIds,
    getResourceIds,
    getEnemyIds,
    getParticleIds
  });
})(window.TidalIsle);
