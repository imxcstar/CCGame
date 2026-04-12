function hash2(seed, x, y, offset = 0) {
  let value = Math.imul(x + 37 * offset + seed, 374761393) ^ Math.imul(y + 17 * offset + seed, 668265263);
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(seed, x, y, offset = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(seed, xi, yi, offset);
  const b = hash2(seed, xi + 1, yi, offset);
  const c = hash2(seed, xi, yi + 1, offset);
  const d = hash2(seed, xi + 1, yi + 1, offset);
  const ux = xf * xf * (3 - 2 * xf);
  const uy = yf * yf * (3 - 2 * yf);
  const top = a + (b - a) * ux;
  const bottom = c + (d - c) * ux;
  return top + (bottom - top) * uy;
}

function fbm(seed, x, y, offset = 0) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let index = 0; index < 4; index++) {
    value += smoothNoise(seed, x * frequency, y * frequency, offset + index * 11) * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return value;
}

function getHeightAt(seed, tileX, tileY, islands) {
  const shoreWarp = (smoothNoise(seed, tileX * 0.12, tileY * 0.12, 23) - 0.5) * 0.12;
  const terrainNoise = (fbm(seed, tileX * 0.074, tileY * 0.074, 7) - 0.5) * 0.2;
  const broadNoise = (smoothNoise(seed, tileX * 0.02, tileY * 0.02, 41) - 0.5) * 0.06;

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

function getGeneratedTile(seed, tileX, tileY, worldSize, islands) {
  if (tileX < 0 || tileY < 0 || tileX >= worldSize || tileY >= worldSize) return 'deep';
  const detail = fbm(seed, tileX * 0.11, tileY * 0.11, 16) - 0.5;
  return pickTileFromHeight(getHeightAt(seed, tileX, tileY, islands), detail);
}

function shouldSpawnResource(seed, tileX, tileY, worldSize) {
  const worldScale = worldSize / 512;
  const density = Math.max(0.05, 0.18 / Math.sqrt(worldScale) + 0.035);
  return hash2(seed, tileX, tileY, 63) <= density;
}

function pickEntityKind(tile, random) {
  if ((tile === 'grass' || tile === 'meadow') && random > 0.88) return 'tree';
  if (tile === 'sand' && random > 0.93) return 'palm';
  if ((tile === 'grass' || tile === 'meadow' || tile === 'stone') && random > 0.81 && random < 0.86) return 'rock';
  if ((tile === 'grass' || tile === 'meadow') && random > 0.73 && random < 0.79) return 'bush';
  return null;
}

const RESOURCE_HP = {
  tree: 10,
  palm: 8,
  rock: 11,
  bush: 5
};

function generateChunkResources(payload) {
  const resources = [];
  const { seed, cx, cy, worldSize, tileSize, chunkSize, spawnTile, archipelago } = payload;
  const startTileX = cx * chunkSize;
  const startTileY = cy * chunkSize;
  const endTileX = Math.min(worldSize, startTileX + chunkSize);
  const endTileY = Math.min(worldSize, startTileY + chunkSize);

  for (let tileY = startTileY; tileY < endTileY; tileY++) {
    for (let tileX = startTileX; tileX < endTileX; tileX++) {
      if (spawnTile && Math.abs(tileX - spawnTile.x) < 4 && Math.abs(tileY - spawnTile.y) < 4) continue;
      if (!shouldSpawnResource(seed, tileX, tileY, worldSize)) continue;

      const tile = getGeneratedTile(seed, tileX, tileY, worldSize, archipelago);
      const kind = pickEntityKind(tile, hash2(seed, tileX, tileY, 28));
      if (!kind) continue;

      resources.push({
        kind,
        x: tileX * tileSize + tileSize * 0.5,
        y: tileY * tileSize + tileSize * 0.5,
        hp: RESOURCE_HP[kind] || 1,
        alive: true,
        respawnAt: 0
      });
    }
  }

  return resources;
}

self.addEventListener('message', (event) => {
  const payload = event.data || {};
  if (payload.type !== 'generateChunk') return;

  self.postMessage({
    type: 'chunkGenerated',
    key: payload.key,
    cx: payload.cx,
    cy: payload.cy,
    revision: payload.revision,
    resources: generateChunkResources(payload)
  });
});
