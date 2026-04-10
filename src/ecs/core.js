(function (game) {
  const ecs = {
    nextId: 1,
    entities: new Set(),
    components: new Map()
  };

  function resetECS() {
    ecs.nextId = 1;
    ecs.entities.clear();
    ecs.components.clear();
  }

  function ensureStore(name) {
    if (!ecs.components.has(name)) {
      ecs.components.set(name, new Map());
    }
    return ecs.components.get(name);
  }

  function createEntity(label = '') {
    const entityId = ecs.nextId++;
    ecs.entities.add(entityId);
    if (label) addComponent(entityId, 'meta', { label });
    return entityId;
  }

  function destroyEntity(entityId) {
    if (!ecs.entities.has(entityId)) return;
    ecs.entities.delete(entityId);
    for (const store of ecs.components.values()) {
      store.delete(entityId);
    }
  }

  function addComponent(entityId, name, data = {}) {
    if (!ecs.entities.has(entityId)) ecs.entities.add(entityId);
    ensureStore(name).set(entityId, data);
    return data;
  }

  function getComponent(entityId, name) {
    return ecs.components.get(name)?.get(entityId) ?? null;
  }

  function removeComponent(entityId, name) {
    ecs.components.get(name)?.delete(entityId);
  }

  function hasComponent(entityId, name) {
    return ecs.components.get(name)?.has(entityId) ?? false;
  }

  function queryEntities(componentNames) {
    const names = Array.isArray(componentNames) ? componentNames : Array.from(arguments);
    if (!names.length) return Array.from(ecs.entities);

    const stores = names.map((name) => ecs.components.get(name));
    if (stores.some((store) => !store)) return [];

    const orderedNames = [...names].sort((first, second) => ecs.components.get(first).size - ecs.components.get(second).size);
    const seedStore = ecs.components.get(orderedNames[0]);
    const result = [];

    for (const entityId of seedStore.keys()) {
      if (!ecs.entities.has(entityId)) continue;
      let matches = true;
      for (let index = 1; index < orderedNames.length; index++) {
        if (!ecs.components.get(orderedNames[index])?.has(entityId)) {
          matches = false;
          break;
        }
      }
      if (matches) result.push(entityId);
    }

    return result;
  }

  function eachEntity(componentNames, callback) {
    for (const entityId of queryEntities(componentNames)) {
      callback(entityId);
    }
  }

  Object.assign(game, {
    ecs,
    resetECS,
    createEntity,
    destroyEntity,
    addComponent,
    getComponent,
    removeComponent,
    hasComponent,
    queryEntities,
    eachEntity
  });
})(window.TidalIsle);
