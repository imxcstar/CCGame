(function (game) {
  const {
    state,
    createEntity,
    addComponent,
    randomBetween,
    getEntityConfig,
    getStructureConfig,
    getEnemyConfig,
    createInventory,
    addItemsToInventory
  } = game;

  function createPlayerEntity(x, y) {
    const entityId = createEntity('player');
    addComponent(entityId, 'transform', { x, y });
    addComponent(entityId, 'collider', { radius: 12 });
    addComponent(entityId, 'health', { hp: 100, maxHp: 100, hitTimer: 0 });
    addComponent(entityId, 'player', {
      speed: 116,
      sprint: 180,
      attackCooldown: 0,
      hurtTimer: 0,
      facing: 'down',
      isMoving: false,
      animationTime: 0
    });
    addComponent(entityId, 'survival', { hunger: 100, thirst: 100, energy: 100 });

    const inventory = createInventory(16);
    addItemsToInventory(inventory, {
      wood: 8,
      stone: 5,
      fiber: 5,
      berry: 3,
      coconut: 2,
      meat: 1
    });
    addComponent(entityId, 'inventory', inventory);
    return entityId;
  }

  function createResourceEntity(kind, x, y, options = {}) {
    const config = getEntityConfig(kind);
    if (!config) return null;

    const alive = options.alive !== false;
    const hp = options.hp ?? (alive ? config.hp : 0);
    const entityId = createEntity(kind);
    addComponent(entityId, 'transform', { x, y });
    addComponent(entityId, 'collider', { radius: config.radius });
    addComponent(entityId, 'health', { hp, maxHp: config.hp, hitTimer: 0 });
    addComponent(entityId, 'resourceNode', {
      kind,
      alive,
      respawnTimer: options.respawnTimer || 0,
      chunkKey: options.chunkKey || null,
      slotIndex: Number.isInteger(options.slotIndex) ? options.slotIndex : -1,
      respawnAt: options.respawnAt || 0
    });
    return entityId;
  }

  function createStructureEntity(kind, x, y, options = {}) {
    const config = getStructureConfig(kind);
    if (!config) return null;

    const entityId = createEntity(kind);
    addComponent(entityId, 'transform', { x, y });
    addComponent(entityId, 'collider', { radius: config.radius || 0 });
    addComponent(entityId, 'health', {
      hp: options.hp ?? config.hp,
      maxHp: config.hp,
      hitTimer: 0
    });
    addComponent(entityId, 'structure', {
      kind,
      ...(config.initialState?.() || {}),
      ...(options.state || {}),
      chunkKey: options.chunkKey || null,
      slotIndex: Number.isInteger(options.slotIndex) ? options.slotIndex : -1
    });
    if (!Number.isInteger(options.slotIndex) && typeof game.registerChunkStructureEntity === 'function') {
      game.registerChunkStructureEntity(entityId);
    }
    return entityId;
  }

  function createEnemyEntity(kind, x, y, options = {}) {
    const config = getEnemyConfig(kind);
    if (!config) return null;

    const hp = options.hp ?? (config.baseHp + state.day * config.hpPerDay);
    const speed = options.speed ?? (config.speedBase + Math.min(24, state.day * config.speedPerDay));
    const entityId = createEntity(kind);
    addComponent(entityId, 'transform', { x, y });
    addComponent(entityId, 'collider', { radius: config.radius });
    addComponent(entityId, 'health', { hp, maxHp: hp, hitTimer: 0 });
    addComponent(entityId, 'enemy', {
      kind,
      speed,
      cooldown: options.cooldown ?? 0,
      wanderAngle: options.wanderAngle ?? Math.random() * Math.PI * 2,
      wanderTime: options.wanderTime ?? randomBetween(1.2, 3.6),
      chunkKey: options.chunkKey || null,
      slotIndex: Number.isInteger(options.slotIndex) ? options.slotIndex : -1
    });
    if (!Number.isInteger(options.slotIndex) && typeof game.registerChunkEnemyEntity === 'function') {
      game.registerChunkEnemyEntity(entityId);
    }
    return entityId;
  }

  function spawnParticleEntity(x, y, color, life, velocityX, velocityY, size) {
    const entityId = createEntity('particle');
    addComponent(entityId, 'transform', { x, y });
    addComponent(entityId, 'particle', {
      color,
      life,
      maxLife: life,
      vx: velocityX,
      vy: velocityY,
      size
    });
    return entityId;
  }

  Object.assign(game, {
    createPlayerEntity,
    createResourceEntity,
    createStructureEntity,
    createEnemyEntity,
    spawnParticleEntity
  });
})(window.TidalIsle);
