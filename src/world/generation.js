(function (game) {
  const {
    state,
    TILE,
    WORLD_SIZE,
    hash2,
    fbm,
    tileAt,
    resetECS,
    pickEntityKind,
    createResourceEntity
  } = game;

  function createWorld() {
    state.world = [];
    resetECS();
    const center = WORLD_SIZE * 0.5;

    for (let y = 0; y < WORLD_SIZE; y++) {
      const row = [];
      for (let x = 0; x < WORLD_SIZE; x++) {
        const nx = x / WORLD_SIZE - 0.5;
        const ny = y / WORLD_SIZE - 0.5;
        const radial = Math.sqrt(nx * nx + ny * ny) * 1.84;
        const shape = fbm(x * 0.068, y * 0.068, 4) - 0.5;
        const detail = fbm(x * 0.12, y * 0.12, 16) - 0.5;
        const height = 1 - Math.pow(radial, 1.62) + shape * 0.72 + detail * 0.18;
        let tile = 'grass';

        if (height < -0.13) tile = 'deep';
        else if (height < -0.025) tile = 'water';
        else if (height < 0.065) tile = 'sand';
        else if (height < 0.51) tile = detail > 0.08 ? 'meadow' : 'grass';
        else tile = detail > 0.04 ? 'stone' : 'meadow';

        row.push(tile);
      }
      state.world.push(row);
    }

    let spawnTile = { x: center, y: center };
    for (let radius = 0; radius < 18; radius++) {
      let found = false;
      for (let offsetY = -radius; offsetY <= radius && !found; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          const tileX = Math.floor(center + offsetX);
          const tileY = Math.floor(center + offsetY);
          const tile = tileAt(tileX, tileY);
          if (tile === 'grass' || tile === 'meadow') {
            spawnTile = { x: tileX, y: tileY };
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }

    for (let y = 2; y < WORLD_SIZE - 2; y++) {
      for (let x = 2; x < WORLD_SIZE - 2; x++) {
        if (Math.abs(x - spawnTile.x) < 4 && Math.abs(y - spawnTile.y) < 4) continue;
        const tile = tileAt(x, y);
        const random = hash2(x, y, 28);
        const centerX = x * TILE + TILE * 0.5;
        const centerY = y * TILE + TILE * 0.5;
        const kind = pickEntityKind(tile, random);
        if (kind) createResourceEntity(kind, centerX, centerY);
      }
    }

    return {
      x: spawnTile.x * TILE + TILE * 0.5,
      y: spawnTile.y * TILE + TILE * 0.5
    };
  }

  Object.assign(game, {
    createWorld
  });
})(window.TidalIsle);
