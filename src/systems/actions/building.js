(function (game) {
  const {
    state,
    TILE,
    dist,
    tileAtWorld,
    tileWalkable,
    screenToWorld,
    showMessage,
    setScore,
    removeItemFromInventorySlot,
    getComponent,
    canStructureOverlap,
    createStructureEntity,
    getPlayerSnapshot,
    getStructureIds,
    getResourceIds,
    burst,
    getItemConfig,
    isBuildableItem,
    getSelectedItem
  } = game;

  function canPlaceStructure(kind, x, y) {
    const player = getPlayerSnapshot();
    if (!player?.transform) return false;
    if (!tileWalkable(tileAtWorld(x, y))) return false;
    if (dist(player.transform.x, player.transform.y, x, y) > 118) return false;

    for (const structureId of getStructureIds()) {
      const transform = getComponent(structureId, 'transform');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !structure) continue;
      if (!canStructureOverlap(kind, structure.kind) && dist(transform.x, transform.y, x, y) < 26) return false;
    }

    for (const entityId of getResourceIds()) {
      const transform = getComponent(entityId, 'transform');
      const collider = getComponent(entityId, 'collider');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (!transform || !collider || !resourceNode?.alive) continue;
      if (dist(transform.x, transform.y, x, y) < collider.radius + 12) return false;
    }

    if (dist(player.transform.x, player.transform.y, x, y) < 26) return false;
    return true;
  }

  function getBuildPreview() {
    const selected = getSelectedItem();
    if (!selected || selected.isFallback || !isBuildableItem(selected.item)) return null;

    const pointerWorld = screenToWorld(state.pointer.x, state.pointer.y);
    const tileX = Math.floor(pointerWorld.x / TILE);
    const tileY = Math.floor(pointerWorld.y / TILE);
    const x = tileX * TILE + TILE * 0.5;
    const y = tileY * TILE + TILE * 0.5;
    const kind = selected.item.buildKind;

    return {
      itemKey: selected.key,
      inventoryIndex: selected.inventoryIndex,
      kind,
      x,
      y,
      valid: canPlaceStructure(kind, x, y)
    };
  }

  function tryPlaceStructure() {
    const player = getPlayerSnapshot();
    const preview = getBuildPreview();
    if (!player?.inventory || !preview) return;

    if (!preview.valid) {
      showMessage('这里无法建造');
      return;
    }

    const removed = removeItemFromInventorySlot(player.inventory, preview.inventoryIndex, 1);
    if (removed <= 0) {
      showMessage('对应的建造物已不在背包中');
      return;
    }

    createStructureEntity(preview.kind, preview.x, preview.y);
    burst(preview.x, preview.y, '#83f5ce', 10, 44);
    state.shake = Math.max(state.shake, 2);
    showMessage('建造完成：' + getItemConfig(preview.itemKey).name);
    setScore();
  }

  Object.assign(game, {
    canPlaceStructure,
    getBuildPreview,
    tryPlaceStructure
  });
})(window.TidalIsle);
