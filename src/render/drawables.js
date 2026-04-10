(function (game) {
  const {
    ctx,
    state,
    view,
    TILE,
    clamp,
    tileAt,
    worldToScreen,
    screenToWorld,
    getComponent,
    getBuildPreview,
    getSelectedItem,
    getParticleIds,
    drawTileSprite,
    drawEntitySprite,
    drawStructureSprite,
    drawStructureGhost,
    drawEnemySprite
  } = game;

  function drawTile(tileX, tileY, shakeX, shakeY) {
    const tile = tileAt(tileX, tileY);
    const worldX = tileX * TILE;
    const worldY = tileY * TILE;
    const screen = worldToScreen(worldX, worldY, shakeX, shakeY);

    if (screen.x > view.width + TILE || screen.y > view.height + TILE || screen.x < -TILE || screen.y < -TILE) return;
    drawTileSprite(tile, screen, tileX, tileY);
  }

  function drawEntity(entityId, shakeX, shakeY) {
    const transform = getComponent(entityId, 'transform');
    const resourceNode = getComponent(entityId, 'resourceNode');
    if (!transform || !resourceNode?.alive) return;

    const screen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
    if (screen.x < -80 || screen.y < -80 || screen.x > view.width + 80 || screen.y > view.height + 80) return;
    drawEntitySprite(entityId, screen);
  }

  function drawStructure(structureId, shakeX, shakeY) {
    const transform = getComponent(structureId, 'transform');
    if (!transform) return;

    const screen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
    if (screen.x < -80 || screen.y < -80 || screen.x > view.width + 80 || screen.y > view.height + 80) return;
    drawStructureSprite(structureId, screen);
  }

  function drawEnemy(enemyId, shakeX, shakeY) {
    const transform = getComponent(enemyId, 'transform');
    if (!transform) return;

    const screen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
    if (screen.x < -80 || screen.y < -80 || screen.x > view.width + 80 || screen.y > view.height + 80) return;
    drawEnemySprite(enemyId, screen);
  }

  function drawPlayer(shakeX, shakeY) {
    const transform = getComponent(state.playerId, 'transform');
    const player = getComponent(state.playerId, 'player');
    if (!transform || !player) return;

    const selected = getSelectedItem();
    const toolKey = selected.item?.toolKey || 'hands';
    const screen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
    const pointerWorld = screenToWorld(state.pointer.x, state.pointer.y);
    const angle = Math.atan2(pointerWorld.y - transform.y, pointerWorld.x - transform.x);

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (player.hurtTimer > 0) ctx.globalAlpha = 0.74;
    ctx.fillStyle = '#d8cbb3';
    ctx.beginPath();
    ctx.arc(0, -8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a6fa2';
    ctx.fillRect(-8, 0, 16, 18);
    ctx.fillStyle = '#23496b';
    ctx.fillRect(-9, 5, 4, 12);
    ctx.fillRect(5, 5, 4, 12);
    ctx.fillStyle = '#80604a';
    ctx.fillRect(-5, 18, 4, 10);
    ctx.fillRect(1, 18, 4, 10);
    ctx.rotate(angle);
    ctx.strokeStyle = '#e6f6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    if (toolKey === 'spear') ctx.lineTo(22, -3);
    else if (toolKey === 'pickaxe') ctx.lineTo(18, 5);
    else if (toolKey === 'axe') ctx.lineTo(18, 2);
    else ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(shakeX, shakeY) {
    for (const particleId of getParticleIds()) {
      const transform = getComponent(particleId, 'transform');
      const particle = getComponent(particleId, 'particle');
      if (!transform || !particle) continue;

      const screen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(screen.x, screen.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawBuildGhost(shakeX, shakeY) {
    const preview = getBuildPreview();
    if (!preview) return;
    const screen = worldToScreen(preview.x, preview.y, shakeX, shakeY);
    drawStructureGhost(preview.kind, screen, preview.valid);
  }

  Object.assign(game, {
    drawTile,
    drawEntity,
    drawStructure,
    drawEnemy,
    drawPlayer,
    drawParticles,
    drawBuildGhost
  });
})(window.TidalIsle);
