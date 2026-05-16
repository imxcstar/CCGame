/*
 * 联机 UI 绑定（第 1 步基建）
 *
 * 把 start overlay 上的"联机"按钮、房间面板（创建 / 加入 / 离开 / 聊天 /
 * 成员列表）与 `game.netSession` 的事件流连接起来。该模块不直接改变游戏
 * 主流程，单机玩家完全可以忽略联机功能。
 */
(function (game) {
  const { dom, netSession } = game;

  if (!dom?.openMultiplayerBtn || !netSession) {
    return;
  }

  const STORAGE_KEY = 'ccgame.mp.name';
  const STORAGE_ROOM_NAME_KEY = 'ccgame.mp.roomName';
  let latencyTimer = 0;
  let lobbyBrowsing = false;
  let unsubscribeLobby = null;

  function loadStoredName() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function persistName(name) {
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      /* ignore quota / disabled storage */
    }
  }

  function openOverlay() {
    dom.multiplayerOverlay.classList.add('show');
    dom.mpError.textContent = '';
    if (!dom.mpNameInput.value) {
      dom.mpNameInput.value = loadStoredName();
    }
    if (dom.mpRoomNameInput && !dom.mpRoomNameInput.value) {
      try { dom.mpRoomNameInput.value = localStorage.getItem(STORAGE_ROOM_NAME_KEY) || ''; } catch { /* ignore */ }
    }
    refreshView();
    setTimeout(() => {
      if (netSession.state.status === 'connected') {
        dom.mpChatInput.focus();
      } else {
        dom.mpNameInput.focus();
      }
    }, 60);
  }

  function closeOverlay() {
    dom.multiplayerOverlay.classList.remove('show');
    if (lobbyBrowsing) stopLobbyBrowse();
  }

  function setError(message) {
    dom.mpError.textContent = message || '';
  }

  function renderPeers() {
    const peers = Array.from(netSession.state.peers.values()).sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    });
    const localIsHost = netSession.isHost();
    dom.mpPeerList.innerHTML = '';
    peers.forEach((peer) => {
      const li = document.createElement('li');

      const dot = document.createElement('span');
      dot.className = 'mp-peer-dot';
      dot.style.background = peer.color || '#9f927d';
      li.appendChild(dot);

      const name = document.createElement('span');
      name.textContent = peer.name;
      li.appendChild(name);

      if (peer.isHost) {
        const tag = document.createElement('span');
        tag.className = 'mp-peer-tag';
        tag.textContent = '房主';
        li.appendChild(tag);
      }
      if (peer.isLocal) {
        const tag = document.createElement('span');
        tag.className = 'mp-peer-tag local';
        tag.textContent = '你';
        li.appendChild(tag);
      }

      const latency = document.createElement('span');
      latency.className = 'mp-peer-latency';
      if (peer.isLocal) {
        latency.textContent = '本机';
      } else if (peer.latency > 0) {
        latency.textContent = `${peer.latency} ms`;
      } else {
        latency.textContent = '—';
      }
      li.appendChild(latency);

      // 房主控制：可以踢人 / 转让房主（对非自己的远端 peer 显示）
      if (localIsHost && !peer.isLocal) {
        // 对话框里只显示纯文本：去掉控制字符并限长，避免奇怪昵称把提示撑爆
        const displayName = String(peer.name || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 24) || peer.id.slice(0, 4);
        const actions = document.createElement('span');
        actions.className = 'mp-peer-actions';

        const transferBtn = document.createElement('button');
        transferBtn.type = 'button';
        transferBtn.className = 'mp-mini-btn mp-peer-action';
        transferBtn.textContent = '转让';
        transferBtn.title = '把房主转让给该玩家';
        transferBtn.addEventListener('click', () => {
          if (!window.confirm(`确认把房主转让给 ${displayName}？`)) return;
          game.playSound?.('click');
          try { netSession.transferHostTo(peer.id); } catch (err) {
            console.warn('[mp ui] transfer error', err);
          }
        });
        actions.appendChild(transferBtn);

        const kickBtn = document.createElement('button');
        kickBtn.type = 'button';
        kickBtn.className = 'mp-mini-btn mp-peer-action danger';
        kickBtn.textContent = '踢出';
        kickBtn.title = '把该玩家移出房间';
        kickBtn.addEventListener('click', () => {
          if (!window.confirm(`确认把 ${displayName} 移出房间？`)) return;
          game.playSound?.('click');
          try { netSession.kickPeer(peer.id); } catch (err) {
            console.warn('[mp ui] kick error', err);
          }
        });
        actions.appendChild(kickBtn);

        li.appendChild(actions);
      }

      dom.mpPeerList.appendChild(li);
    });
  }

  function formatChatTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function renderChat() {
    const log = dom.mpChatLog;
    const wasNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = '';
    netSession.state.chatHistory.forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'mp-chat-entry' + (entry.system ? ' system' : '');
      if (entry.system) {
        div.textContent = `[${formatChatTime(entry.ts)}] ${entry.text}`;
      } else {
        const name = document.createElement('span');
        name.className = 'name';
        name.style.color = entry.color || '#794f27';
        name.textContent = `${entry.name}:`;
        div.appendChild(name);
        const text = document.createTextNode(' ' + entry.text);
        div.appendChild(text);
        const time = document.createElement('span');
        time.className = 'subtle';
        time.style.marginLeft = '6px';
        time.style.fontSize = '11px';
        time.textContent = formatChatTime(entry.ts);
        div.appendChild(time);
      }
      log.appendChild(div);
    });
    if (wasNearBottom) {
      log.scrollTop = log.scrollHeight;
    }
  }

  function refreshView() {
    const { status, roomCode } = netSession.state;
    const connected = status === 'connected';
    const connecting = status === 'connecting';

    dom.mpLobbyActions.hidden = connected;
    dom.mpRoomSection.hidden = status === 'idle';

    dom.mpRoomCode.textContent = roomCode || '------';
    dom.mpRoomStatus.dataset.status = status;
    dom.mpRoomStatus.textContent =
      connected ? '已连接' :
      connecting ? '连接中…' :
      status === 'error' ? '连接失败' : '未连接';

    dom.mpHostBtn.disabled = connecting;
    dom.mpJoinBtn.disabled = connecting;
    dom.mpLeaveBtn.disabled = !connected && !connecting;
    dom.mpChatInput.disabled = !connected;
    dom.mpChatForm.querySelector('button[type="submit"]').disabled = !connected;

    if (status === 'error' && netSession.state.error) {
      setError('连接失败：' + netSession.state.error);
    }

    renderPeers();
    renderChat();
  }

  function getInputName() {
    return dom.mpNameInput.value.trim().slice(0, 32);
  }

  async function handleHost() {
    setError('');
    const name = getInputName();
    persistName(name);
    const roomName = (dom.mpRoomNameInput?.value || '').trim().slice(0, 40);
    try { localStorage.setItem(STORAGE_ROOM_NAME_KEY, roomName); } catch { /* ignore */ }
    const maxPlayers = Math.max(2, Math.min(16, Number(dom.mpMaxPlayersInput?.value || 8) | 0));
    const password = (dom.mpPasswordInput?.value || '').trim();
    const isPublic = !!dom.mpPublicInput?.checked;
    try {
      await netSession.hostRoom({ name, roomName, maxPlayers, password, isPublic });
    } catch (err) {
      setError('创建房间失败：' + (err?.message || err));
    }
  }

  async function handleJoin(prefillCode, prefillPassword) {
    setError('');
    const name = getInputName();
    persistName(name);
    const code = (prefillCode != null ? prefillCode : dom.mpJoinCodeInput.value) || '';
    const password = prefillPassword != null ? prefillPassword : (dom.mpJoinPasswordInput?.value || '');
    if (!code.trim()) {
      setError('请输入房间码');
      return;
    }
    try {
      await netSession.joinRoom({ code, name, password });
    } catch (err) {
      setError('加入房间失败：' + (err?.message || err));
    }
  }

  function renderLobbyList(rooms) {
    const list = dom.mpLobbyList;
    if (!list) return;
    list.innerHTML = '';
    if (!lobbyBrowsing) {
      const li = document.createElement('li');
      li.className = 'mp-lobby-empty';
      li.textContent = '点击"刷新大厅"以浏览公开房间';
      list.appendChild(li);
      return;
    }
    if (!rooms || rooms.length === 0) {
      const li = document.createElement('li');
      li.className = 'mp-lobby-empty';
      li.textContent = '正在监听大厅广播…（暂无公开房间）';
      list.appendChild(li);
      return;
    }
    rooms.forEach((room) => {
      const li = document.createElement('li');
      li.className = 'mp-lobby-item';

      const info = document.createElement('div');
      info.className = 'mp-lobby-info';
      const title = document.createElement('div');
      title.className = 'mp-lobby-title';
      title.textContent = room.name || `${room.code} 的房间`;
      if (room.hasPassword) {
        const lock = document.createElement('span');
        lock.className = 'mp-lobby-lock';
        lock.textContent = '🔒';
        lock.title = '需要密码';
        title.appendChild(lock);
      }
      info.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'mp-lobby-meta subtle';
      meta.textContent = `房主：${room.host || '匿名'} · ${room.peerCount}/${room.maxPlayers} · 房间码 ${room.code}`;
      info.appendChild(meta);

      li.appendChild(info);

      const joinBtn = document.createElement('button');
      joinBtn.type = 'button';
      joinBtn.className = 'mp-mini-btn';
      joinBtn.textContent = '加入';
      joinBtn.disabled = room.peerCount >= room.maxPlayers;
      if (joinBtn.disabled) joinBtn.title = '房间已满';
      joinBtn.addEventListener('click', () => {
        game.playSound?.('click');
        let password = '';
        if (room.hasPassword) {
          password = window.prompt(`房间「${room.name}」需要密码：`, '') || '';
          if (!password) return;
        }
        dom.mpJoinCodeInput.value = room.code;
        if (dom.mpJoinPasswordInput) dom.mpJoinPasswordInput.value = password;
        handleJoin(room.code, password);
      });
      li.appendChild(joinBtn);

      list.appendChild(li);
    });
  }

  async function startLobbyBrowse() {
    if (!game.netLobby) return;
    lobbyBrowsing = true;
    if (dom.mpLobbyToggleBtn) dom.mpLobbyToggleBtn.textContent = '停止浏览';
    renderLobbyList([]);
    try {
      await game.netLobby.startBrowse();
      if (unsubscribeLobby) unsubscribeLobby();
      unsubscribeLobby = game.netLobby.on((rooms) => {
        if (lobbyBrowsing) renderLobbyList(rooms);
      });
      renderLobbyList(game.netLobby.getRooms());
    } catch (err) {
      console.warn('[mp ui] lobby browse error', err);
      setError('大厅连接失败：' + (err?.message || err));
      lobbyBrowsing = false;
      if (dom.mpLobbyToggleBtn) dom.mpLobbyToggleBtn.textContent = '刷新大厅';
      renderLobbyList([]);
    }
  }

  function stopLobbyBrowse() {
    lobbyBrowsing = false;
    if (unsubscribeLobby) { unsubscribeLobby(); unsubscribeLobby = null; }
    try { game.netLobby?.stopBrowse?.(); } catch (err) { console.warn('[mp ui] lobby stop error', err); }
    if (dom.mpLobbyToggleBtn) dom.mpLobbyToggleBtn.textContent = '刷新大厅';
    renderLobbyList([]);
  }

  function toggleLobbyBrowse() {
    if (lobbyBrowsing) stopLobbyBrowse();
    else startLobbyBrowse();
  }

  async function handleLeave() {
    try {
      await netSession.leave();
    } catch (err) {
      console.warn('[mp ui] leave error', err);
    }
  }

  async function handleCopyCode() {
    const code = netSession.state.roomCode;
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        dom.mpCopyCodeBtn.textContent = '已复制';
      } else {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        dom.mpCopyCodeBtn.textContent = '已复制';
      }
      setTimeout(() => { dom.mpCopyCodeBtn.textContent = '复制'; }, 1500);
    } catch (err) {
      console.warn('[mp ui] copy error', err);
    }
  }

  function handleChatSubmit(event) {
    event.preventDefault();
    const text = dom.mpChatInput.value.trim();
    if (!text) return;
    netSession.sendChat(text);
    dom.mpChatInput.value = '';
  }

  function handleNameChange() {
    const name = getInputName();
    persistName(name);
    if (netSession.isConnected()) {
      netSession.setLocalName(name);
    }
  }

  function startLatencyTimer() {
    if (latencyTimer) return;
    latencyTimer = setInterval(() => {
      if (netSession.isConnected()) {
        netSession.refreshLatencies();
      }
    }, 5000);
  }

  function bindMultiplayerUi() {
    dom.openMultiplayerBtn.addEventListener('click', () => {
      game.playSound?.('click');
      openOverlay();
    });
    dom.mpCloseBtn.addEventListener('click', () => {
      game.playSound?.('click');
      closeOverlay();
    });
    dom.mpHostBtn.addEventListener('click', () => {
      game.playSound?.('click');
      handleHost();
    });
    dom.mpJoinBtn.addEventListener('click', () => {
      game.playSound?.('click');
      handleJoin();
    });
    if (dom.mpLobbyToggleBtn) {
      dom.mpLobbyToggleBtn.addEventListener('click', () => {
        game.playSound?.('click');
        toggleLobbyBrowse();
      });
    }
    dom.mpJoinCodeInput.addEventListener('input', (event) => {
      const upper = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (event.target.value !== upper) {
        event.target.value = upper;
      }
    });
    dom.mpJoinCodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleJoin();
      }
    });
    dom.mpLeaveBtn.addEventListener('click', () => {
      game.playSound?.('click');
      handleLeave();
    });
    dom.mpCopyCodeBtn.addEventListener('click', handleCopyCode);
    dom.mpChatForm.addEventListener('submit', handleChatSubmit);
    dom.mpNameInput.addEventListener('change', handleNameChange);
    dom.mpNameInput.addEventListener('blur', handleNameChange);

    bindServerSettings();

    netSession.on('change', () => refreshView());
    netSession.on('chat', () => renderChat());

    startLatencyTimer();
    refreshView();
  }

  // ---- 自定义中转服务器设置 ----

  function openServerSettings() {
    const cfg = game.netServerConfig?.getServerConfig?.() || { strategy: 'torrent', relayUrls: [] };
    if (dom.mpStrategyTorrent) dom.mpStrategyTorrent.checked = cfg.strategy !== 'ws-relay';
    if (dom.mpStrategyWsRelay) dom.mpStrategyWsRelay.checked = cfg.strategy === 'ws-relay';
    if (dom.mpRelayUrlsInput) dom.mpRelayUrlsInput.value = (cfg.relayUrls || []).join('\n');
    if (dom.mpServerSettingsError) dom.mpServerSettingsError.textContent = '';
    syncServerSettingsFieldVisibility();
    dom.mpServerSettingsOverlay?.classList.add('show');
  }

  function closeServerSettings() {
    dom.mpServerSettingsOverlay?.classList.remove('show');
  }

  function syncServerSettingsFieldVisibility() {
    const useRelay = !!dom.mpStrategyWsRelay?.checked;
    if (dom.mpRelayUrlsField) dom.mpRelayUrlsField.hidden = !useRelay;
  }

  function parseRelayUrls(text) {
    return String(text || '')
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleSaveServerSettings() {
    if (!game.netServerConfig) return;
    const useRelay = !!dom.mpStrategyWsRelay?.checked;
    const urls = parseRelayUrls(dom.mpRelayUrlsInput?.value || '');
    if (useRelay) {
      if (urls.length === 0) {
        if (dom.mpServerSettingsError) dom.mpServerSettingsError.textContent = '请填写至少一个 wss:// 或 ws:// 地址。';
        return;
      }
      const bad = urls.find((u) => !/^wss?:\/\//i.test(u));
      if (bad) {
        if (dom.mpServerSettingsError) dom.mpServerSettingsError.textContent = '地址必须以 wss:// 或 ws:// 开头：' + bad;
        return;
      }
    }
    game.netServerConfig.setServerConfig({
      strategy: useRelay ? 'ws-relay' : 'torrent',
      relayUrls: useRelay ? urls : []
    });
    closeServerSettings();
    setError('已应用新的中转服务器设置。如已在房间中，连接已断开，请重新创建 / 加入房间。');
  }

  function handleResetServerSettings() {
    if (!game.netServerConfig) return;
    game.netServerConfig.resetServerConfig();
    const cfg = game.netServerConfig.getServerConfig();
    if (dom.mpStrategyTorrent) dom.mpStrategyTorrent.checked = cfg.strategy !== 'ws-relay';
    if (dom.mpStrategyWsRelay) dom.mpStrategyWsRelay.checked = cfg.strategy === 'ws-relay';
    if (dom.mpRelayUrlsInput) dom.mpRelayUrlsInput.value = (cfg.relayUrls || []).join('\n');
    syncServerSettingsFieldVisibility();
    if (dom.mpServerSettingsError) dom.mpServerSettingsError.textContent = '';
  }

  function bindServerSettings() {
    if (!dom.mpSettingsBtn || !dom.mpServerSettingsOverlay) return;
    dom.mpSettingsBtn.addEventListener('click', () => {
      game.playSound?.('click');
      openServerSettings();
    });
    dom.mpServerSettingsCancelBtn?.addEventListener('click', () => {
      game.playSound?.('click');
      closeServerSettings();
    });
    dom.mpServerSettingsSaveBtn?.addEventListener('click', () => {
      game.playSound?.('click');
      handleSaveServerSettings();
    });
    dom.mpServerSettingsResetBtn?.addEventListener('click', () => {
      game.playSound?.('click');
      handleResetServerSettings();
    });
    dom.mpStrategyTorrent?.addEventListener('change', syncServerSettingsFieldVisibility);
    dom.mpStrategyWsRelay?.addEventListener('change', syncServerSettingsFieldVisibility);
    // 点遮罩区域关闭
    dom.mpServerSettingsOverlay.addEventListener('click', (event) => {
      if (event.target === dom.mpServerSettingsOverlay) closeServerSettings();
    });
  }

  Object.assign(game, {
    bindMultiplayerUi
  });
})(window.TidalIsle);
