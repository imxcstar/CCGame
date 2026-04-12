(function (game) {
  const { state, dom, getItemTypeLabel, resolveInventoryReference, getSelectedItem } = game;

  function getDisplayReference(source, index) {
    const reference = resolveInventoryReference(source, index);
    return reference || null;
  }

  function closeTooltip() {
    dom.itemTooltipEl.classList.remove('show');
  }

  function positionFloatingElement(element, x, y, offsetX = 14, offsetY = 16) {
    const width = element.offsetWidth || 220;
    const height = element.offsetHeight || 120;
    const left = Math.min(window.innerWidth - width - 12, x + offsetX);
    const top = Math.min(window.innerHeight - height - 12, y + offsetY);
    element.style.left = Math.max(12, left) + 'px';
    element.style.top = Math.max(12, top) + 'px';
  }

  function renderTooltip(reference, source, index, x, y) {
    if (!reference) {
      closeTooltip();
      return;
    }

    const item = reference.item;
    const location = '背包格 ' + (index + 1);
    const amountText = reference.isFallback ? '默认空手' : '数量 ' + reference.amount;
    const actionText = reference.isFallback
      ? '未选中任何物品时默认使用拳头。'
      : item.type === 'consumable'
        ? '左键选中后可在地图中直接使用，右键也可立即食用。'
        : item.type === 'material'
          ? '左键可选中为当前手持，右键可丢弃。'
          : '左键选中为当前手持，右键可查看更多操作。';

    dom.itemTooltipEl.innerHTML = `
      <div class="item-tooltip-head">
        <span class="item-tooltip-icon" aria-hidden="true">${item.icon}</span>
        <div>
          <div class="item-tooltip-name">${item.name}</div>
          <div class="item-tooltip-type">${getItemTypeLabel(item)}</div>
        </div>
      </div>
      <div class="item-tooltip-meta">${location} · ${amountText}</div>
      <div class="item-tooltip-desc">${item.description || '暂无描述。'}</div>
      <div class="item-tooltip-meta">${actionText}</div>
    `;
    dom.itemTooltipEl.classList.add('show');
    positionFloatingElement(dom.itemTooltipEl, x, y);
  }

  Object.assign(game, {
    getDisplayReference,
    closeTooltip,
    positionFloatingElement,
    renderTooltip
  });
})(window.TidalIsle);
