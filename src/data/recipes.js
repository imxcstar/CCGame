(function (game) {
  const CRAFTING_RECIPES = {
    axe: { name: '石斧', cost: { wood: 3, stone: 2, fiber: 1 }, category: 'tool' },
    pickaxe: { name: '石镐', cost: { wood: 3, stone: 3, fiber: 1 }, category: 'tool' },
    club: { name: '木棒', cost: { wood: 4 }, category: 'weapon' },
    spear: { name: '长矛', cost: { wood: 3, stone: 1, fiber: 2 }, category: 'weapon' },
    fishingRod: { name: '鱼竿', cost: { wood: 4, fiber: 5 }, category: 'tool' },
    seedPack: { name: '混合种子包', cost: { berry: 1, fiber: 2 }, category: 'material' },
    bandage: { name: '绷带', cost: { fiber: 6 }, category: 'consumable' },
    jerky: { name: '肉干', cost: { meat: 1, fiber: 3 }, category: 'consumable' },
    berryPie: { name: '浆果派', cost: { berry: 2, pumpkin: 1 }, category: 'consumable' },
    campfire: { name: '篝火套件', cost: { wood: 5, stone: 4 }, category: 'buildable' },
    wall: { name: '木墙', cost: { wood: 3, stone: 1 }, category: 'buildable' },
    floor: { name: '木地板', cost: { wood: 2 }, category: 'buildable' },
    collector: { name: '雨水收集器', cost: { wood: 4, fiber: 4, stone: 2 }, category: 'buildable' },
    planter: { name: '种植箱', cost: { wood: 4, fiber: 3 }, category: 'buildable' }
  };

  Object.assign(game, {
    CRAFTING_RECIPES
  });
})(window.TidalIsle);
