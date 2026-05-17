(function (game) {
  const {
    state,
    TILE,
    BUILD_RANGE,
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
    if (dist(player.transform.x, player.transform.y, x, y) > BUILD_RANGE) return false;

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
    if (!player?.inventory || !preview) return false;

    if (!preview.valid) {
      showMessage('这里无法建造');
      return false;
    }

    const removed = removeItemFromInventorySlot(player.inventory, preview.inventoryIndex, 1);
    if (removed <= 0) {
      showMessage('对应的建造物已不在背包中');
      return false;
    }

    if (!player.inventory.slots[preview.inventoryIndex] && state.selectedInventoryIndex === preview.inventoryIndex) {
      state.selectedInventoryIndex = null;
    }

    // 联机：client 把建造请求发给 host，host 校验通过后创建实体并通过
    // ENTITY_DELTA 同步回本机（届时会自动出现 ghost）；校验失败时 host 回
    // 发 INVENTORY 退款。本地不做乐观放置，避免与 host 决策冲突。
    if (state.netMode === 'client' && typeof game.netClientRequestPlaceStructure === 'function') {
      const dispatched = game.netClientRequestPlaceStructure(preview.itemKey, preview.kind, preview.x, preview.y);
      if (!dispatched) {
        // 派发失败（网络未就绪等）：把刚扣掉的物品加回去
        game.addInventory?.({ [preview.itemKey]: 1 });
        return false;
      }
      // 局部反馈但不真正创建实体（实体由 host 广播过来）
      burst(preview.x, preview.y, '#83f5ce', 10, 44);
      state.shake = Math.max(state.shake, 2);
      game.playSound?.('build');
      showMessage('已发起建造：' + getItemConfig(preview.itemKey).name);
      setScore();
      return true;
    }

    createStructureEntity(preview.kind, preview.x, preview.y);
    burst(preview.x, preview.y, '#83f5ce', 10, 44);
    state.shake = Math.max(state.shake, 2);
    game.playSound?.('build');
    showMessage('建造完成：' + getItemConfig(preview.itemKey).name);
    setScore();
    return true;
  }

  Object.assign(game, {
    canPlaceStructure,
    getBuildPreview,
    tryPlaceStructure
  });
})(window.TidalIsle);
