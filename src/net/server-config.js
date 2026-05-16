/*
 * 联机自定义服务器配置
 *
 * 公共 BitTorrent tracker 在部分网络下可能被屏蔽或非常不稳定，导致大厅
 * 扫描不到房间、客户端连接进房间后看不到房主。本模块提供一份"自定义中
 * 转服务器"开关：用户可在联机弹窗的设置里填写 wss:// 地址，使用
 * `@trystero-p2p/ws-relay` 自建中转，从而获得稳定的信令通道。
 *
 * 配置存到 localStorage（key = STORAGE_KEY），下次自动读取。游戏代码里
 * 的传输层（src/net/transport.js）与大厅模块（src/net/lobby.js）都会
 * 通过 `getServerConfig()` 拿到当前激活策略 + URL 列表。
 *
 * 注意：房间内所有玩家必须使用同一份策略才能互相发现，所以"中转服务器
 * 地址"需要在 host / 加入者之间约定好。
 */
(function (game) {
  const STORAGE_KEY = 'ccgame.mp.serverConfig.v1';

  // strategy 取值：
  //   'torrent'  - 默认，使用公共 BitTorrent tracker（无需架服务器）
  //   'ws-relay' - 使用 @trystero-p2p/ws-relay，可填多条 wss:// URL
  const DEFAULT_CONFIG = Object.freeze({
    strategy: 'torrent',
    relayUrls: []
  });

  function sanitizeUrls(urls) {
    if (!Array.isArray(urls)) return [];
    const out = [];
    for (const raw of urls) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (!/^wss?:\/\//i.test(trimmed)) continue;
      if (trimmed.length > 256) continue;
      if (out.includes(trimmed)) continue;
      out.push(trimmed);
      if (out.length >= 6) break;
    }
    return out;
  }

  function normalize(config) {
    const strategy = config && config.strategy === 'ws-relay' ? 'ws-relay' : 'torrent';
    const relayUrls = sanitizeUrls(config && config.relayUrls);
    // ws-relay 模式必须至少一个有效 URL，否则降级回 torrent
    if (strategy === 'ws-relay' && relayUrls.length === 0) {
      return { strategy: 'torrent', relayUrls: [] };
    }
    return { strategy, relayUrls };
  }

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_CONFIG };
      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  let current = read();
  const listeners = new Set();

  function getServerConfig() {
    // 返回浅拷贝，避免调用方意外修改内部状态
    return { strategy: current.strategy, relayUrls: current.relayUrls.slice() };
  }

  function setServerConfig(next) {
    current = normalize(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* ignore quota / disabled storage */
    }
    listeners.forEach((fn) => {
      try { fn(getServerConfig()); } catch (err) { console.warn('[server-config] listener error', err); }
    });
    return getServerConfig();
  }

  function resetServerConfig() {
    return setServerConfig({ ...DEFAULT_CONFIG });
  }

  function onServerConfigChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // 动态 import 当前激活的 trystero 策略包。统一在这里管理，确保 transport
  // 与 lobby 共用同一份策略；只在策略切换时重新 import。
  let activeStrategy = null;
  let activeJoinPromise = null;

  async function loadTrysteroStrategy() {
    const target = current.strategy;
    if (activeStrategy && activeStrategy.strategy === target) {
      return activeStrategy;
    }
    if (activeJoinPromise && activeStrategy?.strategy === target) {
      return activeJoinPromise;
    }
    activeJoinPromise = (async () => {
      let mod;
      if (target === 'ws-relay') {
        mod = await import('@trystero-p2p/ws-relay');
      } else {
        mod = await import('@trystero-p2p/torrent');
      }
      activeStrategy = {
        strategy: target,
        joinRoom: mod.joinRoom,
        selfId: mod.selfId || null
      };
      return activeStrategy;
    })();
    return activeJoinPromise;
  }

  // 当配置变化时，清空缓存的 strategy，让下次 join 重新加载新包；同时通知
  // 已连接的会话 / 大厅断开，避免不同策略的房间共存导致信令错乱。
  onServerConfigChange(() => {
    activeStrategy = null;
    activeJoinPromise = null;
    try { game.netSession?.leave?.(); } catch (err) { console.warn('[server-config] session leave error', err); }
    try { game.netLobby?.stopBrowse?.(); } catch (err) { console.warn('[server-config] lobby stop error', err); }
  });

  // 把自定义 relay URL 合并进 trystero join 配置
  function applyStrategyConfig(joinConfig) {
    if (current.strategy === 'ws-relay' && current.relayUrls.length > 0) {
      joinConfig.relayConfig = { urls: current.relayUrls.slice() };
    }
    return joinConfig;
  }

  game.netServerConfig = {
    STORAGE_KEY,
    DEFAULT_CONFIG,
    getServerConfig,
    setServerConfig,
    resetServerConfig,
    onServerConfigChange,
    loadTrysteroStrategy,
    applyStrategyConfig
  };
})(window.TidalIsle);
