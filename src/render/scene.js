(function (game) {
  const {
    ctx,
    state,
    view,
    TILE,
    randomBetween,
    getComponent,
    getStructureIds,
    getResourceIds,
    getEnemyIds,
    drawTile,
    drawEntity,
    drawStructure,
    drawEnemy,
    drawPlayer,
    drawFishingCast,
    drawParticles,
    drawBuildGhost,
    drawAtmosphere,
    drawLighting
  } = game;

  function renderScene() {
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.fillStyle = '#052237';
    ctx.fillRect(0, 0, view.width, view.height);

    const shakeX = state.running && state.shake > 0 ? randomBetween(-state.shake, state.shake) : 0;
    const shakeY = state.running && state.shake > 0 ? randomBetween(-state.shake, state.shake) : 0;

    const startX = Math.floor((state.camera.x - view.width * 0.5) / TILE) - 2;
    const endX = Math.ceil((state.camera.x + view.width * 0.5) / TILE) + 2;
    const startY = Math.floor((state.camera.y - view.height * 0.5) / TILE) - 2;
    const endY = Math.ceil((state.camera.y + view.height * 0.5) / TILE) + 2;

    for (let tileY = startY; tileY <= endY; tileY++) {
      for (let tileX = startX; tileX <= endX; tileX++) {
        drawTile(tileX, tileY, shakeX, shakeY);
      }
    }

    if (!state.playerId) return;

    const drawables = [];
    for (const structureId of getStructureIds()) {
      const transform = getComponent(structureId, 'transform');
      if (transform) drawables.push({ y: transform.y, type: 'structure', id: structureId });
    }
    for (const entityId of getResourceIds()) {
      const transform = getComponent(entityId, 'transform');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (transform && resourceNode?.alive) drawables.push({ y: transform.y, type: 'entity', id: entityId });
    }
    for (const enemyId of getEnemyIds()) {
      const transform = getComponent(enemyId, 'transform');
      if (transform) drawables.push({ y: transform.y, type: 'enemy', id: enemyId });
    }

    const playerTransform = getComponent(state.playerId, 'transform');
    if (playerTransform) drawables.push({ y: playerTransform.y, type: 'player', id: state.playerId });
    drawables.sort((first, second) => first.y - second.y);

    for (const drawable of drawables) {
      if (drawable.type === 'structure') drawStructure(drawable.id, shakeX, shakeY);
      if (drawable.type === 'entity') drawEntity(drawable.id, shakeX, shakeY);
      if (drawable.type === 'enemy') drawEnemy(drawable.id, shakeX, shakeY);
      if (drawable.type === 'player') drawPlayer(shakeX, shakeY);
    }

    drawFishingCast(shakeX, shakeY);
    drawBuildGhost(shakeX, shakeY);
    drawParticles(shakeX, shakeY);
    drawAtmosphere();
    drawLighting();

    const player = getComponent(state.playerId, 'player');
    if (player?.hurtTimer > 0) {
      ctx.fillStyle = `rgba(255, 68, 104, ${player.hurtTimer * 0.18})`;
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  Object.assign(game, {
    renderScene
  });
})(window.TidalIsle);
