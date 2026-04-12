(function (game) {
  const {
    state,
    dist,
    getPlayerSnapshot,
    getStructureIds,
    getComponent,
    getStructureHintText,
    getSelectedItem,
    screenToWorld,
    tileAtWorld,
    isNight
  } = game;

  function updateHintSystem() {
    const player = getPlayerSnapshot();
    if (!player?.transform) {
      state.hint = '';
      return;
    }

    const candidates = getStructureIds()
      .filter((structureId) => {
        const transform = getComponent(structureId, 'transform');
        return transform && dist(player.transform.x, player.transform.y, transform.x, transform.y) < 62;
      })
      .sort((firstId, secondId) => {
        const first = getComponent(firstId, 'transform');
        const second = getComponent(secondId, 'transform');
        return dist(player.transform.x, player.transform.y, first.x, first.y) - dist(player.transform.x, player.transform.y, second.x, second.y);
      });

    for (const structureId of candidates) {
      const hint = getStructureHintText(structureId);
      if (hint) {
        state.hint = hint;
        return;
      }
    }

    const selected = getSelectedItem();
    if (selected && !selected.isFallback && selected.item?.type === 'buildable') {
      state.hint = '左键放置 ' + selected.item.name + ' · 右键取消手持';
      return;
    }

    if (selected && !selected.isFallback && selected.item?.type === 'consumable') {
      state.hint = '左键直接使用 ' + selected.item.name + ' · 右键取消手持';
      return;
    }

    if (selected?.item?.toolKey === 'fishingRod') {
      if (state.fishing?.active && state.fishing.phase === 'bite') {
        state.hint = '鱼儿上钩了：左键立刻收竿';
        return;
      }

      if (state.fishing?.active) {
        state.hint = '等待咬钩中 · 离浮标太远会自动收线';
        return;
      }

      if (state.pointer.x || state.pointer.y) {
        const pointerWorld = screenToWorld(state.pointer.x, state.pointer.y);
        const tile = tileAtWorld(pointerWorld.x, pointerWorld.y);
        if ((tile === 'water' || tile === 'deep') && dist(player.transform.x, player.transform.y, pointerWorld.x, pointerWorld.y) <= 108) {
          state.hint = '左键抛竿 · 浮标下沉时再左键收竿';
          return;
        }
      }

      state.hint = '把准星移到近处水面后左键抛竿';
      return;
    }

    if (selected?.isFallback && state.selectedWorldTarget) {
      state.hint = '空手时左键可直接采集资源或攻击敌人，底部面板仍可执行拆卸等操作';
      return;
    }

    if (selected?.isFallback) {
      state.hint = '空手时左键可选中目标，点到资源会采集，点到敌人会攻击';
      return;
    }

    if (isNight()) {
      state.hint = '夜幕已降临：靠近篝火恢复，长矛更适合战斗';
      return;
    }

    state.hint = '白天多收集木材、石块与纤维，为夜晚做准备';
  }

  Object.assign(game, {
    updateHintSystem
  });
})(window.TidalIsle);
