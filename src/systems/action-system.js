(function (game) {
  const {
    TILE,
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
    burst,
    getSelectedItem,
    getItemConfig,
    isBuildableItem,
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
    isNight
  } = game;

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
    updateFishingSystem
  });
})(window.TidalIsle);
