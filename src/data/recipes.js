(function (game) {
  // 烹饪通配符：菜谱 cost 中以下 key 表示"任意一种以下食材"。
  // 由 cookAtCampfire 在客户端解析为实际消耗的具体食材 key。
  const COOKING_WILDCARDS = {
    fish: ['sardine', 'mackerel', 'eel']
  };

  // 烹饪菜谱：篝火旁可制作的菜品。
  //   cost     - 食材消耗（key 可以是普通物品键，或上面的通配符键）
  //   output   - 产物（通常 1 件熟食）
  //   fuelCost - 占用篝火燃料
  //   hint     - UI 中食材不足时的提示文案
  // 注意：cost 与 output 中所有具体物品键都必须在 itemRegistry 中注册。
  const COOKING_RECIPES = {
    grilledFish: {
      name: '烤鱼',
      cost: { fish: 1 },
      output: { grilledFish: 1 },
      fuelCost: 10,
      hint: '需要沙丁鱼、鲭鱼或鳗鱼'
    },
    grilledMushroom: {
      name: '烤蘑菇',
      cost: { mushroom: 2 },
      output: { grilledMushroom: 1 },
      fuelCost: 6,
      hint: '需要 2 个蘑菇'
    },
    roastedCoconut: {
      name: '烤椰子',
      cost: { coconut: 1 },
      output: { roastedCoconut: 1 },
      fuelCost: 6,
      hint: '需要 1 个椰子'
    },
    berryJam: {
      name: '浆果果酱',
      cost: { berry: 3 },
      output: { berryJam: 1 },
      fuelCost: 8,
      hint: '需要 3 个浆果'
    },
    pumpkinSoup: {
      name: '南瓜浓汤',
      cost: { pumpkin: 1, mushroom: 1 },
      output: { pumpkinSoup: 1 },
      fuelCost: 12,
      hint: '需要南瓜 1 · 蘑菇 1'
    },
    seafoodSkewer: {
      name: '海鲜串',
      cost: { mackerel: 1, eel: 1 },
      output: { seafoodSkewer: 1 },
      fuelCost: 18,
      hint: '需要鲭鱼 1 · 鳗鱼 1'
    },
    fisherStew: {
      name: '渔夫炖菜',
      cost: { fish: 1, pumpkin: 1, mushroom: 1 },
      output: { fisherStew: 1 },
      fuelCost: 16,
      hint: '需要任意鱼 1 · 南瓜 1 · 蘑菇 1'
    }
  };

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
    COOKING_WILDCARDS,
    COOKING_RECIPES,
    CRAFTING_RECIPES
  });
})(window.TidalIsle);
