(function (game) {
  const {
    state,
    dist,
    getPlayerSnapshot,
    getStructureIds,
    getComponent,
    getStructureHintText,
    getSelectedItem,
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
      state.hint = '左键放置 ' + selected.item.name + ' · 滚轮/数字键切换快捷栏';
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
