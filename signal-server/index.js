/*
 * CCGame WebRTC 信令转发服务器
 *
 * 使用 @trystero-p2p/ws-relay 提供的 createWsRelayServer，仅承担 WebRTC
 * 握手阶段的信令转发（pub/sub 风格的 topic 消息），握手成功后游戏数据
 * 在玩家间直接 P2P 端到端传输，本服务器不承载任何游戏数据。
 *
 * 环境变量：
 *   PORT  监听端口（默认 8080）
 *   HOST  监听地址（默认 0.0.0.0）
 */

import http from 'node:http';
import { createWsRelayServer } from '@trystero-p2p/ws-relay/server';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

// 先建好 HTTP server（不挂请求处理器），再用它创建 ws-relay，
// 最后挂上 /healthz 处理器并 listen——避免在请求处理器里引用尚未声明的 relay。
const httpServer = http.createServer();

const relay = createWsRelayServer({
  server: httpServer,
  onError: (err) => {
    console.error('[ws-relay] error:', err && err.message ? err.message : err);
  },
});

httpServer.on('request', (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, subscribers: relay.getSubscriberCount() }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[ccgame-signal-relay] listening on ws://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`[ccgame-signal-relay] received ${signal}, shutting down...`);
  relay.close()
    .catch((err) => console.error('[shutdown] relay close error:', err))
    .finally(() => {
      httpServer.close(() => process.exit(0));
      // 兜底，避免 keep-alive 连接挂住进程
      setTimeout(() => process.exit(0), 5000).unref();
    });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
