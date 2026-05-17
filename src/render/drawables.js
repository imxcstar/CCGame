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

  // 朝向辅助：将 8 方向解析为身体贴图配置。
  // - up        → 背面帧（看到后脑勺）
  // - down      → 正面帧（看到脸）
  // - left/right→ 侧面帧（明确的左右朝向）
  // - 4 个对角  → 专门的 3/4 视角斜角帧（不再使用倾斜旋转），
  //               通过偏移头部、错开肩膀与双腿来表达左右朝向。
  function getBodyOrientation(facing) {
    switch (facing) {
      case 'up':        return { frame: 'back',       side: null    };
      case 'upleft':    return { frame: 'back-diag',  side: 'left'  };
      case 'upright':   return { frame: 'back-diag',  side: 'right' };
      case 'left':      return { frame: 'side',       side: 'left'  };
      case 'right':     return { frame: 'side',       side: 'right' };
      case 'downleft':  return { frame: 'front-diag', side: 'left'  };
      case 'downright': return { frame: 'front-diag', side: 'right' };
      case 'down':
      default:          return { frame: 'front',      side: null    };
    }
  }

  function drawPlayerBody(facing, bounce, legSwing, armSwing) {
    const orientation = getBodyOrientation(facing);
    switch (orientation.frame) {
      case 'back':
        drawPlayerBackFrame(bounce, legSwing, armSwing);
        break;
      case 'back-diag':
        drawPlayerBackDiagonalFrame(orientation.side, bounce, legSwing, armSwing);
        break;
      case 'side':
        drawPlayerSideFrame(orientation.side, bounce, legSwing, armSwing);
        break;
      case 'front-diag':
        drawPlayerFrontDiagonalFrame(orientation.side, bounce, legSwing, armSwing);
        break;
      case 'front':
      default:
        drawPlayerFrontFrame(bounce, legSwing, armSwing);
    }
  }

  // 无瞄准目标时，根据 8 方向朝向计算默认工具角度（与 atan2(y, x) 一致，y 向下）。
  const FACING_ANGLES = {
    right: 0,
    downright: Math.PI * 0.25,
    down: Math.PI * 0.5,
    downleft: Math.PI * 0.75,
    left: Math.PI,
    upleft: -Math.PI * 0.75,
    up: -Math.PI * 0.5,
    upright: -Math.PI * 0.25
  };

  function getFacingAngle(facing) {
    return FACING_ANGLES[facing] ?? 0;
  }

  // 判断该朝向是否“背对镜头”（up 系列），影响工具的绘制顺序与透明度。
  function isBackFacing(facing) {
    return facing === 'up' || facing === 'upleft' || facing === 'upright';
  }

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
    const handX = player.facing.includes('left') ? -6 : 6;
    const handY = player.facing.startsWith('up') ? -4 : player.facing.startsWith('down') ? 2 : 0;
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

  // 正面 3/4 视角（朝向下方但偏左/右）：
  // - 通过把头、躯干和五官略微偏向朝向侧，并让靠近镜头的肩膀 / 手臂更靠前，
  //   远离镜头的手臂被躯干部分遮挡，画出真正的斜角贴图，不再依赖整体旋转。
  // - side 表示角色朝向的水平方向：'right' 直接绘制；'left' 通过水平镜像复用。
  function drawPlayerFrontDiagonalFrame(side, bounce, legSwing, armSwing) {
    ctx.save();
    if (side === 'left') ctx.scale(-1, 1);

    // 腿：左右错开，朝向侧（右）腿略靠前下，体现斜向迈步
    ctx.fillStyle = '#80604a';
    ctx.fillRect(-5, 17 - bounce, 4, 10 + Math.max(0, legSwing));
    ctx.fillRect(2, 18 - bounce, 4, 10 + Math.max(0, -legSwing));

    // 远侧（左）手臂：先画，会被躯干部分遮挡
    ctx.fillStyle = '#23496b';
    ctx.fillRect(-9, 4 - bounce + armSwing * 0.35, 3, 10);

    // 躯干：略向朝向侧偏移、宽度稍窄，呈 3/4 透视
    ctx.fillStyle = '#3a6fa2';
    ctx.fillRect(-6, -1 - bounce, 14, 18);
    // 朝向侧（右）肩部凸出，强调近侧
    ctx.fillRect(7, 0 - bounce, 3, 7);

    // 近侧（右）手臂：在躯干之上，朝前略低
    ctx.fillStyle = '#23496b';
    ctx.fillRect(8, 5 - bounce - armSwing * 0.35, 3, 11);

    // 头部：圆心向朝向侧偏移 1px
    ctx.fillStyle = '#d8cbb3';
    ctx.beginPath();
    ctx.arc(1, -9 - bounce, 7, 0, Math.PI * 2);
    ctx.fill();
    // 帽子也跟随偏移
    ctx.fillStyle = '#8f6a50';
    ctx.fillRect(-4, -14 - bounce, 10, 3);
    // 眼睛整体偏向朝向侧（右），强化朝向感
    ctx.fillStyle = '#fff7f0';
    ctx.fillRect(-2, -12 - bounce, 2, 2);
    ctx.fillRect(3, -12 - bounce, 2, 2);
    // 朝向侧耳/脸颊轮廓：在远侧脸颊处加一抹深色阴影
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(-6, -10 - bounce, 2, 4);

    ctx.restore();
  }

  // 背面 3/4 视角（朝向上方但偏左/右）：与正面斜角对称，但绘制的是后脑勺与发块。
  function drawPlayerBackDiagonalFrame(side, bounce, legSwing, armSwing) {
    ctx.save();
    if (side === 'left') ctx.scale(-1, 1);

    ctx.fillStyle = '#80604a';
    ctx.fillRect(-5, 17 - bounce, 4, 10 + Math.max(0, legSwing));
    ctx.fillRect(2, 18 - bounce, 4, 10 + Math.max(0, -legSwing));

    // 远侧（左）手臂
    ctx.fillStyle = '#1f4260';
    ctx.fillRect(-9, 4 - bounce + armSwing * 0.2, 3, 10);

    // 躯干（背部色）
    ctx.fillStyle = '#315f89';
    ctx.fillRect(-6, -1 - bounce, 14, 18);
    // 朝向侧肩部
    ctx.fillRect(7, 0 - bounce, 3, 7);
    // 后背中间的深色块（衣服后片），同样向朝向侧偏移以呈现 3/4 视角
    ctx.fillStyle = '#1d3c58';
    ctx.fillRect(-3, 4 - bounce, 8, 7);

    // 近侧（右）手臂
    ctx.fillStyle = '#1f4260';
    ctx.fillRect(8, 5 - bounce - armSwing * 0.2, 3, 10);

    // 后脑勺：偏向朝向侧
    ctx.fillStyle = '#d8cbb3';
    ctx.beginPath();
    ctx.arc(1, -9 - bounce, 7, 0, Math.PI * 2);
    ctx.fill();
    // 头发帽边
    ctx.fillStyle = '#8f6a50';
    ctx.fillRect(-4, -7 - bounce, 10, 3);
    // 远侧脸颊阴影，强化朝向感
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(-6, -10 - bounce, 2, 4);

    ctx.restore();
  }

  function drawPlayerNameLabel(name, color, bounce) {
    if (!name) return;
    ctx.font = '600 11px "Microsoft YaHei", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 名字显示在角色脚下，避免与头顶手持物 / 工具图标重叠；不绘制背景框，
    // 仅使用文字描边保证在任何地形上都可读。`bounce` 让名字随脚步轻微抖动，
    // 与角色脚部保持一致的视觉关联。
    const labelY = 26 + bounce * 0.4;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8, 20, 30, 0.78)';
    ctx.strokeText(name, 0, labelY);
    ctx.fillStyle = color || '#f1f7ff';
    ctx.fillText(name, 0, labelY);
  }

  function getLocalPlayerLabel() {
    const session = game.netSession;
    if (!session || !session.state || !session.state.role) return null;
    const selfId = game.netTransport?.getSelfId?.();
    const selfPeer = selfId ? session.state.peers?.get(selfId) : null;
    const name = selfPeer?.name || session.state.localName || '';
    if (!name) return null;
    const color = selfPeer?.color || session.state.localColor || '';
    return { name, color };
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
      : getFacingAngle(player.facing);
    const walkPhase = player.animationTime || 0;
    const legSwing = player.isMoving ? Math.sin(walkPhase) * 2.6 : 0;
    const armSwing = player.isMoving ? Math.sin(walkPhase + Math.PI) * 2.2 : 0;
    const bounce = player.isMoving ? Math.abs(Math.sin(walkPhase)) * 1.4 : 0;

    // 攻击 / 砍树：手部上下小角度抖两下（不再触发画面抖动）。
    // attackCooldown 起始为 0.26s，progress 从 0→1 期间播放 2 个完整正弦周期 = 2 次上下抖动，
    // 末段振幅逐步衰减回 0，过渡更自然。
    const ATTACK_SWING_DURATION = 0.26;
    let attackSwing = 0;
    if (player.attackCooldown > 0) {
      const progress = clamp(1 - player.attackCooldown / ATTACK_SWING_DURATION, 0, 1);
      attackSwing = Math.sin(progress * Math.PI * 4) * 0.32 * (1 - progress);
    }
    const heldAngle = angle + attackSwing;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (player.hurtTimer > 0) ctx.globalAlpha = 0.74;
    const facing = player.facing;
    if (isBackFacing(facing)) {
      // 背对镜头：先画工具（被身体遮挡），再画身体
      ctx.save();
      ctx.globalAlpha *= 0.85;
      drawHeldTool(toolKey, heldAngle, 1 - bounce);
      ctx.restore();
      drawPlayerBody(facing, bounce, legSwing, armSwing);
    } else {
      drawPlayerBody(facing, bounce, legSwing, armSwing);
      drawHeldTool(toolKey, heldAngle, 1 - bounce);
    }

    // 联机模式下给本机角色头顶也绘制名字气泡（房主能看见自己的名字）
    const localLabel = getLocalPlayerLabel();
    if (localLabel) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 1;
      drawPlayerNameLabel(localLabel.name, localLabel.color, bounce);
      ctx.globalAlpha = prevAlpha;
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

    // 在玩家可建造范围内绘制方格栅格，方便玩家（特别是触屏）选择目标格
    drawBuildGrid(preview, shakeX, shakeY);

    const screen = worldToScreen(preview.x, preview.y, shakeX, shakeY);
    drawStructureGhost(preview.kind, screen, preview.valid);
  }

  function drawBuildGrid(preview, shakeX, shakeY) {
    if (!preview) return;
    const transform = getComponent(state.playerId, 'transform');
    if (!transform) return;

    // 建造范围与 canPlaceStructure 中使用的 BUILD_RANGE 一致
    const range = game.BUILD_RANGE;
    if (!Number.isFinite(range)) return;
    const minTileX = Math.floor((transform.x - range) / TILE);
    const maxTileX = Math.floor((transform.x + range) / TILE);
    const minTileY = Math.floor((transform.y - range) / TILE);
    const maxTileY = Math.floor((transform.y + range) / TILE);

    const previewTileX = Math.floor(preview.x / TILE);
    const previewTileY = Math.floor(preview.y / TILE);

    ctx.save();
    ctx.lineWidth = 1;

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        const cx = tx * TILE + TILE * 0.5;
        const cy = ty * TILE + TILE * 0.5;
        // 用真实建造判定函数确定该格是否可放置（含树木 / 已有建筑 / 玩家本身等）
        const valid = game.canPlaceStructure?.(preview.kind, cx, cy) === true;
        const isPointed = tx === previewTileX && ty === previewTileY;
        // 不在范围内的格子（distance 超出）不绘制，与圆形建造范围视觉一致
        const dx = cx - transform.x;
        const dy = cy - transform.y;
        if (dx * dx + dy * dy > range * range) continue;

        const screen = worldToScreen(cx, cy, shakeX, shakeY);
        const x = screen.x - TILE * 0.5;
        const y = screen.y - TILE * 0.5;

        ctx.globalAlpha = isPointed ? 0.35 : 0.18;
        ctx.fillStyle = valid ? '#83f5ce' : '#ff8da3';
        ctx.fillRect(x, y, TILE, TILE);

        ctx.globalAlpha = isPointed ? 0.85 : 0.45;
        ctx.strokeStyle = valid ? '#1b8a6a' : '#a8425a';
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }

    ctx.restore();
  }

  function drawRemotePlayer(peer, shakeX, shakeY) {
    if (!peer || typeof peer.x !== 'number' || typeof peer.y !== 'number') return;
    const screen = worldToScreen(peer.x, peer.y, shakeX, shakeY);
    if (screen.x < -120 || screen.y < -160 || screen.x > view.width + 120 || screen.y > view.height + 120) return;

    const walkPhase = peer.animationTime || 0;
    const legSwing = peer.isMoving ? Math.sin(walkPhase) * 2.6 : 0;
    const armSwing = peer.isMoving ? Math.sin(walkPhase + Math.PI) * 2.2 : 0;
    const bounce = peer.isMoving ? Math.abs(Math.sin(walkPhase)) * 1.4 : 0;
    const facing = peer.facing || 'down';

    ctx.save();
    ctx.translate(screen.x, screen.y);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    drawPlayerBody(facing, bounce, legSwing, armSwing);

    // 玩家颜色描边（区分远端玩家）
    if (peer.color) {
      ctx.strokeStyle = peer.color;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(0, -3 - bounce, 11, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 昵称气泡
    drawPlayerNameLabel(peer.name, peer.color, bounce);

    ctx.restore();
  }

  Object.assign(game, {
    drawTile,
    drawEntity,
    drawStructure,
    drawEnemy,
    drawPlayer,
    drawRemotePlayer,
    drawFishingCast,
    drawSelectedWorldTargetHighlight,
    drawParticles,
    drawBuildGhost
  });
})(window.TidalIsle);
