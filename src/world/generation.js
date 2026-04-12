(function (game) {
  const {
    state,
    TILE,
    WORLD_SIZE,
    WORLD_CHUNK_SIZE,
    WORLD_ACTIVE_CHUNK_RADIUS,
    WORLD_KEEP_CHUNK_RADIUS,
    hash2,
    smoothNoise,
    fbm,
    resetECS,
    pickEntityKind,
    createResourceEntity,
    createStructureEntity,
    createEnemyEntity,
    getEntityConfig,
    getComponent,
    destroyEntity,
    getPlayerSnapshot
  } = game;

  let worldWorker = null;

  function refreshChunkStats() {
    state.mapMeta.loadedChunks = state.world?.loadedCount || 0;
    state.mapMeta.queuedChunks = (state.world?.queue.length || 0) + (state.world?.loading ? 1 : 0);
  }

  function createIslandDescriptor(index, options = {}) {
    const center = WORLD_SIZE * 0.5;
    const angle = options.angle ?? hash2(index, 3, 91) * Math.PI * 2;
    const orbit = options.orbit ?? 0;
    const x = center + Math.cos(angle) * orbit;
    const y = center + Math.sin(angle) * orbit;
    const radiusX = options.radiusX;
    const radiusY = options.radiusY;
    const rotation = options.rotation ?? hash2(index, 5, 91) * Math.PI * 2;

    return {
      x,
      y,
      orbit,
      radiusX,
      radiusY,
      weight: options.weight,
      falloff: options.falloff,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation)
    };
  }

  function buildArchipelago() {
    const islands = [];

    const outerCount = 10 + Math.floor(hash2(7, 2, 71) * 4);
    for (let index = 0; index < outerCount; index++) {
      const sector = (Math.PI * 2 * index) / outerCount;
      const jitter = (hash2(index, 8, 71) - 0.5) * 0.22;
      islands.push(
        createIslandDescriptor(index, {
          angle: sector + jitter,
          orbit: WORLD_SIZE * (0.24 + hash2(index, 9, 71) * 0.1),
          radiusX: WORLD_SIZE * (0.05 + hash2(index, 10, 71) * 0.016),
          radiusY: WORLD_SIZE * (0.047 + hash2(index, 11, 71) * 0.016),
          rotation: hash2(index, 12, 71) * Math.PI * 2,
          weight: 1.02 + hash2(index, 13, 71) * 0.1,
          falloff: 1.28 + hash2(index, 14, 71) * 0.14
        })
      );
    }

    const middleCount = 7 + Math.floor(hash2(15, 2, 71) * 3);
    for (let index = 0; index < middleCount; index++) {
      const sector = (Math.PI * 2 * index) / middleCount + (hash2(index, 16, 71) - 0.5) * 0.4;
      islands.push(
        createIslandDescriptor(index + outerCount, {
          angle: sector,
          orbit: WORLD_SIZE * (0.1 + hash2(index, 17, 71) * 0.09),
          radiusX: WORLD_SIZE * (0.043 + hash2(index, 18, 71) * 0.014),
          radiusY: WORLD_SIZE * (0.04 + hash2(index, 19, 71) * 0.014),
          rotation: hash2(index, 20, 71) * Math.PI * 2,
          weight: 0.86 + hash2(index, 21, 71) * 0.08,
          falloff: 1.34 + hash2(index, 22, 71) * 0.16
        })
      );
    }

    const fringeCount = 5 + Math.floor(hash2(23, 2, 71) * 3);
    for (let index = 0; index < fringeCount; index++) {
      islands.push(
        createIslandDescriptor(index + outerCount + middleCount, {
          angle: hash2(index, 24, 71) * Math.PI * 2,
          orbit: WORLD_SIZE * (0.39 + hash2(index, 25, 71) * 0.08),
          radiusX: WORLD_SIZE * (0.036 + hash2(index, 26, 71) * 0.012),
          radiusY: WORLD_SIZE * (0.034 + hash2(index, 27, 71) * 0.012),
          rotation: hash2(index, 28, 71) * Math.PI * 2,
          weight: 0.68 + hash2(index, 29, 71) * 0.08,
          falloff: 1.4 + hash2(index, 30, 71) * 0.18
        })
      );
    }

    return islands;
  }

  function getHeightAt(tileX, tileY, islands) {
    const shoreWarp = (smoothNoise(tileX * 0.12, tileY * 0.12, 23) - 0.5) * 0.12;
    const terrainNoise = (fbm(tileX * 0.074, tileY * 0.074, 7) - 0.5) * 0.2;
    const broadNoise = (smoothNoise(tileX * 0.02, tileY * 0.02, 41) - 0.5) * 0.06;

    let primary = 0;
    let secondary = 0;

    for (const island of islands) {
      const dx = tileX - island.x;
      const dy = tileY - island.y;
      const localX = (dx * island.cos + dy * island.sin) / island.radiusX;
      const localY = (-dx * island.sin + dy * island.cos) / island.radiusY;
      const distance = Math.hypot(localX, localY);
      if (distance > 1.08) continue;

      const core = Math.max(0, 1 - (distance - shoreWarp));
      const influence = Math.pow(core, island.falloff) * island.weight;
      if (influence > primary) {
        secondary = primary;
        primary = influence;
      } else if (influence > secondary) {
        secondary = influence;
      }
    }

    return primary + secondary * 0.1 + terrainNoise + broadNoise - 0.54;
  }

  function pickTileFromHeight(height, detail) {
    if (height < -0.2) return 'deep';
    if (height < -0.052) return 'water';
    if (height < 0.038) return 'sand';
    if (height < 0.42) return detail > 0.1 ? 'meadow' : 'grass';
    return detail > 0.04 ? 'stone' : 'meadow';
  }

  function getGeneratedTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_SIZE || ty >= WORLD_SIZE) return 'deep';
    const islands = state.world?.archipelago;
    if (!islands?.length) return 'deep';
    const detail = fbm(tx * 0.11, ty * 0.11, 16) - 0.5;
    return pickTileFromHeight(getHeightAt(tx, ty, islands), detail);
  }

  function chooseSpawnIsland(islands) {
    return islands.reduce((best, island) => {
      if (!best) return island;
      const bestScore = best.radiusX * best.radiusY - best.orbit * 10;
      const islandScore = island.radiusX * island.radiusY - island.orbit * 10;
      return islandScore > bestScore ? island : best;
    }, null);
  }

  function findSpawnTile(origin) {
    const startX = Math.round(origin?.x ?? WORLD_SIZE * 0.5);
    const startY = Math.round(origin?.y ?? WORLD_SIZE * 0.5);
    let fallback = { x: Math.floor(WORLD_SIZE * 0.5), y: Math.floor(WORLD_SIZE * 0.5) };

    for (let radius = 0; radius < 96; radius++) {
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          const tileX = startX + offsetX;
          const tileY = startY + offsetY;
          const tile = getGeneratedTile(tileX, tileY);
          if (tile === 'grass' || tile === 'meadow') return { x: tileX, y: tileY };
          if (tile === 'sand') fallback = { x: tileX, y: tileY };
        }
      }
    }

    return fallback;
  }

  function shouldSpawnResource(tileX, tileY) {
    const worldScale = WORLD_SIZE / 512;
    const density = Math.max(0.05, 0.18 / Math.sqrt(worldScale) + 0.035);
    return hash2(tileX, tileY, 63) <= density;
  }

  function getChunkWorldSpan() {
    return Math.ceil(WORLD_SIZE / WORLD_CHUNK_SIZE);
  }

  function getChunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  function isChunkInBounds(cx, cy) {
    const span = getChunkWorldSpan();
    return cx >= 0 && cy >= 0 && cx < span && cy < span;
  }

  function getChunkCoordsAtTile(tx, ty) {
    return {
      cx: Math.floor(tx / WORLD_CHUNK_SIZE),
      cy: Math.floor(ty / WORLD_CHUNK_SIZE)
    };
  }

  function getChunkCoordsAtWorld(x, y) {
    return getChunkCoordsAtTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  function getChunkRecordAtWorld(x, y) {
    const { cx, cy } = getChunkCoordsAtWorld(x, y);
    return getOrCreateChunkRecord(cx, cy);
  }

  function generateChunkResources(cx, cy) {
    const resources = [];
    const startTileX = cx * WORLD_CHUNK_SIZE;
    const startTileY = cy * WORLD_CHUNK_SIZE;
    const endTileX = Math.min(WORLD_SIZE, startTileX + WORLD_CHUNK_SIZE);
    const endTileY = Math.min(WORLD_SIZE, startTileY + WORLD_CHUNK_SIZE);
    const spawnTile = state.world?.spawnTile;

    for (let tileY = startTileY; tileY < endTileY; tileY++) {
      for (let tileX = startTileX; tileX < endTileX; tileX++) {
        if (spawnTile && Math.abs(tileX - spawnTile.x) < 4 && Math.abs(tileY - spawnTile.y) < 4) continue;
        if (!shouldSpawnResource(tileX, tileY)) continue;

        const tile = getGeneratedTile(tileX, tileY);
        const kind = pickEntityKind(tile, hash2(tileX, tileY, 28));
        if (!kind) continue;

        const config = getEntityConfig(kind);
        if (!config) continue;

        resources.push({
          kind,
          x: tileX * TILE + TILE * 0.5,
          y: tileY * TILE + TILE * 0.5,
          hp: config.hp,
          alive: true,
          respawnAt: 0
        });
      }
    }

    return resources;
  }

  function createChunkRecord(cx, cy) {
    return {
      key: getChunkKey(cx, cy),
      cx,
      cy,
      status: 'idle',
      requested: false,
      resources: null,
      structures: [],
      enemies: [],
      loadedResourceIds: [],
      loadedStructureIds: [],
      loadedEnemyIds: [],
      lastTouched: state.worldAge
    };
  }

  function getOrCreateChunkRecord(cx, cy) {
    if (!isChunkInBounds(cx, cy)) return null;

    const key = getChunkKey(cx, cy);
    if (state.world.chunks.has(key)) return state.world.chunks.get(key);

    const record = createChunkRecord(cx, cy);
    state.world.chunks.set(key, record);
    return record;
  }

  function allocateRecordSlot(list, value) {
    for (let index = 0; index < list.length; index++) {
      if (list[index] == null) {
        list[index] = value;
        return index;
      }
    }
    list.push(value);
    return list.length - 1;
  }

  function collectStructureState(structure) {
    const result = {};
    for (const [key, value] of Object.entries(structure || {})) {
      if (key === 'kind' || key === 'chunkKey' || key === 'slotIndex') continue;
      result[key] = value;
    }
    return result;
  }

  function snapshotStructureEntity(entityId) {
    const transform = getComponent(entityId, 'transform');
    const structure = getComponent(entityId, 'structure');
    const health = getComponent(entityId, 'health');
    if (!transform || !structure || !health) return null;

    return {
      kind: structure.kind,
      x: transform.x,
      y: transform.y,
      hp: health.hp,
      state: collectStructureState(structure)
    };
  }

  function snapshotEnemyEntity(entityId) {
    const transform = getComponent(entityId, 'transform');
    const enemy = getComponent(entityId, 'enemy');
    const health = getComponent(entityId, 'health');
    if (!transform || !enemy || !health) return null;

    return {
      kind: enemy.kind,
      x: transform.x,
      y: transform.y,
      hp: health.hp,
      speed: enemy.speed,
      cooldown: enemy.cooldown,
      wanderAngle: enemy.wanderAngle,
      wanderTime: enemy.wanderTime
    };
  }

  function registerChunkStructureEntity(entityId) {
    const descriptor = snapshotStructureEntity(entityId);
    const structure = getComponent(entityId, 'structure');
    if (!descriptor || !structure) return null;

    const record = getChunkRecordAtWorld(descriptor.x, descriptor.y);
    if (!record) return null;

    const slotIndex = allocateRecordSlot(record.structures, descriptor);
    record.loadedStructureIds[slotIndex] = entityId;
    structure.chunkKey = record.key;
    structure.slotIndex = slotIndex;
    return record;
  }

  function registerChunkEnemyEntity(entityId) {
    const descriptor = snapshotEnemyEntity(entityId);
    const enemy = getComponent(entityId, 'enemy');
    if (!descriptor || !enemy) return null;

    const record = getChunkRecordAtWorld(descriptor.x, descriptor.y);
    if (!record) return null;

    const slotIndex = allocateRecordSlot(record.enemies, descriptor);
    record.loadedEnemyIds[slotIndex] = entityId;
    enemy.chunkKey = record.key;
    enemy.slotIndex = slotIndex;
    return record;
  }

  function removeChunkStructureEntity(entityId) {
    const structure = getComponent(entityId, 'structure');
    if (!structure?.chunkKey || !Number.isInteger(structure.slotIndex) || structure.slotIndex < 0) return false;

    const record = state.world?.chunks.get(structure.chunkKey);
    if (!record) return false;

    record.structures[structure.slotIndex] = null;
    if (record.loadedStructureIds.length > structure.slotIndex) {
      record.loadedStructureIds[structure.slotIndex] = null;
    }
    return true;
  }

  function removeChunkEnemyEntity(entityId) {
    const enemy = getComponent(entityId, 'enemy');
    if (!enemy?.chunkKey || !Number.isInteger(enemy.slotIndex) || enemy.slotIndex < 0) return false;

    const record = state.world?.chunks.get(enemy.chunkKey);
    if (!record) return false;

    record.enemies[enemy.slotIndex] = null;
    if (record.loadedEnemyIds.length > enemy.slotIndex) {
      record.loadedEnemyIds[enemy.slotIndex] = null;
    }
    return true;
  }

  function syncResourceBack(record, slotIndex, entityId) {
    const resourceNode = getComponent(entityId, 'resourceNode');
    const health = getComponent(entityId, 'health');
    const transform = getComponent(entityId, 'transform');
    if (!resourceNode || slotIndex < 0) return;

    const resource = record.resources[slotIndex];
    if (!resource) return;

    resource.x = transform?.x ?? resource.x;
    resource.y = transform?.y ?? resource.y;
    resource.alive = resourceNode.alive;
    resource.hp = health?.hp ?? resource.hp;
    resource.respawnAt = resourceNode.alive
      ? 0
      : state.worldAge + Math.max(0, resourceNode.respawnTimer || Math.max(0, (resourceNode.respawnAt || 0) - state.worldAge));
  }

  function syncStructureBack(entityId) {
    const descriptor = snapshotStructureEntity(entityId);
    const structure = getComponent(entityId, 'structure');
    if (!descriptor || !structure?.chunkKey || !Number.isInteger(structure.slotIndex) || structure.slotIndex < 0) return;

    const record = state.world?.chunks.get(structure.chunkKey);
    if (!record) return;
    record.structures[structure.slotIndex] = descriptor;
  }

  function syncEnemyBack(entityId) {
    const descriptor = snapshotEnemyEntity(entityId);
    const enemy = getComponent(entityId, 'enemy');
    if (!descriptor || !enemy) return;

    const sourceRecord = enemy.chunkKey ? state.world?.chunks.get(enemy.chunkKey) : null;
    const targetRecord = getChunkRecordAtWorld(descriptor.x, descriptor.y);
    if (!targetRecord) return;

    if (sourceRecord && sourceRecord !== targetRecord && Number.isInteger(enemy.slotIndex) && enemy.slotIndex >= 0) {
      sourceRecord.enemies[enemy.slotIndex] = null;
      if (sourceRecord.loadedEnemyIds.length > enemy.slotIndex) {
        sourceRecord.loadedEnemyIds[enemy.slotIndex] = null;
      }
    }

    if (sourceRecord === targetRecord && Number.isInteger(enemy.slotIndex) && enemy.slotIndex >= 0) {
      targetRecord.enemies[enemy.slotIndex] = descriptor;
      return;
    }

    const slotIndex = allocateRecordSlot(targetRecord.enemies, descriptor);
    targetRecord.loadedEnemyIds[slotIndex] = null;
  }

  function migrateLoadedEnemyEntity(entityId) {
    const enemy = getComponent(entityId, 'enemy');
    const descriptor = snapshotEnemyEntity(entityId);
    if (!enemy || !descriptor) return false;

    const sourceRecord = enemy.chunkKey ? state.world?.chunks.get(enemy.chunkKey) : null;
    const targetRecord = getChunkRecordAtWorld(descriptor.x, descriptor.y);
    if (!sourceRecord || !targetRecord || targetRecord === sourceRecord || targetRecord.status !== 'loaded') return false;

    if (Number.isInteger(enemy.slotIndex) && enemy.slotIndex >= 0) {
      sourceRecord.enemies[enemy.slotIndex] = null;
      if (sourceRecord.loadedEnemyIds.length > enemy.slotIndex) {
        sourceRecord.loadedEnemyIds[enemy.slotIndex] = null;
      }
    }

    const slotIndex = allocateRecordSlot(targetRecord.enemies, descriptor);
    targetRecord.loadedEnemyIds[slotIndex] = entityId;
    enemy.chunkKey = targetRecord.key;
    enemy.slotIndex = slotIndex;
    return true;
  }

  function unloadChunk(record) {
    if (!record || record.status !== 'loaded') return;

    for (let index = 0; index < record.loadedResourceIds.length; index++) {
      const entityId = record.loadedResourceIds[index];
      if (!entityId) continue;
      syncResourceBack(record, index, entityId);
      destroyEntity(entityId);
    }

    for (let index = 0; index < record.loadedStructureIds.length; index++) {
      const entityId = record.loadedStructureIds[index];
      if (!entityId) continue;
      syncStructureBack(entityId);
      destroyEntity(entityId);
    }

    for (let index = 0; index < record.loadedEnemyIds.length; index++) {
      const entityId = record.loadedEnemyIds[index];
      if (!entityId) continue;
      if (migrateLoadedEnemyEntity(entityId)) continue;
      syncEnemyBack(entityId);
      destroyEntity(entityId);
    }

    record.loadedResourceIds = [];
    record.loadedStructureIds = [];
    record.loadedEnemyIds = [];
    record.status = 'idle';
    record.lastTouched = state.worldAge;
    state.world.loadedCount = Math.max(0, state.world.loadedCount - 1);
    refreshChunkStats();
  }

  function ensureChunkGeneratedSync(record) {
    if (!record || Array.isArray(record.resources)) return record;
    record.resources = generateChunkResources(record.cx, record.cy);
    return record;
  }

  function hydrateChunk(record) {
    if (!record || record.status === 'loaded' || !Array.isArray(record.resources)) return false;

    record.loadedResourceIds = Array(record.resources.length).fill(null);
    for (let slotIndex = 0; slotIndex < record.resources.length; slotIndex++) {
      const resource = record.resources[slotIndex];
      if (!resource) continue;

      const active = resource.alive && (resource.respawnAt || 0) <= state.worldAge;
      const config = getEntityConfig(resource.kind);
      const hp = active ? resource.hp || config?.hp || 1 : 0;
      const respawnTimer = active ? 0 : Math.max(0, (resource.respawnAt || 0) - state.worldAge);
      record.loadedResourceIds[slotIndex] = createResourceEntity(resource.kind, resource.x, resource.y, {
        alive: active,
        hp,
        respawnTimer,
        chunkKey: record.key,
        slotIndex,
        respawnAt: resource.respawnAt || 0
      });
    }

    record.loadedStructureIds = Array(record.structures.length).fill(null);
    for (let slotIndex = 0; slotIndex < record.structures.length; slotIndex++) {
      const structure = record.structures[slotIndex];
      if (!structure) continue;
      record.loadedStructureIds[slotIndex] = createStructureEntity(structure.kind, structure.x, structure.y, {
        hp: structure.hp,
        state: structure.state,
        chunkKey: record.key,
        slotIndex
      });
    }

    record.loadedEnemyIds = Array(record.enemies.length).fill(null);
    for (let slotIndex = 0; slotIndex < record.enemies.length; slotIndex++) {
      const enemy = record.enemies[slotIndex];
      if (!enemy) continue;
      record.loadedEnemyIds[slotIndex] = createEnemyEntity(enemy.kind, enemy.x, enemy.y, {
        hp: enemy.hp,
        speed: enemy.speed,
        cooldown: enemy.cooldown,
        wanderAngle: enemy.wanderAngle,
        wanderTime: enemy.wanderTime,
        chunkKey: record.key,
        slotIndex
      });
    }

    state.world.loadedCount += 1;
    record.status = 'loaded';
    record.lastTouched = state.worldAge;
    refreshChunkStats();
    return true;
  }

  function removeQueuedJob(key) {
    state.world.queue = state.world.queue.filter((job) => job.key !== key);
    state.world.queuedKeys.delete(key);
    const record = state.world.chunks.get(key);
    if (record) record.requested = false;
  }

  function shouldKeepChunkLoaded(record, radius = WORLD_KEEP_CHUNK_RADIUS) {
    const player = getPlayerSnapshot();
    if (!player?.transform || !record) return false;
    const playerChunk = getChunkCoordsAtWorld(player.transform.x, player.transform.y);
    return Math.max(Math.abs(record.cx - playerChunk.cx), Math.abs(record.cy - playerChunk.cy)) <= radius;
  }

  function handleChunkGenerated(payload) {
    if (!state.world?.ready || payload.revision !== state.world.revision) return;

    const record = state.world.chunks.get(payload.key);
    if (!record) return;

    if (!Array.isArray(record.resources)) {
      record.resources = payload.resources || [];
    }

    record.requested = false;
    state.world.loading = false;

    if (shouldKeepChunkLoaded(record)) {
      hydrateChunk(record);
    }

    refreshChunkStats();
    scheduleChunkLoad();
  }

  function teardownWorldWorker() {
    if (worldWorker) {
      worldWorker.terminate();
      worldWorker = null;
    }
  }

  function ensureWorldWorker() {
    if (worldWorker || typeof Worker !== 'function') return worldWorker;

    try {
      worldWorker = new Worker(new URL('../workers/world-chunk.worker.js', import.meta.url), { type: 'module' });
      worldWorker.addEventListener('message', (event) => handleChunkGenerated(event.data || {}));
      worldWorker.addEventListener('error', () => {
        if (state.world?.loading?.key) {
          state.world.queue.unshift(state.world.loading);
        }
        if (state.world) state.world.loading = false;
        teardownWorldWorker();
        refreshChunkStats();
        scheduleChunkLoad();
      });
    } catch {
      worldWorker = null;
    }

    return worldWorker;
  }

  function requestChunkFromWorker(job) {
    const worker = ensureWorldWorker();
    if (!worker) {
      window.setTimeout(() => {
        if (!state.world?.ready || state.world.revision !== job.revision) return;
        handleChunkGenerated({
          type: 'chunkGenerated',
          key: job.key,
          cx: job.cx,
          cy: job.cy,
          revision: job.revision,
          resources: generateChunkResources(job.cx, job.cy)
        });
      }, 0);
      return;
    }

    worker.postMessage({
      type: 'generateChunk',
      key: job.key,
      cx: job.cx,
      cy: job.cy,
      revision: job.revision,
      seed: state.seed,
      worldSize: WORLD_SIZE,
      tileSize: TILE,
      chunkSize: WORLD_CHUNK_SIZE,
      spawnTile: state.world.spawnTile,
      archipelago: state.world.archipelago
    });
  }

  function syncLoadChunk(cx, cy) {
    const record = getOrCreateChunkRecord(cx, cy);
    if (!record) return null;

    if (record.requested) removeQueuedJob(record.key);
    record.requested = false;
    state.world?.queuedKeys?.delete?.(record.key);
    ensureChunkGeneratedSync(record);
    hydrateChunk(record);
    return record;
  }

  function queueChunkLoad(cx, cy, priority = 0) {
    const record = getOrCreateChunkRecord(cx, cy);
    if (!record) return null;

    record.lastTouched = state.worldAge;

    if (record.status === 'loaded') return record;
    if (Array.isArray(record.resources)) {
      hydrateChunk(record);
      return record;
    }

    if (record.requested) return record;

    record.requested = true;
    state.world.queue.push({ key: record.key, cx, cy, priority, revision: state.world.revision });
    state.world.queue.sort((first, second) => first.priority - second.priority);
    state.world.queuedKeys.add(record.key);
    refreshChunkStats();
    scheduleChunkLoad();
    return record;
  }

  function scheduleChunkLoad() {
    if (!state.world?.ready || state.world.loading || !state.world.queue.length) return;

    const job = state.world.queue.shift();
    if (!job) return;

    const record = state.world.chunks.get(job.key);
    if (!record || !record.requested) {
      state.world.queuedKeys.delete(job.key);
      refreshChunkStats();
      scheduleChunkLoad();
      return;
    }

    state.world.queuedKeys.delete(job.key);
    state.world.loading = job;
    refreshChunkStats();
    requestChunkFromWorker(job);
  }

  function primeChunksAroundWorld(x, y, radius = WORLD_ACTIVE_CHUNK_RADIUS) {
    const { cx, cy } = getChunkCoordsAtWorld(x, y);
    for (let offsetY = -radius; offsetY <= radius; offsetY++) {
      for (let offsetX = -radius; offsetX <= radius; offsetX++) {
        syncLoadChunk(cx + offsetX, cy + offsetY);
      }
    }
  }

  function cleanupChunkQueue(centerCx, centerCy) {
    const keepRadius = WORLD_KEEP_CHUNK_RADIUS + 1;
    state.world.queue = state.world.queue.filter((job) => {
      const record = state.world.chunks.get(job.key);
      if (!record?.requested) return false;
      const distance = Math.max(Math.abs(record.cx - centerCx), Math.abs(record.cy - centerCy));
      if (distance <= keepRadius) return true;
      record.requested = false;
      state.world.queuedKeys.delete(job.key);
      return false;
    });
  }

  function updateChunkStreamingSystem() {
    if (!state.world?.ready) return;

    const player = getPlayerSnapshot();
    if (!player?.transform) return;

    const { cx, cy } = getChunkCoordsAtWorld(player.transform.x, player.transform.y);
    for (let offsetY = -WORLD_ACTIVE_CHUNK_RADIUS; offsetY <= WORLD_ACTIVE_CHUNK_RADIUS; offsetY++) {
      for (let offsetX = -WORLD_ACTIVE_CHUNK_RADIUS; offsetX <= WORLD_ACTIVE_CHUNK_RADIUS; offsetX++) {
        const chunkX = cx + offsetX;
        const chunkY = cy + offsetY;
        const priority = Math.abs(offsetX) + Math.abs(offsetY);
        if (priority <= 1) syncLoadChunk(chunkX, chunkY);
        else queueChunkLoad(chunkX, chunkY, priority);
      }
    }

    cleanupChunkQueue(cx, cy);

    for (const record of state.world.chunks.values()) {
      if (record.status !== 'loaded') continue;
      const distance = Math.max(Math.abs(record.cx - cx), Math.abs(record.cy - cy));
      if (distance > WORLD_KEEP_CHUNK_RADIUS) unloadChunk(record);
    }

    refreshChunkStats();
    scheduleChunkLoad();
  }

  function createWorld() {
    resetECS();
    teardownWorldWorker();
    state.worldAge = 0;

    const previousRevision = state.world?.revision || 0;
    const archipelago = buildArchipelago();
    const spawnIsland = chooseSpawnIsland(archipelago);

    state.world = {
      ready: true,
      revision: previousRevision + 1,
      chunkSize: WORLD_CHUNK_SIZE,
      archipelago,
      chunks: new Map(),
      queue: [],
      queuedKeys: new Set(),
      loading: false,
      loadedCount: 0,
      spawnTile: null
    };

    const spawnTile = findSpawnTile(spawnIsland);
    state.world.spawnTile = spawnTile;

    const spawn = {
      x: spawnTile.x * TILE + TILE * 0.5,
      y: spawnTile.y * TILE + TILE * 0.5
    };

    primeChunksAroundWorld(spawn.x, spawn.y, WORLD_ACTIVE_CHUNK_RADIUS);
    ensureWorldWorker();

    state.mapMeta = {
      islandCount: archipelago.length,
      islands: archipelago.map((island) => ({ x: island.x, y: island.y, radiusX: island.radiusX, radiusY: island.radiusY })),
      loadedChunks: state.world.loadedCount,
      queuedChunks: 0,
      minimapDirty: true
    };

    return spawn;
  }

  Object.assign(game, {
    getGeneratedTile,
    getChunkKey,
    getChunkCoordsAtTile,
    getChunkCoordsAtWorld,
    getChunkRecordAtWorld,
    createWorld,
    updateChunkStreamingSystem,
    primeChunksAroundWorld,
    registerChunkStructureEntity,
    registerChunkEnemyEntity,
    removeChunkStructureEntity,
    removeChunkEnemyEntity
  });
})(window.TidalIsle);
