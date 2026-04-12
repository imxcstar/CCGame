(function (game) {
  const {
    state,
    dom,
    view,
    WORLD_SIZE,
    TILE,
    MINIMAP_BASE_SIZE,
    tileAt,
    getPlayerSnapshot,
    getStructureIds,
    getEnemyIds,
    getComponent
  } = game;

  const minimapBaseCanvas = document.createElement('canvas');
  const minimapBaseCtx = minimapBaseCanvas.getContext('2d');

  const MINIMAP_TILE_COLORS = {
    deep: '#06283d',
    water: '#0f537f',
    sand: '#b79f68',
    grass: '#3f6f47',
    meadow: '#5b8550',
    stone: '#7b8481'
  };

  function rebuildMinimapBase() {
    if (!state.world?.ready) return;

    minimapBaseCanvas.width = MINIMAP_BASE_SIZE;
    minimapBaseCanvas.height = MINIMAP_BASE_SIZE;
    minimapBaseCtx.clearRect(0, 0, MINIMAP_BASE_SIZE, MINIMAP_BASE_SIZE);
    minimapBaseCtx.imageSmoothingEnabled = false;

    for (let pixelY = 0; pixelY < MINIMAP_BASE_SIZE; pixelY++) {
      for (let pixelX = 0; pixelX < MINIMAP_BASE_SIZE; pixelX++) {
        const tileX = Math.min(WORLD_SIZE - 1, Math.floor(((pixelX + 0.5) / MINIMAP_BASE_SIZE) * WORLD_SIZE));
        const tileY = Math.min(WORLD_SIZE - 1, Math.floor(((pixelY + 0.5) / MINIMAP_BASE_SIZE) * WORLD_SIZE));
        minimapBaseCtx.fillStyle = MINIMAP_TILE_COLORS[tileAt(tileX, tileY)] || '#dbe8f0';
        minimapBaseCtx.fillRect(pixelX, pixelY, 1, 1);
      }
    }

    state.mapMeta.minimapDirty = false;
  }

  function worldToMinimap(worldX, worldY, inset, mapSize) {
    const worldExtent = WORLD_SIZE * TILE;
    return {
      x: inset + (worldX / worldExtent) * mapSize,
      y: inset + (worldY / worldExtent) * mapSize
    };
  }

  function drawMarker(ctx, x, y, color, radius) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function getStructureMarkerColor(kind) {
    if (kind === 'campfire') return '#ffd37c';
    if (kind === 'collector') return '#81e7ff';
    if (kind === 'wall') return '#d9aa7b';
    return '#dff6ff';
  }

  function renderMinimap() {
    const canvas = dom.minimapEl;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.world?.ready) return;

    if (minimapBaseCanvas.width !== MINIMAP_BASE_SIZE || state.mapMeta?.minimapDirty) {
      rebuildMinimapBase();
    }

    const inset = 8;
    const mapSize = Math.min(canvas.width, canvas.height) - inset * 2;
    const worldExtent = WORLD_SIZE * TILE;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = 'rgba(5, 18, 28, 0.96)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(minimapBaseCanvas, inset, inset, mapSize, mapSize);

    const cameraX = inset + ((state.camera.x - view.width * 0.5) / worldExtent) * mapSize;
    const cameraY = inset + ((state.camera.y - view.height * 0.5) / worldExtent) * mapSize;
    const cameraW = Math.max(4, (view.width / worldExtent) * mapSize);
    const cameraH = Math.max(4, (view.height / worldExtent) * mapSize);
    ctx.strokeStyle = 'rgba(239, 248, 255, 0.36)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.max(inset, Math.min(inset + mapSize - cameraW, cameraX)),
      Math.max(inset, Math.min(inset + mapSize - cameraH, cameraY)),
      cameraW,
      cameraH
    );

    for (const structureId of getStructureIds()) {
      const transform = getComponent(structureId, 'transform');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !structure) continue;
      const marker = worldToMinimap(transform.x, transform.y, inset, mapSize);
      drawMarker(ctx, marker.x, marker.y, getStructureMarkerColor(structure.kind), structure.kind === 'wall' ? 1.4 : 2);
    }

    for (const enemyId of getEnemyIds()) {
      const transform = getComponent(enemyId, 'transform');
      if (!transform) continue;
      const marker = worldToMinimap(transform.x, transform.y, inset, mapSize);
      drawMarker(ctx, marker.x, marker.y, '#ff768a', 1.6);
    }

    const player = getPlayerSnapshot();
    if (player?.transform) {
      const marker = worldToMinimap(player.transform.x, player.transform.y, inset, mapSize);
      drawMarker(ctx, marker.x, marker.y, '#06131f', 4);
      drawMarker(ctx, marker.x, marker.y, '#6ee7ff', 2.6);
    }

    ctx.strokeStyle = 'rgba(187, 226, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(inset - 0.5, inset - 0.5, mapSize + 1, mapSize + 1);
    ctx.restore();
  }

  function render() {
    game.renderScene();
    renderMinimap();
  }

  Object.assign(game, {
    render,
    renderMinimap
  });
})(window.TidalIsle);
