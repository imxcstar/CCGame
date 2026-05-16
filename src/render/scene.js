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
    getSelectedWorldTarget,
    drawTile,
    drawEntity,
    drawStructure,
    drawEnemy,
    drawPlayer,
    drawRemotePlayer,
    drawFishingCast,
    drawSelectedWorldTargetHighlight,
    drawParticles,
    drawFloaters,
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
    // 木地板视觉上是地面贴花：它的 y 与站在上面的玩家/敌人非常接近，参与
    // y 排序时会出现"地板挡住角色"的情况。这里把 floor 单独抽出来，先于
    // 所有可排序对象绘制，等价于贴在地块层之上、其它实体之下。
    const floorIds = [];
    for (const structureId of getStructureIds()) {
      const transform = getComponent(structureId, 'transform');
      if (!transform) continue;
      const structure = getComponent(structureId, 'structure');
      if (structure?.kind === 'floor') {
        floorIds.push(structureId);
      } else {
        drawables.push({ y: transform.y, type: 'structure', id: structureId });
      }
    }
    for (const floorId of floorIds) {
      drawStructure(floorId, shakeX, shakeY);
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

    // 远端玩家 ghost：与本地玩家一起参与 y 排序，确保前后遮挡正确
    if (state.players && state.players.size) {
      state.players.forEach((peer) => {
        if (peer.isLocal) return;
        if (typeof peer.y !== 'number') return;
        drawables.push({ y: peer.y, type: 'remotePlayer', id: peer.id, peer });
      });
    }

    drawables.sort((first, second) => first.y - second.y);

    const selectedTarget = getSelectedWorldTarget?.();
    const selectedTargetType = selectedTarget?.group === 'resource'
      ? 'entity'
      : selectedTarget?.group;

    for (const drawable of drawables) {
      if (selectedTarget && drawable.id === selectedTarget.id && drawable.type === selectedTargetType) {
        drawSelectedWorldTargetHighlight(shakeX, shakeY);
      }
      if (drawable.type === 'structure') drawStructure(drawable.id, shakeX, shakeY);
      if (drawable.type === 'entity') drawEntity(drawable.id, shakeX, shakeY);
      if (drawable.type === 'enemy') drawEnemy(drawable.id, shakeX, shakeY);
      if (drawable.type === 'player') drawPlayer(shakeX, shakeY);
      if (drawable.type === 'remotePlayer') drawRemotePlayer(drawable.peer, shakeX, shakeY);
    }

    drawFishingCast(shakeX, shakeY);
    drawBuildGhost(shakeX, shakeY);
    drawParticles(shakeX, shakeY);
    drawFloaters?.(shakeX, shakeY);
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
