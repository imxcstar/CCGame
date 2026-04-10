(function (game) {
  const ITEM_TYPE_NAMES = {
    material: '材料',
    consumable: '消耗品',
    tool: '工具',
    weapon: '武器',
    buildable: '建造物'
  };

  const ITEM_DEFS = {
    hands: {
      name: '拳头',
      type: 'weapon',
      icon: '✊',
      stack: 1,
      tint: '#d8cbb3',
      description: '当前快捷栏为空时，默认使用拳头。',
      toolKey: 'hands',
      virtual: true
    },
    wood: {
      name: '木材',
      type: 'material',
      icon: '🪵',
      stack: 24,
      tint: '#c79762',
      description: '最基础的建造材料。'
    },
    stone: {
      name: '石块',
      type: 'material',
      icon: '🪨',
      stack: 24,
      tint: '#9faab6',
      description: '用于工具和营地结构。'
    },
    fiber: {
      name: '纤维',
      type: 'material',
      icon: '🌿',
      stack: 30,
      tint: '#93f59a',
      description: '制作轻型装备时需要的韧性材料。'
    },
    berry: {
      name: '浆果',
      type: 'consumable',
      icon: '🫐',
      stack: 16,
      tint: '#8fa2ff',
      description: '恢复少量饥饿与生命。'
    },
    coconut: {
      name: '椰子',
      type: 'consumable',
      icon: '🥥',
      stack: 10,
      tint: '#d7e2b9',
      description: '补充口渴，也能提供少量饱腹。'
    },
    meat: {
      name: '熟肉',
      type: 'consumable',
      icon: '🍖',
      stack: 12,
      tint: '#ff9d8f',
      description: '恢复大量饥饿，并稍微回复生命。'
    },
    axe: {
      name: '石斧',
      type: 'tool',
      icon: '🪓',
      stack: 1,
      tint: '#ffb86c',
      description: '大幅提升砍树效率。',
      toolKey: 'axe'
    },
    pickaxe: {
      name: '石镐',
      type: 'tool',
      icon: '⛏',
      stack: 1,
      tint: '#c9d4de',
      description: '更适合采石与破坏坚硬目标。',
      toolKey: 'pickaxe'
    },
    spear: {
      name: '长矛',
      type: 'weapon',
      icon: '🗡',
      stack: 1,
      tint: '#ffd37c',
      description: '更适合对抗夜晚的爬行生物。',
      toolKey: 'spear'
    },
    campfire: {
      name: '篝火套件',
      type: 'buildable',
      icon: '🔥',
      stack: 6,
      tint: '#ffca74',
      description: '放置后在夜晚提供光亮和恢复。',
      buildKind: 'campfire'
    },
    wall: {
      name: '木墙',
      type: 'buildable',
      icon: '🧱',
      stack: 12,
      tint: '#d0a06c',
      description: '拦住敌人的简单防线。',
      buildKind: 'wall'
    },
    floor: {
      name: '木地板',
      type: 'buildable',
      icon: '▦',
      stack: 16,
      tint: '#c89a68',
      description: '用于铺设营地地面。',
      buildKind: 'floor'
    },
    collector: {
      name: '雨水收集器',
      type: 'buildable',
      icon: '💧',
      stack: 6,
      tint: '#81e7ff',
      description: '会缓慢积攒可饮用的淡水。',
      buildKind: 'collector'
    }
  };

  const RESOURCE_ORDER = Object.keys(ITEM_DEFS).filter((key) => !ITEM_DEFS[key].virtual);
  const RESOURCE_NAMES = Object.fromEntries(RESOURCE_ORDER.map((key) => [key, ITEM_DEFS[key].name]));

  function getItemConfig(key) {
    return ITEM_DEFS[key] || { name: key, type: 'material', icon: '•', stack: 20, tint: '#dbe8f0', description: '' };
  }

  function getItemTypeLabel(itemOrKey) {
    const item = typeof itemOrKey === 'string' ? getItemConfig(itemOrKey) : itemOrKey;
    return ITEM_TYPE_NAMES[item?.type] || '物品';
  }

  function isConsumableItem(itemOrKey) {
    const item = typeof itemOrKey === 'string' ? getItemConfig(itemOrKey) : itemOrKey;
    return item?.type === 'consumable';
  }

  function isEquippableItem(itemOrKey) {
    const item = typeof itemOrKey === 'string' ? getItemConfig(itemOrKey) : itemOrKey;
    return item?.type === 'tool' || item?.type === 'weapon' || item?.type === 'buildable';
  }

  function isBuildableItem(itemOrKey) {
    const item = typeof itemOrKey === 'string' ? getItemConfig(itemOrKey) : itemOrKey;
    return item?.type === 'buildable';
  }

  Object.assign(game, {
    ITEM_TYPE_NAMES,
    ITEM_DEFS,
    RESOURCE_ORDER,
    RESOURCE_NAMES,
    getItemConfig,
    getItemTypeLabel,
    isConsumableItem,
    isEquippableItem,
    isBuildableItem
  });
})(window.TidalIsle);
