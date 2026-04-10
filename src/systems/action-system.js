(function (game) {
  const {
    state,
    dist,
    countInventoryItem,
    removeItemFromInventory,
    showMessage,
    setScore,
    getComponent,
    getPlayerSnapshot,
    getStructureIds,
    burst,
    getSelectedItem,
    isBuildableItem,
    tryPlaceStructure,
    getAttackTarget,
    getEnemyDamage,
    getResourceDamage,
    hitEnemy,
    harvestResource
  } = game;

  function getActiveToolKey() {
    const selected = getSelectedItem();
    return selected.item?.toolKey || 'hands';
  }

  function interact() {
    if (!state.running || state.over) return;

    const player = getPlayerSnapshot();
    if (!player?.transform || !player.inventory || !player.survival || !player.health) return;

    const candidates = getStructureIds()
      .filter((structureId) => {
        const transform = getComponent(structureId, 'transform');
        const structure = getComponent(structureId, 'structure');
        if (!transform || !structure) return false;
        return (structure.kind === 'campfire' || structure.kind === 'collector') && dist(player.transform.x, player.transform.y, transform.x, transform.y) < 62;
      })
      .sort((firstId, secondId) => {
        const first = getComponent(firstId, 'transform');
        const second = getComponent(secondId, 'transform');
        return dist(player.transform.x, player.transform.y, first.x, first.y) - dist(player.transform.x, player.transform.y, second.x, second.y);
      });

    for (const structureId of candidates) {
      const transform = getComponent(structureId, 'transform');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !structure) continue;

      if (structure.kind === 'campfire' && countInventoryItem(player.inventory, 'wood') > 0) {
        removeItemFromInventory(player.inventory, 'wood', 1);
        structure.fuel = Math.min(120, (structure.fuel || 0) + 28);
        burst(transform.x, transform.y, '#ffca74', 6, 28);
        showMessage('篝火添柴 +1');
        setScore();
        return;
      }

      if (structure.kind === 'collector' && (structure.water || 0) > 0) {
        structure.water -= 1;
        player.survival.thirst = Math.min(100, player.survival.thirst + 34);
        player.survival.energy = Math.min(100, player.survival.energy + 6);
        burst(transform.x, transform.y, '#81e7ff', 7, 30);
        showMessage('取水成功');
        return;
      }
    }

    showMessage('附近没有可交互目标');
  }

  function getStructureHintText(structureId) {
    const player = getPlayerSnapshot();
    const structure = getComponent(structureId, 'structure');
    if (!player?.inventory || !structure) return '';

    if (structure.kind === 'campfire') {
      return countInventoryItem(player.inventory, 'wood') > 0 ? 'E 添柴：让篝火在夜里持续发光' : '';
    }

    if (structure.kind === 'collector') {
      return structure.water > 0 ? 'E 取水：雨水收集器已储满 ' + structure.water + ' 单位' : '';
    }

    return '';
  }

  function primaryAction() {
    if (!state.running || state.over) return;

    const selected = getSelectedItem();
    if (!selected.isFallback && isBuildableItem(selected.item)) {
      tryPlaceStructure();
      return;
    }

    const player = getPlayerSnapshot();
    if (!player?.transform || !player.player) return;
    if (player.player.attackCooldown > 0) return;

    player.player.attackCooldown = 0.26;
    const tool = getActiveToolKey();
    const target = getAttackTarget();
    burst(player.transform.x, player.transform.y, 'rgba(230,245,255,0.8)', 3, 30);

    if (!target) return;

    const damage = target.group === 'enemy' ? getEnemyDamage(tool, target.id) : getResourceDamage(tool, target.id);
    state.shake = Math.max(state.shake, 4);

    if (target.group === 'resource') {
      const health = getComponent(target.id, 'health');
      const resourceNode = getComponent(target.id, 'resourceNode');
      if (!health || !resourceNode?.alive) return;
      health.hp -= damage;
      health.hitTimer = 0.18;
      if (health.hp <= 0) harvestResource(target.id);
      return;
    }

    hitEnemy(target.id, damage);
  }

  Object.assign(game, {
    interact,
    getStructureHintText,
    primaryAction
  });
})(window.TidalIsle);
