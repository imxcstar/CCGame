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
    itemMenuClearBtn: document.getElementById('itemMenuClearBtn'),

    // 联机
    openMultiplayerBtn: document.getElementById('openMultiplayerBtn'),
    multiplayerOverlay: document.getElementById('multiplayerOverlay'),
    mpNameInput: document.getElementById('mpNameInput'),
    mpLobbyActions: document.getElementById('mpLobbyActions'),
    mpHostBtn: document.getElementById('mpHostBtn'),
    mpRoomNameInput: document.getElementById('mpRoomNameInput'),
    mpMaxPlayersInput: document.getElementById('mpMaxPlayersInput'),
    mpPasswordInput: document.getElementById('mpPasswordInput'),
    mpPublicInput: document.getElementById('mpPublicInput'),
    mpJoinCodeInput: document.getElementById('mpJoinCodeInput'),
    mpJoinPasswordInput: document.getElementById('mpJoinPasswordInput'),
    mpJoinBtn: document.getElementById('mpJoinBtn'),
    mpLobbyToggleBtn: document.getElementById('mpLobbyToggleBtn'),
    mpLobbyList: document.getElementById('mpLobbyList'),
    mpError: document.getElementById('mpError'),
    mpRoomSection: document.getElementById('mpRoomSection'),
    mpRoomCode: document.getElementById('mpRoomCode'),
    mpCopyCodeBtn: document.getElementById('mpCopyCodeBtn'),
    mpRoomStatus: document.getElementById('mpRoomStatus'),
    mpPeerList: document.getElementById('mpPeerList'),
    mpChatLog: document.getElementById('mpChatLog'),
    mpChatForm: document.getElementById('mpChatForm'),
    mpChatInput: document.getElementById('mpChatInput'),
    mpLeaveBtn: document.getElementById('mpLeaveBtn'),
    mpCloseBtn: document.getElementById('mpCloseBtn'),

    // 联机：自定义中转服务器设置
    mpSettingsBtn: document.getElementById('mpSettingsBtn'),
    mpServerSettingsOverlay: document.getElementById('mpServerSettingsOverlay'),
    mpStrategyTorrent: document.getElementById('mpStrategyTorrent'),
    mpStrategyWsRelay: document.getElementById('mpStrategyWsRelay'),
    mpRelayUrlsField: document.getElementById('mpRelayUrlsField'),
    mpRelayUrlsInput: document.getElementById('mpRelayUrlsInput'),
    mpServerSettingsError: document.getElementById('mpServerSettingsError'),
    mpServerSettingsSaveBtn: document.getElementById('mpServerSettingsSaveBtn'),
    mpServerSettingsCancelBtn: document.getElementById('mpServerSettingsCancelBtn'),
    mpServerSettingsResetBtn: document.getElementById('mpServerSettingsResetBtn')
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
