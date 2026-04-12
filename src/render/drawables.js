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
    getSelectedWorldTarget,
    getStructureConfig,
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

  function drawHeldTool(toolKey, angle, yOffset = 0) {
    ctx.save();
    ctx.translate(0, yOffset);
    ctx.rotate(angle);
    ctx.strokeStyle = '#e6f6ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    if (toolKey === 'spear') ctx.lineTo(22, -3);
    else if (toolKey === 'pickaxe') ctx.lineTo(18, 5);
    else if (toolKey === 'axe') ctx.lineTo(18, 2);
    else if (toolKey === 'fishingRod') ctx.lineTo(24, -9);
    else ctx.lineTo(14, 0);
    ctx.stroke();

    if (toolKey === 'fishingRod') {
      ctx.strokeStyle = 'rgba(220, 245, 255, 0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(20, -7);
      ctx.lineTo(25, -13);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawFishingCast(shakeX, shakeY) {
    const transform = getComponent(state.playerId, 'transform');
    const player = getComponent(state.playerId, 'player');
    if (!transform || !player || !state.fishing?.active) return;

    const playerScreen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
    const bobberScreen = worldToScreen(state.fishing.x, state.fishing.y, shakeX, shakeY);
    const bobOffset = Math.sin(state.fishing.animationTime || 0) * (state.fishing.phase === 'bite' ? 2.2 : 1.1);
    const handX = player.facing === 'left' ? -6 : 6;
    const handY = player.facing === 'up' ? -4 : player.facing === 'down' ? 2 : 0;
    const arcHeight = Math.max(18, Math.min(54, Math.abs(bobberScreen.x - playerScreen.x) * 0.22 + 18));

    ctx.save();
    ctx.strokeStyle = 'rgba(220, 245, 255, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(playerScreen.x + handX, playerScreen.y - 6 + handY);
    ctx.quadraticCurveTo(
      (playerScreen.x + bobberScreen.x) * 0.5,
      Math.min(playerScreen.y, bobberScreen.y) - arcHeight,
      bobberScreen.x,
      bobberScreen.y + bobOffset
    );
    ctx.stroke();

    ctx.fillStyle = '#fff4f4';
    ctx.beginPath();
    ctx.arc(bobberScreen.x, bobberScreen.y + bobOffset, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff7d88';
    ctx.fillRect(bobberScreen.x - 1, bobberScreen.y - 6 + bobOffset, 2, 5);

    if (state.fishing.ripple > 0) {
      ctx.strokeStyle = `rgba(160, 231, 255, ${state.fishing.ripple * 0.65})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(bobberScreen.x, bobberScreen.y + 3 + bobOffset, 8 + state.fishing.ripple * 8, 4 + state.fishing.ripple * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayerFrontFrame(bounce, legSwing, armSwing) {
    ctx.fillStyle = '#80604a';
    ctx.fillRect(-5, 17 - bounce, 4, 10 + Math.max(0, legSwing));
    ctx.fillRect(1, 17 - bounce, 4, 10 + Math.max(0, -legSwing));
    ctx.fillStyle = '#23496b';
    ctx.fillRect(-10, 4 - bounce + armSwing * 0.35, 3, 11);
    ctx.fillRect(7, 4 - bounce - armSwing * 0.35, 3, 11);
    ctx.fillStyle = '#3a6fa2';
    ctx.fillRect(-8, -1 - bounce, 16, 18);
    ctx.fillStyle = '#d8cbb3';
    ctx.beginPath();
    ctx.arc(0, -9 - bounce, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f6a50';
    ctx.fillRect(-5, -14 - bounce, 10, 3);
    ctx.fillStyle = '#fff7f0';
    ctx.fillRect(-4, -12 - bounce, 2, 2);
    ctx.fillRect(2, -12 - bounce, 2, 2);
  }

  function drawPlayerBackFrame(bounce, legSwing, armSwing) {
    ctx.fillStyle = '#80604a';
    ctx.fillRect(-5, 17 - bounce, 4, 10 + Math.max(0, legSwing));
    ctx.fillRect(1, 17 - bounce, 4, 10 + Math.max(0, -legSwing));
    ctx.fillStyle = '#1f4260';
    ctx.fillRect(-10, 4 - bounce + armSwing * 0.2, 3, 10);
    ctx.fillRect(7, 4 - bounce - armSwing * 0.2, 3, 10);
    ctx.fillStyle = '#315f89';
    ctx.fillRect(-8, -1 - bounce, 16, 18);
    ctx.fillStyle = '#1d3c58';
    ctx.fillRect(-4, 4 - bounce, 8, 7);
    ctx.fillStyle = '#d8cbb3';
    ctx.beginPath();
    ctx.arc(0, -9 - bounce, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f6a50';
    ctx.fillRect(-5, -7 - bounce, 10, 3);
  }

  function drawPlayerSideFrame(facing, bounce, legSwing, armSwing) {
    ctx.save();
    if (facing === 'left') ctx.scale(-1, 1);
    ctx.fillStyle = '#80604a';
    ctx.fillRect(-2, 17 - bounce, 4, 10 + Math.max(0, legSwing));
    ctx.fillRect(2, 17 - bounce, 4, 10 + Math.max(0, -legSwing));
    ctx.fillStyle = '#1f4260';
    ctx.fillRect(-6, 4 - bounce + armSwing * 0.25, 3, 10);
    ctx.fillStyle = '#3a6fa2';
    ctx.fillRect(-5, -1 - bounce, 10, 18);
    ctx.fillStyle = '#d8cbb3';
    ctx.beginPath();
    ctx.arc(2, -9 - bounce, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f6a50';
    ctx.fillRect(0, -14 - bounce, 7, 3);
    ctx.fillStyle = '#fff7f0';
    ctx.fillRect(5, -11 - bounce, 2, 2);
    ctx.fillStyle = '#23496b';
    ctx.fillRect(5, 3 - bounce - armSwing * 0.35, 3, 11);
    ctx.restore();
  }

  function drawPlayer(shakeX, shakeY) {
    const transform = getComponent(state.playerId, 'transform');
    const player = getComponent(state.playerId, 'player');
    if (!transform || !player) return;

    const selected = getSelectedItem();
    const toolKey = selected.item?.toolKey || 'hands';
    const screen = worldToScreen(transform.x, transform.y, shakeX, shakeY);
    const hasPointer = state.pointer.x || state.pointer.y;
    const pointerWorld = hasPointer ? screenToWorld(state.pointer.x, state.pointer.y) : null;
    const aimTarget = toolKey === 'fishingRod' && state.fishing?.active ? state.fishing : pointerWorld;
    const angle = aimTarget
      ? Math.atan2(aimTarget.y - transform.y, aimTarget.x - transform.x)
      : player.facing === 'left'
        ? Math.PI
        : player.facing === 'up'
          ? -Math.PI * 0.5
          : player.facing === 'down'
            ? Math.PI * 0.5
            : 0;
    const walkPhase = player.animationTime || 0;
    const legSwing = player.isMoving ? Math.sin(walkPhase) * 2.6 : 0;
    const armSwing = player.isMoving ? Math.sin(walkPhase + Math.PI) * 2.2 : 0;
    const bounce = player.isMoving ? Math.abs(Math.sin(walkPhase)) * 1.4 : 0;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (player.hurtTimer > 0) ctx.globalAlpha = 0.74;
    if (player.facing === 'up') {
      ctx.save();
      ctx.globalAlpha *= 0.85;
      drawHeldTool(toolKey, angle, 1 - bounce);
      ctx.restore();
      drawPlayerBackFrame(bounce, legSwing, armSwing);
    } else if (player.facing === 'left' || player.facing === 'right') {
      drawPlayerSideFrame(player.facing, bounce, legSwing, armSwing);
      drawHeldTool(toolKey, angle, 1 - bounce);
    } else {
      drawPlayerFrontFrame(bounce, legSwing, armSwing);
      drawHeldTool(toolKey, angle, 1 - bounce);
    }

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

  function drawSelectedWorldTargetHighlight(shakeX, shakeY) {
    const target = getSelectedWorldTarget?.();
    if (!target?.transform) return;

    const screen = worldToScreen(target.transform.x, target.transform.y, shakeX, shakeY);
    const pulse = 0.55 + Math.sin(performance.now() * 0.008) * 0.2;
    let radius = 18;
    let color = '#6ee7ff';

    if (target.group === 'structure') {
      const config = getStructureConfig(target.structure.kind);
      radius = Math.max(18, (config?.collisionRadius || config?.radius || 14) + 8);
      color = '#83f5ce';
    } else if (target.group === 'resource') {
      radius = Math.max(18, (target.collider?.radius || 12) + 8);
      color = '#ffd37c';
    } else if (target.group === 'enemy') {
      radius = Math.max(18, (target.collider?.radius || 12) + 10);
      color = '#ff768a';
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45 + pulse * 0.35;
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + 12, radius, Math.max(8, radius * 0.45), 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.82;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + 12, radius + 5, Math.max(10, radius * 0.58), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
    drawFishingCast,
    drawSelectedWorldTargetHighlight,
    drawParticles,
    drawBuildGhost
  });
})(window.TidalIsle);
