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
  let latencyTimer = 0;

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
    try {
      await netSession.hostRoom({ name });
    } catch (err) {
      setError('创建房间失败：' + (err?.message || err));
    }
  }

  async function handleJoin() {
    setError('');
    const name = getInputName();
    persistName(name);
    const code = dom.mpJoinCodeInput.value;
    if (!code.trim()) {
      setError('请输入房间码');
      return;
    }
    try {
      await netSession.joinRoom({ code, name });
    } catch (err) {
      setError('加入房间失败：' + (err?.message || err));
    }
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

    netSession.on('change', () => refreshView());
    netSession.on('chat', () => renderChat());

    startLatencyTimer();
    refreshView();
  }

  Object.assign(game, {
    bindMultiplayerUi
  });
})(window.TidalIsle);
