/*
 * 房间大厅（lobby）
 *
 * 通过一个独立的 Trystero "大厅房间"做公共房间的发现：
 *   - 公开房间的房主会定期向大厅广播自己的房间码、名称、当前人数、上限等
 *   - 浏览大厅的玩家进入这个房间，收集所有 ANNOUNCE，去重展示成列表
 *   - 玩家点"加入"时，先离开大厅、再用真实房间码 join 主游戏房间
 *
 * 该模块与 `src/net/transport.js` 解耦：它直接动态 import
 * @trystero-p2p/torrent 并维护自己的 room 引用，避免与主游戏 transport 互相
 * 影响（玩家可以同时是某个房间的房主，又允许他在大厅中"宣告自己存在"，
 * 但浏览大厅时建议先 leave 主房间或不浏览）。这里 ANNOUNCE 与浏览使用同一
 * 个大厅房间，单向消息，不依赖对端连接。
 *
 * 隐私：私密房间（非公开）不会进入大厅广播；公开房间也不会暴露密码本身，
 * 只会发送 `hasPassword` 标志。
 */
(function (game) {
  const LOBBY_ROOM_ID = 'tidal-isle-public-lobby-v1';
  const APP_ID = 'tidal-isle-ccgame';
  const ANNOUNCE_CHANNEL = 'lobann'; // <=12 chars
  const ANNOUNCE_INTERVAL_MS = 6000;
  const ROOM_TTL_MS = 14000; // 超过该时长没有再次收到 announce 就移除

  const DEFAULT_STUN = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  let joinRoomFn = null;
  let joinRoomFnPromise = null;
  let lobbyRoom = null;
  let lobbySendAnnounce = null;
  let lobbyMode = null; // 'browse' | 'announce' | null

  // roomCode -> { code, name, host, maxPlayers, peerCount, hasPassword, updatedAt }
  const rooms = new Map();
  const listeners = new Set();
  let announceTimer = 0;
  let sweepTimer = 0;
  let currentAnnounce = null;

  function emit() {
    const list = Array.from(rooms.values())
      .filter((r) => Date.now() - r.updatedAt <= ROOM_TTL_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    listeners.forEach((fn) => {
      try { fn(list); } catch (err) { console.warn('[lobby] listener error', err); }
    });
  }

  function on(handler) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  }

  function getRooms() {
    const now = Date.now();
    return Array.from(rooms.values())
      .filter((r) => now - r.updatedAt <= ROOM_TTL_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function ensureJoin() {
    if (lobbyRoom) return lobbyRoom;
    if (!joinRoomFn) {
      // 并发调用 ensureJoin 时复用同一个 import promise，避免重复加载 trystero
      if (!joinRoomFnPromise) {
        joinRoomFnPromise = import('@trystero-p2p/torrent').then((mod) => {
          joinRoomFn = mod.joinRoom;
          return joinRoomFn;
        });
      }
      await joinRoomFnPromise;
    }
    if (lobbyRoom) return lobbyRoom;
    const config = {
      appId: APP_ID,
      rtcConfig: { iceServers: DEFAULT_STUN }
    };
    lobbyRoom = joinRoomFn(config, LOBBY_ROOM_ID);
    const [send, receive] = lobbyRoom.makeAction(ANNOUNCE_CHANNEL);
    lobbySendAnnounce = send;
    receive((data) => {
      if (!data || typeof data !== 'object') return;
      const code = String(data.c || '').toUpperCase().slice(0, 12);
      if (!code) return;
      const existing = rooms.get(code) || {};
      rooms.set(code, {
        code,
        name: String(data.n || '').slice(0, 40) || `${code} 的房间`,
        host: String(data.h || '').slice(0, 32),
        maxPlayers: Math.max(2, Math.min(16, (data.m | 0) || 4)),
        peerCount: Math.max(1, (data.p | 0) || 1),
        hasPassword: !!data.w,
        updatedAt: Date.now(),
        ...(existing && existing.code ? {} : {})
      });
      emit();
    });
    return lobbyRoom;
  }

  function startSweep() {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
      const now = Date.now();
      let removed = false;
      rooms.forEach((r, code) => {
        if (now - r.updatedAt > ROOM_TTL_MS) {
          rooms.delete(code);
          removed = true;
        }
      });
      if (removed) emit();
    }, 3000);
  }

  function stopSweep() {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = 0;
    }
  }

  async function startBrowse() {
    lobbyMode = 'browse';
    await ensureJoin();
    startSweep();
    emit();
  }

  function stopBrowse() {
    if (lobbyMode === 'browse') {
      lobbyMode = null;
    }
    // 若同时不在 announce 状态，断开大厅
    maybeShutdown();
  }

  function buildAnnouncePayload(info) {
    return {
      c: String(info.code || '').slice(0, 12),
      n: String(info.name || '').slice(0, 40),
      h: String(info.host || '').slice(0, 32),
      m: Math.max(2, Math.min(16, (info.maxPlayers | 0) || 4)),
      p: Math.max(1, (info.peerCount | 0) || 1),
      w: info.hasPassword ? 1 : 0
    };
  }

  async function startAnnounce(info) {
    if (!info || !info.code) return;
    currentAnnounce = { ...info };
    lobbyMode = lobbyMode === 'browse' ? 'browse' : 'announce';
    await ensureJoin();
    // 立刻广播一次
    try { lobbySendAnnounce?.(buildAnnouncePayload(currentAnnounce)); } catch (err) { console.warn('[lobby] announce error', err); }
    if (announceTimer) clearInterval(announceTimer);
    announceTimer = setInterval(() => {
      if (!currentAnnounce) return;
      try { lobbySendAnnounce?.(buildAnnouncePayload(currentAnnounce)); } catch (err) { console.warn('[lobby] announce error', err); }
    }, ANNOUNCE_INTERVAL_MS);
  }

  function updateAnnounce(patch) {
    if (!currentAnnounce) return;
    Object.assign(currentAnnounce, patch || {});
    try { lobbySendAnnounce?.(buildAnnouncePayload(currentAnnounce)); } catch (err) { console.warn('[lobby] announce error', err); }
  }

  function stopAnnounce() {
    currentAnnounce = null;
    if (announceTimer) {
      clearInterval(announceTimer);
      announceTimer = 0;
    }
    maybeShutdown();
  }

  async function maybeShutdown() {
    if (lobbyMode === 'browse') return;
    if (currentAnnounce) return;
    // 既不在浏览也不在宣告：彻底关闭大厅连接以节约带宽
    stopSweep();
    rooms.clear();
    emit();
    if (lobbyRoom) {
      try { await lobbyRoom.leave(); } catch (err) { console.warn('[lobby] leave error', err); }
      lobbyRoom = null;
      lobbySendAnnounce = null;
    }
  }

  game.netLobby = {
    LOBBY_ROOM_ID,
    on,
    getRooms,
    startBrowse,
    stopBrowse,
    startAnnounce,
    updateAnnounce,
    stopAnnounce
  };
})(window.TidalIsle);
