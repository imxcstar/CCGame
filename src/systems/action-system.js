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
    invokeItemPrimaryAction,
    isConsumableItem,
    consumeInventorySlot,
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

  const CAMPFIRE_COOKABLE_FISH_KEYS = ['eel', 'mackerel', 'sardine'];

  function getCookableFishKey(inventory) {
    if (!inventory) return null;
    return CAMPFIRE_COOKABLE_FISH_KEYS.find((key) => countInventoryItem(inventory, key) > 0) || null;
  }

  function getPlanterActionState(inventory, structure, near) {
    if (!structure?.crop) {
      const hasSeeds = countInventoryItem(inventory, 'seedPack') > 0;
      return {
        label: hasSeeds ? '播种' : '缺少种子包',
        disabled: !near || !hasSeeds
      };
    }

    if (!structure.ready) {
      return {
        label: '生长中',
        disabled: true
      };
    }

    return {
      label: '收获南瓜',
      disabled: !near || !canStoreAllItems(inventory, { pumpkin: 2 })
    };
  }

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
    game.playSound?.('cast');
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

    // 联机 client：把"收线成功"上报 host，host 校验后通过 INVENTORY 下发战利品
    // （走和单机相同的播报路径）。本地仍清掉 fishing 状态，体感和单机一致。
    if (state.netMode === 'client' && typeof game.netClientRequestFishReel === 'function') {
      const tile = state.fishing.tile;
      const fx = state.fishing.x;
      const fy = state.fishing.y;
      burst(fx, fy, '#b7f1ff', 6, 22);
      state.shake = Math.max(state.shake, 1.2);
      resetFishingState();
      game.netClientRequestFishReel(tile, fx, fy);
      // host 返回 INVENTORY 时会弹"+N 鱼名"的消息；这里只给一个抽线声/视觉。
      game.playSound?.('catch');
      return true;
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
    game.playSound?.('catch');
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
      game.playSound?.('bite');
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

  function canPayInventoryCost(inventory, cost) {
    if (!inventory) return false;
    return Object.entries(cost).every(([key, amount]) => countInventoryItem(inventory, key) >= amount);
  }

  function spendInventoryCost(inventory, cost) {
    if (!inventory || !canPayInventoryCost(inventory, cost)) return false;
    Object.entries(cost).forEach(([key, amount]) => {
      removeItemFromInventory(inventory, key, amount);
    });
    return true;
  }

  function getStructureRepairCost(structure, health) {
    const config = getStructureConfig(structure?.kind);
    if (!config?.cost || !health || health.hp >= health.maxHp) return null;

    const missingRatio = Math.max(0.1, (health.maxHp - health.hp) / Math.max(1, health.maxHp));
    const cost = {};
    for (const [key, amount] of Object.entries(config.cost)) {
      cost[key] = Math.max(1, Math.ceil(amount * missingRatio * 0.5));
    }
    return cost;
  }

  // ---------- 联机 client 模式 helper ----------
  // 在 client 模式下，对世界状态的修改不能在本地直接进行（host 是权威）。
  // 我们把请求转发给 host 并提供与单机相同的"扣除消耗品 + 本地反馈"。
  // host 端会通过 ENTITY_DELTA 同步真实状态、并在动作失败时通过 INVENTORY
  // 退回已扣的物品（参考 net/host.js 中的 handleActionReq）。
  function isClientMode() {
    return state.netMode === 'client';
  }

  function dispatchStructureActionReq(action, structureId, options) {
    if (typeof game.netClientRequestStructureAction !== 'function') return false;
    return game.netClientRequestStructureAction(action, structureId, options || {}) === true;
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
      // 联机 client：把"添柴"请求发给 host；本地不直接改 fuel，让 ENTITY_DELTA 回流
      if (isClientMode()) {
        burst(transform.x, transform.y, '#ffca74', 6, 28);
        game.playSound?.('fire');
        showMessage('已请求添柴');
        dispatchStructureActionReq('interact', structureId, { kind: 'campfire' });
        return true;
      }
      structure.fuel = Math.min(120, (structure.fuel || 0) + 28);
      burst(transform.x, transform.y, '#ffca74', 6, 28);
      game.playSound?.('fire');
      showMessage('篝火添柴 +1');
      setScore();
      return true;
    }

    if (structure.kind === 'collector') {
      if ((structure.water || 0) <= 0) {
        showMessage('雨水收集器还没有水');
        return false;
      }

      if (isClientMode()) {
        // 联机：客户端先在本地把 ghost 的 water 扣 1，立刻给到 thirst/energy 反馈，
        // 然后让 host 校验并广播权威值（如校验失败会通过下一帧 ENTITY_DELTA 回滚 water）。
        structure.water -= 1;
        player.survival.thirst = Math.min(100, player.survival.thirst + 34);
        player.survival.energy = Math.min(100, player.survival.energy + 6);
        burst(transform.x, transform.y, '#81e7ff', 7, 30);
        game.playSound?.('drink');
        showMessage('取水成功');
        dispatchStructureActionReq('interact', structureId, { kind: 'collector' });
        return true;
      }
      structure.water -= 1;
      player.survival.thirst = Math.min(100, player.survival.thirst + 34);
      player.survival.energy = Math.min(100, player.survival.energy + 6);
      burst(transform.x, transform.y, '#81e7ff', 7, 30);
      game.playSound?.('drink');
      showMessage('取水成功');
      return true;
    }

    if (structure.kind === 'planter') {
      if (!structure.crop) {
        if (countInventoryItem(player.inventory, 'seedPack') <= 0) {
          showMessage('缺少混合种子包');
          return false;
        }

        removeItemFromInventory(player.inventory, 'seedPack', 1);
        if (isClientMode()) {
          burst(transform.x, transform.y, '#9fd77c', 6, 24);
          game.playSound?.('build');
          showMessage('已请求播种');
          dispatchStructureActionReq('interact', structureId, { kind: 'plant' });
          return true;
        }
        structure.crop = 'pumpkin';
        structure.growth = 0;
        structure.ready = false;
        burst(transform.x, transform.y, '#9fd77c', 6, 24);
        game.playSound?.('build');
        showMessage('种下了一包混合种子');
        setScore();
        return true;
      }

      if (!structure.ready) {
        showMessage('作物还在生长');
        return false;
      }

      const harvestLoot = { pumpkin: 2 };
      if (!canStoreAllItems(player.inventory, harvestLoot)) {
        showMessage('背包空间不足');
        return false;
      }

      if (isClientMode()) {
        burst(transform.x, transform.y, '#ffb562', 8, 28);
        game.playSound?.('harvest');
        showMessage('已请求收获');
        dispatchStructureActionReq('harvestPlanter', structureId);
        return true;
      }
      addInventory(harvestLoot);
      structure.crop = null;
      structure.growth = 0;
      structure.ready = false;
      burst(transform.x, transform.y, '#ffb562', 8, 28);
      game.playSound?.('harvest');
      showMessage('收获了 2 个南瓜');
      setScore();
      return true;
    }

    showMessage('这个结构没有可执行操作');
    return false;
  }

  function cookAtCampfire(structureId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(structureId, 'transform');
    const structure = getComponent(structureId, 'structure');
    if (!player?.inventory || !transform || !structure || structure.kind !== 'campfire') return false;
    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) >= 62) {
      showMessage('离目标太远');
      return false;
    }

    if ((structure.fuel || 0) < 10) {
      showMessage('篝火火力不足');
      return false;
    }

    const fishKey = getCookableFishKey(player.inventory);
    if (!fishKey) {
      showMessage('需要沙丁鱼、鲭鱼或鳗鱼才能烹饪');
      return false;
    }

    removeItemFromInventory(player.inventory, fishKey, 1);
    if (isClientMode()) {
      burst(transform.x, transform.y, '#ffc887', 7, 28);
      game.playSound?.('fire');
      showMessage('已请求烹饪：烤鱼');
      dispatchStructureActionReq('cook', structureId, { tool: fishKey });
      return true;
    }
    structure.fuel = Math.max(0, (structure.fuel || 0) - 10);
    addInventory({ grilledFish: 1 });
    burst(transform.x, transform.y, '#ffc887', 7, 28);
    game.playSound?.('fire');
    showMessage('烹饪完成：烤鱼');
    setScore();
    return true;
  }

  function refuelCampfire(structureId, fillAll = false) {
    const player = getPlayerSnapshot();
    const transform = getComponent(structureId, 'transform');
    const structure = getComponent(structureId, 'structure');
    if (!player?.inventory || !transform || !structure || structure.kind !== 'campfire') return false;
    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) >= 62) {
      showMessage('离目标太远');
      return false;
    }

    const missingFuel = Math.max(0, 120 - (structure.fuel || 0));
    if (missingFuel <= 0) {
      showMessage('篝火燃料已满');
      return false;
    }

    const availableWood = countInventoryItem(player.inventory, 'wood');
    if (availableWood <= 0) {
      showMessage('缺少木材');
      return false;
    }

    const woodToUse = fillAll ? Math.min(availableWood, Math.ceil(missingFuel / 28)) : 1;
    removeItemFromInventory(player.inventory, 'wood', woodToUse);
    if (isClientMode()) {
      burst(transform.x, transform.y, '#ffca74', 6 + woodToUse, 28 + woodToUse * 3);
      game.playSound?.('fire');
      showMessage(fillAll ? '已请求添满柴火' : '已请求添柴 +' + woodToUse);
      // 注意：host 端 refuel 仅按"all=Math.ceil(missingFuel/28) 或 1"扣除，
      // 因此服务端可能与本地实际使用的木柴数量略有差异（极端情况下）。MVP 不处理这层差异。
      dispatchStructureActionReq('refuel', structureId, { kind: fillAll ? 'all' : '' });
      return true;
    }
    structure.fuel = Math.min(120, (structure.fuel || 0) + woodToUse * 28);
    burst(transform.x, transform.y, '#ffca74', 6 + woodToUse, 28 + woodToUse * 3);
    game.playSound?.('fire');
    showMessage(fillAll ? '篝火已添满柴火' : '篝火添柴 +' + woodToUse);
    setScore();
    return true;
  }

  function drinkFromCollector(structureId, all = false) {
    const player = getPlayerSnapshot();
    const transform = getComponent(structureId, 'transform');
    const structure = getComponent(structureId, 'structure');
    if (!player?.survival || !transform || !structure || structure.kind !== 'collector') return false;
    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) >= 62) {
      showMessage('离目标太远');
      return false;
    }

    if ((structure.water || 0) <= 0) {
      showMessage('雨水收集器还没有水');
      return false;
    }

    const amount = all ? Math.max(1, Math.min(structure.water || 0, Math.ceil((100 - player.survival.thirst) / 26))) : 1;
    if (isClientMode()) {
      // 与 interact-collector 同理：本地立刻给反馈，host 校验并广播权威值
      structure.water -= amount;
      player.survival.thirst = Math.min(100, player.survival.thirst + amount * 34);
      player.survival.energy = Math.min(100, player.survival.energy + amount * 6);
      burst(transform.x, transform.y, '#81e7ff', 6 + amount, 30 + amount * 2);
      game.playSound?.('drink');
      showMessage(all ? '畅饮了 ' + amount + ' 份淡水' : '取水成功');
      dispatchStructureActionReq('drink', structureId, { kind: all ? 'all' : '' });
      return true;
    }
    structure.water -= amount;
    player.survival.thirst = Math.min(100, player.survival.thirst + amount * 34);
    player.survival.energy = Math.min(100, player.survival.energy + amount * 6);
    burst(transform.x, transform.y, '#81e7ff', 6 + amount, 30 + amount * 2);
    game.playSound?.('drink');
    showMessage(all ? '畅饮了 ' + amount + ' 份淡水' : '取水成功');
    return true;
  }

  function repairStructure(structureId) {
    const player = getPlayerSnapshot();
    const transform = getComponent(structureId, 'transform');
    const structure = getComponent(structureId, 'structure');
    const health = getComponent(structureId, 'health');
    if (!player?.inventory || !transform || !structure || !health) return false;
    if (dist(player.transform.x, player.transform.y, transform.x, transform.y) > 82) {
      showMessage('离目标太远');
      return false;
    }

    const repairCost = getStructureRepairCost(structure, health);
    if (!repairCost) {
      showMessage('该结构无需修理');
      return false;
    }

    if (!canPayInventoryCost(player.inventory, repairCost)) {
      showMessage('修理材料不足');
      return false;
    }

    spendInventoryCost(player.inventory, repairCost);
    if (isClientMode()) {
      burst(transform.x, transform.y, '#93f59a', 8, 34);
      game.playSound?.('build');
      showMessage('已请求修理');
      // 把 cost JSON 通过 tool 字段透传，方便 host 在校验失败时退款
      let costJson = '';
      try { costJson = JSON.stringify(repairCost); } catch { /* ignore */ }
      dispatchStructureActionReq('repair', structureId, { tool: costJson });
      return true;
    }
    health.hp = health.maxHp;
    burst(transform.x, transform.y, '#93f59a', 8, 34);
    game.playSound?.('build');
    showMessage('修理完成');
    setScore();
    return true;
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

    if (isClientMode()) {
      // 联机：让 host 拆除结构并通过 INVENTORY 把物品发回来。本地不直接销毁，
      // 而是等 ENTITY_DELTA 把结构标记为消失。
      burst(transform.x, transform.y, '#83f5ce', 10, 42);
      game.playSound?.('drop');
      showMessage('已请求拆卸 ' + (getStructureConfig(structure.kind)?.name || getItemConfig(structure.kind).name));
      dispatchStructureActionReq('dismantle', structureId);
      clearSelectedWorldTarget();
      return true;
    }

    removeChunkStructureEntity?.(structureId);
    destroyEntity(structureId);
    addInventory({ [structure.kind]: 1 });
    burst(transform.x, transform.y, '#83f5ce', 10, 42);
    game.playSound?.('drop');
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
    // 不再触发画面抖动：攻击/砍树用手部小幅抖动表现，避免与被攻击的画面抖动重叠。

    // 联机 client：转发给 host，由 host 进行权威伤害结算与战利品分发。
    if (isClientMode() && typeof game.netClientRequestAttack === 'function') {
      game.netClientRequestAttack();
      return true;
    }

    health.hp -= getResourceDamage('hands', resourceId);
    health.hitTimer = 0.18;
    game.playSound?.('chop');
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
    // 不再触发画面抖动：攻击/砍树用手部小幅抖动表现，避免与被攻击的画面抖动重叠。

    // 联机 client：转发给 host，由 host 进行权威伤害结算。
    if (isClientMode() && typeof game.netClientRequestAttack === 'function') {
      game.netClientRequestAttack();
      return true;
    }

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
      const dismantleEnabled = distance <= 82 && canStoreAllItems(player.inventory, { [target.structure.kind]: 1 });
      const repairCost = getStructureRepairCost(target.structure, target.health);
      const canRepair = !!repairCost && distance <= 82 && canPayInventoryCost(player.inventory, repairCost);

      if (target.structure.kind === 'campfire') {
        const hasWood = countInventoryItem(player.inventory, 'wood') > 0;
        const cookableFish = getCookableFishKey(player.inventory);
        const missingFuel = Math.max(0, 120 - (target.structure.fuel || 0));
        actions.push({ id: 'interact', label: hasWood ? '添柴' : '缺少木材', disabled: !near || !hasWood || missingFuel <= 0 });
        actions.push({ id: 'refuel-max', label: hasWood ? '添满' : '添满', disabled: !near || !hasWood || missingFuel <= 0 });
        actions.push({
          id: 'cook-fish',
          label: cookableFish ? '烤鱼' : '缺少可烤鱼类',
          disabled: !near || !cookableFish || (target.structure.fuel || 0) < 10
        });
      }

      if (target.structure.kind === 'collector') {
        const hasWater = (target.structure.water || 0) > 0;
        actions.push({ id: 'interact', label: hasWater ? '取水' : '暂无储水', disabled: !near || !hasWater });
        actions.push({ id: 'drink-all', label: '畅饮', disabled: !near || !hasWater });
      }

      if (target.structure.kind === 'planter') {
        const planterAction = getPlanterActionState(player.inventory, target.structure, near);
        actions.push({
          id: 'interact',
          label: planterAction.label,
          disabled: planterAction.disabled
        });
      }

      actions.push({
        id: 'repair',
        label: repairCost ? '修理 ' + Object.entries(repairCost).map(([key, value]) => getItemConfig(key).name + ' ' + value).join(' · ') : '无需修理',
        disabled: !canRepair
      });
      actions.push({
        id: 'dismantle',
        label: dismantleEnabled ? '拆卸' : '背包已满',
        disabled: !dismantleEnabled
      });

      const metaParts = [
        '距离 ' + Math.round(distance),
        '耐久 ' + Math.ceil(target.health.hp) + '/' + Math.ceil(target.health.maxHp)
      ];
      if (target.structure.kind === 'campfire') metaParts.push('燃料 ' + Math.ceil(target.structure.fuel || 0) + '/120');
      if (target.structure.kind === 'collector') metaParts.push('储水 ' + Math.ceil(target.structure.water || 0));
      if (target.structure.kind === 'planter') {
        if (!target.structure.crop) metaParts.push('状态 空闲');
        else if (target.structure.ready) metaParts.push('状态 已成熟');
        else metaParts.push('生长 ' + Math.max(0, Math.round((target.structure.growth || 0) * 100)) + '%');
      }

      return {
        name: config?.name || item.name,
        typeLabel: '建筑',
        meta: metaParts.join(' · '),
        description: item.description || '可以交互、修理或拆卸的营地结构。',
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
      if (actionId === 'refuel-max') return refuelCampfire(target.id, true);
      if (actionId === 'cook-fish') return cookAtCampfire(target.id);
      if (actionId === 'drink-all') return drinkFromCollector(target.id, true);
      if (actionId === 'repair') return repairStructure(target.id);
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
        return (structure.kind === 'campfire' || structure.kind === 'collector' || structure.kind === 'planter') &&
          dist(player.transform.x, player.transform.y, transform.x, transform.y) < 62;
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

    if (structure.kind === 'planter') {
      if (!structure.crop) {
        return countInventoryItem(player.inventory, 'seedPack') > 0 ? 'E 播种：种下混合种子包' : '';
      }

      return structure.ready ? 'E 收获：成熟的南瓜可以采摘了' : '南瓜正在生长';
    }

    return '';
  }

  function performEquippedAttack(toolKey = getActiveToolKey()) {
    const player = getPlayerSnapshot();
    if (!player?.transform || !player.player) return false;
    if (player.player.attackCooldown > 0) return false;

    player.player.attackCooldown = 0.26;

    // 联机 client 模式：不直接改世界，把"近战命中"作为 ACTION_REQ 发给 host。
    // host 端会执行真正的伤害结算与战利品分发，结果通过 ENTITY_DELTA /
    // INVENTORY 回流到本地。这里仍然保留本地的攻击 cooldown 与起手 burst，
    // 保证手感与单机一致。
    if (state.netMode === 'client' && typeof game.netClientRequestAttack === 'function') {
      burst(player.transform.x, player.transform.y, 'rgba(230,245,255,0.8)', 3, 30);
      game.netClientRequestAttack();
      return true;
    }

    const target = getAttackTarget();
    burst(player.transform.x, player.transform.y, 'rgba(230,245,255,0.8)', 3, 30);

    if (!target) return true;

    const damage = target.group === 'enemy' ? getEnemyDamage(toolKey, target.id) : getResourceDamage(toolKey, target.id);
    // 不再触发画面抖动：攻击/砍树用手部小幅抖动表现，避免与被攻击的画面抖动重叠。

    if (target.group === 'resource') {
      const health = getComponent(target.id, 'health');
      const resourceNode = getComponent(target.id, 'resourceNode');
      if (!health || !resourceNode?.alive) return false;
      health.hp -= damage;
      health.hitTimer = 0.18;
      game.playSound?.('chop');
      if (health.hp <= 0) harvestResource(target.id);
      return true;
    }

    hitEnemy(target.id, damage);
    return true;
  }

  function primaryAction() {
    if (!state.running || state.over) return;

    const selected = getSelectedItem();
    if (!selected.isFallback && isConsumableItem(selected.item)) {
      consumeInventorySlot(selected.inventoryIndex);
      return;
    }

    if (!selected.isFallback && selected.item?.type === 'material') {
      showMessage(selected.item.name + ' 不能直接使用');
      return;
    }

    if (invokeItemPrimaryAction(selected, { selected, player: getPlayerSnapshot() })) {
      return;
    }

    performEquippedAttack(getActiveToolKey());
  }

  Object.assign(game, {
    interact,
    getStructureHintText,
    primaryAction,
    performEquippedAttack,
    cancelFishing,
    getFishingTarget,
    handleFishingAction,
    updateFishingSystem,
    clearSelectedWorldTarget,
    selectWorldTargetAtPointer,
    getSelectedWorldTarget,
    getSelectedWorldTargetInfo,
    runSelectedWorldTargetAction
  });
})(window.TidalIsle);
