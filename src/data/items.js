import.meta.glob('./items/**/*.js', { eager: true });

(function (game) {
  const ITEM_TYPE_NAMES = {
    material: '材料',
    consumable: '消耗品',
    tool: '工具',
    weapon: '武器',
    buildable: '建造物'
  };

  const DEFAULT_ITEM = {
    name: '',
    type: 'material',
    icon: '•',
    stack: 20,
    tint: '#dbe8f0',
    description: ''
  };

  const ITEM_DEFS = {
    ...(game.itemRegistry || {})
  };

  function getItemConfig(key) {
    return ITEM_DEFS[key] || { ...DEFAULT_ITEM, name: key };
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

  function invokeItemUse(itemOrKey, context = {}) {
    const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey?.key;
    const item = typeof itemOrKey === 'string' ? getItemConfig(itemOrKey) : itemOrKey?.item || itemOrKey;
    if (!item || typeof item.use !== 'function') return false;
    return item.use({ ...context, key, item, game }) === true;
  }

  function invokeItemPrimaryAction(itemOrKey, context = {}) {
    const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey?.key;
    const item = typeof itemOrKey === 'string' ? getItemConfig(itemOrKey) : itemOrKey?.item || itemOrKey;
    if (!item || typeof item.onPrimaryAction !== 'function') return false;
    return item.onPrimaryAction({ ...context, key, item, game }) === true;
  }

  const RESOURCE_ORDER = Object.keys(ITEM_DEFS).filter((key) => !ITEM_DEFS[key].virtual);
  const RESOURCE_NAMES = Object.fromEntries(RESOURCE_ORDER.map((key) => [key, ITEM_DEFS[key].name]));

  Object.assign(game, {
    ITEM_TYPE_NAMES,
    ITEM_DEFS,
    RESOURCE_ORDER,
    RESOURCE_NAMES,
    getItemConfig,
    getItemTypeLabel,
    isConsumableItem,
    isEquippableItem,
    isBuildableItem,
    invokeItemUse,
    invokeItemPrimaryAction
  });
})(window.TidalIsle);
