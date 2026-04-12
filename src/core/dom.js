(function (game) {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const dom = {
    barsEl: document.getElementById('bars'),
    inventoryEl: document.getElementById('inventory'),
    craftListEl: document.getElementById('craftList'),
    hotbarEl: document.getElementById('hotbar'),
    dayInfoEl: document.getElementById('dayInfo'),
    weatherInfoEl: document.getElementById('weatherInfo'),
    scoreInfoEl: document.getElementById('scoreInfo'),
    messageEl: document.getElementById('message'),
    hintEl: document.getElementById('hint'),
    minimapEl: document.getElementById('minimap'),
    minimapInfoEl: document.getElementById('minimapInfo'),
    worldTargetPanelEl: document.getElementById('worldTargetPanel'),
    startOverlay: document.getElementById('startOverlay'),
    gameOverOverlay: document.getElementById('gameOverOverlay'),
    gameOverText: document.getElementById('gameOverText'),
    startBtn: document.getElementById('startBtn'),
    restartBtn: document.getElementById('restartBtn'),
    itemTooltipEl: document.getElementById('itemTooltip'),
    itemMenuEl: document.getElementById('itemMenu'),
    itemMenuTitleEl: document.getElementById('itemMenuTitle'),
    itemMenuUseBtn: document.getElementById('itemMenuUseBtn'),
    itemMenuBindBtn: document.getElementById('itemMenuBindBtn'),
    itemMenuDropBtn: document.getElementById('itemMenuDropBtn'),
    itemMenuClearBtn: document.getElementById('itemMenuClearBtn')
  };

  const view = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2)
  };

  function resize() {
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    canvas.style.width = view.width + 'px';
    canvas.style.height = view.height + 'px';
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  Object.assign(game, {
    canvas,
    ctx,
    dom,
    view,
    resize
  });
})(window.TidalIsle);
