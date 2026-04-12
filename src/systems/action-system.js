(function (game) {
  const {
    TILE,
    ATTACK_RANGE,
    state,
    dist,
    countInventoryItem,
    removeItemFromInventory,
    showMessage,
    setScore,
    addInventory,
    canStoreAllItems,
    getComponent,
    getPlayerSnapshot,
    getStructureIds,
    getResourceIds,
    getEnemyIds,
    burst,
    getSelectedItem,
    getItemConfig,
    getStructureConfig,
    getEntityConfig,
    getEnemyConfig,
    isConsumableItem,
    isBuildableItem,
    consumeInventorySlot,
    tryPlaceStructure,
    getAttackTarget,
    getEnemyDamage,
    getResourceDamage,
    hitEnemy,
    harvestResource,
    screenToWorld,
    tileAtWorld,
    randomBetween,
    randomInt,
    isNight,
    removeChunkStructureEntity,
    destroyEntity
  } = game;

  const RESOURCE_DISPLAY = {
    tree: { name: '树木', description: '可以采集木材，石斧会更高效。' },
    palm: { name: '棕榈树', description: '可以采集木材和椰子。' },
    rock: { name: '岩石', description: '可以采集石块，石镐会更高效。' },
    bush: { name: '灌木', description: '可以采集纤维和浆果。' }
  };

  const ENEMY_DISPLAY = {
    crawler: { name: '暗潮爬行者', description: '夜晚会主动追击你，长矛对它更有效。' }
  };

  function getActiveToolKey() {
    const selected = getSelectedItem();
    return selected.item?.toolKey || 'hands';
  }

  function resetFishingState() {
    state.fishing.active = false;
    state.fishing.phase = 'idle';
    state.fishing.x = 0;
    state.fishing.y = 0;
    state.fishing.tile = '';
    state.fishing.waitTimer = 0;
    state.fishing.reelWindow = 0;
    state.fishing.ripple = 0;
    state.fishing.animationTime = 0;
  }

  function cancelFishing(message = '') {
    if (!state.fishing?.active) return false;
    resetFishingState();
    if (message) showMessage(message);
    return true;
  }

  function isFishableTile(tile) {
    return tile === 'water' || tile === 'deep';
  }

  function getFishingTarget() {
    const player = getPlayerSnapshot();
    if (!player?.transform) return null;

    const pointerWorld = screenToWorld(state.pointer.x, state.pointer.y);
    const tile = tileAtWorld(pointerWorld.x, pointerWorld.y);
    if (!isFishableTile(tile)) return null;

    const tileX = Math.floor(pointerWorld.x / TILE);
    const tileY = Math.floor(pointerWorld.y / TILE);
    const x = tileX * TILE + TILE * 0.5;
    const y = tileY * TILE + TILE * 0.5;
    if (dist(player.transform.x, player.transform.y, x, y) > 108) return null;

    return { x, y, tile };
  }

  function rollFishingCatch(tile) {
    const roll = Math.random();

    if (tile === 'deep') {
      if (isNight() && roll < 0.24) return { eel: 1 };
      if (roll < 0.56) return { mackerel: randomInt(1, 2) };
      if (roll < 0.88) return { sardine: randomInt(1, 2) };
      return { eel: 1 };
    }

    if (isNight() && roll < 0.12) return { eel: 1 };
    if (roll < 0.7) return { sardine: randomInt(1, 2) };
    if (roll < 0.95) return { mackerel: 1 };
    return { eel: 1 };
  }

  function castFishingLine(target) {
    state.fishing.active = true;
    state.fishing.phase = 'waiting';
    state.fishing.x = target.x;
    state.fishing.y = target.y;
    state.fishing.tile = target.tile;
    state.fishing.waitTimer = randomBetween(target.tile === 'deep' ? 1.8 : 1.2, target.tile === 'deep' ? 3.6 : 2.8);
    state.fishing.reelWindow = 0;
    state.fishing.ripple = 0.55;
    state.fishing.animationTime = 0;
    burst(target.x, target.y, '#8fd9ff', 4, 16);
    showMessage('抛竿入水，等浮标下沉再收线');
    return true;
  }

  function reelFishingLine() {
    const player = getPlayerSnapshot();
    if (!player?.inventory || !state.fishing?.active) return false;

    if (state.fishing.phase !== 'bite') {
      showMessage('浮标还没动静');
      return false;
    }

    const loot = rollFishingCatch(state.fishing.tile);
    if (!canStoreAllItems(player.inventory, loot)) {
      burst(state.fishing.x, state.fishing.y, '#b7f1ff', 5, 18);
      resetFishingState();
      showMessage('背包空间不足，鱼脱钩了');
      return false;
    }

    const result = addInventory(loot);
    const text = Object.entries(result.added)
      .map(([key, value]) => value + ' ' + getItemConfig(key).name)
      .join(' · ');

    burst(state.fishing.x, state.fishing.y, '#b7f1ff', 8, 26);
    state.shake = Math.max(state.shake, 1.2);
    resetFishingState();
    showMessage('钓到 ' + text);
    return true;
  }

  function handleFishingAction() {
    if (state.fishing?.active && state.fishing.phase === 'bite') {
      return reelFishingLine();
    }

    const target = getFishingTarget();
    if (!target) {
      showMessage(state.fishing?.active ? '浮标还没动静' : '把浮标抛到近处水面');
      return false;
    }

    return castFishingLine(target);
  }

  function updateFishingSystem(dt) {
    if (!state.fishing?.active || !state.running || state.over) return;

    const player = getPlayerSnapshot();
    const selected = getSelectedItem();
    if (!player?.transform || selected.item?.toolKey !== 'fishingRod') {
      resetFishingState();
      return;
    }

    if (dist(player.transform.x, player.transform.y, state.fishing.x, state.fishing.y) > 132) {
      cancelFishing('收线了：离浮标太远');
      return;
    }

    state.fishing.animationTime += dt * (state.fishing.phase === 'bite' ? 7.5 : 3.2);
    state.fishing.ripple = Math.max(0, state.fishing.ripple - dt * 1.35);

    if (state.fishing.phase === 'waiting') {
      state.fishing.waitTimer -= dt;
      if (state.fishing.waitTimer > 0) return;

      state.fishing.phase = 'bite';
      state.fishing.reelWindow = randomBetween(0.6, 1.0);
      state.fishing.ripple = 1;
      burst(state.fishing.x, state.fishing.y, '#d9f7ff', 6, 22);
      showMessage('有鱼咬钩了，左键收竿', 1.1);
      return;
    }

    state.fishing.reelWindow -= dt;
    if (state.fishing.reelWindow > 0) return;

    burst(state.fishing.x, state.fishing.y, '#6ecfff', 5, 16);
    resetFishingState();
    showMessage('鱼跑掉了');
  }

  function clearSelectedWorldTarget() {
    state.selectedWorldTarget = null;
  }

  function getWorldTargetAtPointer() {
    const pointerWorld = screenToWorld(state.pointer.x, state.pointer.y);
    let best = null;
    let bestScore = Infinity;

    for (const structureId of getStructureIds()) {
      const transform = getComponent(structureId, 'transform');
      const structure = getComponent(structureId, 'structure');
      if (!transform || !structure) continue;

      const config = getStructureConfig(structure.kind);
      const radius = Math.max(18, (config?.collisionRadius || config?.radius || 14) + 10);
      const distance = dist(pointerWorld.x, pointerWorld.y, transform.x, transform.y);
      if (distance > radius) continue;

      const score = distance;
      if (score < bestScore) {
        best = { group: 'structure', id: structureId };
        bestScore = score;
      }
    }

    for (const entityId of getResourceIds()) {
      const transform = getComponent(entityId, 'transform');
      const collider = getComponent(entityId, 'collider');
      const resourceNode = getComponent(entityId, 'resourceNode');
      if (!transform || !collider || !resourceNode?.alive) continue;

      const distance = dist(pointerWorld.x, pointerWorld.y, transform.x, transform.y);
      if (distance > collider.radius + 12) continue;

      const score = distance + 2;
      if (score < bestScore) {
        best = { group: 'resource', id: entityId };
        bestScore = score;
      }
    }

    for (const enemyId of getEnemyIds()) {
      const transform = getComponent(enemyId, 'transform');
      const collider = getComponent(enemyId, 'collider');
      if (!transform || !collider) continue;

      const distance = dist(pointerWorld.x, pointerWorld.y, transform.x, transform.y);
      if (distance > collider.radius + 14) continue;

      const score = distance + 4;
      if (score < bestScore) {
        best = { group: 'enemy', id: enemyId };
        bestScore = score;
      }
    }

    return best;
  }

  function selectWorldTargetAtPointer() {
    const target = getWorldTargetAtPointer();
    state.selectedWorldTarget = target ? { group: target.group, id: target.id } : null;
    return target;
  }

  function getSelectedWorldTarget() {
    const target = state.selectedWorldTarget;
    if (!target?.id || !target.group) return null;

    const transform = getComponent(target.id, 'transform');
    const health = getComponent(target.id, 'health');
    if (!transform) {
      clearSelectedWorldTarget();
      return null;
    }

    if (target.group === 'structure') {
      const structure = getComponent(target.id, 'structure');
      if (!structure || !health) {
        clearSelectedWorldTarget();
        return null;
      }
      return { ...target, transform, health, structure };
    }

    if (target.group === 'resource') {
      const resourceNode = getComponent(target.id, 'resourceNode');
      const collider = getComponent(target.id, 'collider');
      if (!resourceNode?.alive || !collider || !health) {
        clearSelectedWorldTarget();
        return null;
      }
      return { ...target, transform, health, collider, resourceNode };
    }

    if (target.group === 'enemy') {
      const enemy = getComponent(target.id, 'enemy');
      const collider = getComponent(target.id, 'collider');
      if (!enemy || !collider || !health) {
        clearSelectedWorldTarget();
        return null;
      }
      return { ...target, transform, health, collider, enemy };
    }

    clearSelectedWorldTarget();
    return null;
  }

  function getDistanceToTarget(target) {
    const player = getPlayerSnapshot();
    if (!player?.transform || !target?.transform) return Infinity;
    return dist(player.transform.x, player.transform.y, target.transform.x, target.transform.y);
  }

  function interactWithStructure(structureId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(structureId, 'transform');
    const structure = getComponent(structureId, 'structure');
    if (!player?.inventory || !player.survival || !transform || !structure) return false;
    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) >= 62) {
      showMessage('离目标太远');
      return false;
    }

    if (structure.kind === 'campfire') {
      if (countInventoryItem(player.inventory, 'wood') <= 0) {
        showMessage('缺少木材');
        return false;
      }

      removeItemFromInventory(player.inventory, 'wood', 1);
      structure.fuel = Math.min(120, (structure.fuel || 0) + 28);
      burst(transform.x, transform.y, '#ffca74', 6, 28);
      showMessage('篝火添柴 +1');
      setScore();
      return true;
    }

    if (structure.kind === 'collector') {
      if ((structure.water || 0) <= 0) {
        showMessage('雨水收集器还没有水');
        return false;
      }

      structure.water -= 1;
      player.survival.thirst = Math.min(100, player.survival.thirst + 34);
      player.survival.energy = Math.min(100, player.survival.energy + 6);
      burst(transform.x, transform.y, '#81e7ff', 7, 30);
      showMessage('取水成功');
      return true;
    }

    showMessage('这个结构没有可执行操作');
    return false;
  }

  function dismantleStructure(structureId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(structureId, 'transform');
    const structure = getComponent(structureId, 'structure');
    const item = getItemConfig(structure?.kind);
    if (!player?.inventory || !transform || !structure || !item) return false;

    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) > 82) {
      showMessage('离目标太远');
      return false;
    }

    if (!canStoreAllItems(player.inventory, { [structure.kind]: 1 })) {
      showMessage('背包空间不足');
      return false;
    }

    removeChunkStructureEntity?.(structureId);
    destroyEntity(structureId);
    addInventory({ [structure.kind]: 1 });
    burst(transform.x, transform.y, '#83f5ce', 10, 42);
    clearSelectedWorldTarget();
    setScore();
    showMessage('已拆卸 ' + (getStructureConfig(structure.kind)?.name || item.name));
    return true;
  }

  function attackResourceWithHands(resourceId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(resourceId, 'transform');
    const health = getComponent(resourceId, 'health');
    const collider = getComponent(resourceId, 'collider');
    const resourceNode = getComponent(resourceId, 'resourceNode');
    if (!player?.transform || !player.player || !transform || !health || !collider || !resourceNode?.alive) return false;

    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) > ATTACK_RANGE + collider.radius) {
      showMessage('离目标太远');
      return false;
    }

    if (player.player.attackCooldown > 0) return false;

    player.player.attackCooldown = 0.26;
    burst(player.transform.x, player.transform.y, 'rgba(230,245,255,0.8)', 3, 30);
    state.shake = Math.max(state.shake, 4);
    health.hp -= getResourceDamage('hands', resourceId);
    health.hitTimer = 0.18;
    if (health.hp <= 0) {
      harvestResource(resourceId);
      clearSelectedWorldTarget();
    }
    return true;
  }

  function attackEnemyWithHands(enemyId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(enemyId, 'transform');
    const collider = getComponent(enemyId, 'collider');
    const enemy = getComponent(enemyId, 'enemy');
    if (!player?.transform || !player.player || !transform || !collider || !enemy) return false;

    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) > ATTACK_RANGE + collider.radius) {
      showMessage('离目标太远');
      return false;
    }

    if (player.player.attackCooldown > 0) return false;

    player.player.attackCooldown = 0.26;
    burst(player.transform.x, player.transform.y, 'rgba(230,245,255,0.8)', 3, 30);
    state.shake = Math.max(state.shake, 4);
    hitEnemy(enemyId, getEnemyDamage('hands', enemyId));
    if (!getComponent(enemyId, 'enemy')) clearSelectedWorldTarget();
    return true;
  }

  function getSelectedWorldTargetInfo() {
    const selected = getSelectedItem();
    if (!selected?.isFallback) return null;

    const target = getSelectedWorldTarget();
    const player = getPlayerSnapshot();
    if (!target || !player?.inventory) return null;

    const distance = getDistanceToTarget(target);

    if (target.group === 'structure') {
      const config = getStructureConfig(target.structure.kind);
      const item = getItemConfig(target.structure.kind);
      const actions = [];
      const near = distance <= 62;

      if (target.structure.kind === 'campfire') {
        const hasWood = countInventoryItem(player.inventory, 'wood') > 0;
        actions.push({ id: 'interact', label: hasWood ? '添柴' : '缺少木材', disabled: !near || !hasWood });
      }

      if (target.structure.kind === 'collector') {
        const hasWater = (target.structure.water || 0) > 0;
        actions.push({ id: 'interact', label: hasWater ? '取水' : '暂无储水', disabled: !near || !hasWater });
      }

      actions.push({
        id: 'dismantle',
        label: !canStoreAllItems(player.inventory, { [target.structure.kind]: 1 }) ? '背包已满' : '拆卸',
        disabled: distance > 82 || !canStoreAllItems(player.inventory, { [target.structure.kind]: 1 })
      });

      const metaParts = [
        '距离 ' + Math.round(distance),
        '耐久 ' + Math.ceil(target.health.hp) + '/' + Math.ceil(target.health.maxHp)
      ];
      if (target.structure.kind === 'campfire') metaParts.push('燃料 ' + Math.ceil(target.structure.fuel || 0));
      if (target.structure.kind === 'collector') metaParts.push('储水 ' + Math.ceil(target.structure.water || 0));

      return {
        name: config?.name || item.name,
        typeLabel: '建筑',
        meta: metaParts.join(' · '),
        description: item.description || '可以交互或拆卸的营地结构。',
        actions
      };
    }

    if (target.group === 'resource') {
      const display = RESOURCE_DISPLAY[target.resourceNode.kind] || { name: target.resourceNode.kind, description: '可采集资源。' };
      return {
        name: display.name,
        typeLabel: '资源',
        meta: '距离 ' + Math.round(distance) + ' · 储量 ' + Math.max(0, Math.ceil(target.health.hp)),
        description: display.description,
        actions: [{ id: 'gather', label: '采集', disabled: distance > ATTACK_RANGE + target.collider.radius || player.player?.attackCooldown > 0 }]
      };
    }

    const enemyDisplay = ENEMY_DISPLAY[target.enemy.kind] || { name: target.enemy.kind, description: '危险生物。' };
    return {
      name: enemyDisplay.name,
      typeLabel: '敌人',
      meta: '距离 ' + Math.round(distance) + ' · 生命 ' + Math.max(0, Math.ceil(target.health.hp)),
      description: enemyDisplay.description,
      actions: [{ id: 'attack', label: '攻击', disabled: distance > ATTACK_RANGE + target.collider.radius || player.player?.attackCooldown > 0 }]
    };
  }

  function runSelectedWorldTargetAction(actionId) {
    const target = getSelectedWorldTarget();
    if (!target) return false;

    if (target.group === 'structure') {
      if (actionId === 'interact') return interactWithStructure(target.id);
      if (actionId === 'dismantle') return dismantleStructure(target.id);
      return false;
    }

    if (target.group === 'resource') {
      if (actionId === 'gather') return attackResourceWithHands(target.id);
      return false;
    }

    if (target.group === 'enemy') {
      if (actionId === 'attack') return attackEnemyWithHands(target.id);
      return false;
    }

    return false;
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
      if (interactWithStructure(structureId)) return;
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
    if (selected.isFallback) {
      selectWorldTargetAtPointer();
      return;
    }

    if (!selected.isFallback && isConsumableItem(selected.item)) {
      consumeInventorySlot(selected.inventoryIndex);
      return;
    }

    if (!selected.isFallback && isBuildableItem(selected.item)) {
      tryPlaceStructure();
      return;
    }

    if (!selected.isFallback && selected.item?.type === 'material') {
      showMessage(selected.item.name + ' 不能直接使用');
      return;
    }

    if (selected.item?.toolKey === 'fishingRod') {
      handleFishingAction();
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
    primaryAction,
    cancelFishing,
    getFishingTarget,
    updateFishingSystem,
    clearSelectedWorldTarget,
    selectWorldTargetAtPointer,
    getSelectedWorldTarget,
    getSelectedWorldTargetInfo,
    runSelectedWorldTargetAction
  });
})(window.TidalIsle);
