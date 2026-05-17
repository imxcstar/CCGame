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

// 自建 HTTP server 以便挂载 /healthz，并让 ws-relay 复用同一端口
const httpServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, subscribers: relay.getSubscriberCount() }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

const relay = createWsRelayServer({
  server: httpServer,
  onError: (err) => {
    console.error('[ws-relay] error:', err && err.message ? err.message : err);
  },
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[ccgame-signal-relay] listening on ws://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`[ccgame-signal-relay] received ${signal}, shutting down...`);
  relay.close().catch(() => {}).finally(() => {
    httpServer.close(() => process.exit(0));
    // 兜底，避免 keep-alive 连接挂住进程
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
