# CCGame 完整数据中转服务器（ws-fullrelay）

当公共 BitTorrent tracker 与 `@trystero-p2p/ws-relay` 信令中转都无法让玩家建立 WebRTC P2P 连接时（例如对称 NAT、UDP 被防火墙整体封禁、企业内网仅放行 wss:443），可以部署本目录下的 **完整数据中转服务器**。它不依赖 WebRTC，所有游戏消息（INPUT / SNAPSHOT / ENTITY_DELTA / INVENTORY / 聊天 …）通过 WebSocket 直接经服务器转发，只要客户端能打开到本服务器的 wss 连接，就一定能联机。

> ⚠️ 与 `@trystero-p2p/ws-relay` 的区别：`ws-relay` 只转发 WebRTC 信令（很小的握手数据），握手完之后游戏数据走 P2P；本服务器**承担所有数据流量**，对带宽要求更高，但在受限网络中是唯一能稳定工作的方案。

## 运行

需要 Node.js 18+：

```bash
cd server
npm install
npm start
```

默认监听 `0.0.0.0:8090`。可通过环境变量覆盖：

```bash
PORT=9000 HOST=127.0.0.1 npm start
```

健康检查：`GET /healthz` 返回当前房间数。

## 生产部署建议

浏览器在 `https://` 页面下只能连接 `wss://`，所以生产环境务必走 TLS。推荐用 Caddy / Nginx 终结 TLS 再回源到本服务的 `ws://`。

Caddyfile 示例：

```caddy
relay.example.com {
  reverse_proxy 127.0.0.1:8090
}
```

通过 systemd / pm2 / docker 保活：

```bash
npm install -g pm2
pm2 start index.js --name ccgame-fullrelay
pm2 save
```

### Docker

仓库自带 `Dockerfile` 与 `docker-compose.yml`：

```bash
# 构建并运行
docker build -t ccgame-fullrelay .
docker run --rm -p 8090:8090 ccgame-fullrelay

# 或使用 docker compose
docker compose up -d
```

容器内默认监听 `0.0.0.0:8090`，可通过 `PORT` / `HOST` 环境变量覆盖。

## 在游戏中启用

1. 打开联机弹窗，点击右上角 ⚙ "自定义中转服务器"。
2. 选择 **"完整数据中转（推荐 P2P 不通时使用）"**。
3. 在文本框里填入服务器 wss 地址（每行一条，可多个做冗余）：
   ```
   wss://relay.example.com
   ```
4. 点击「保存并应用」。
5. 同一房间的所有玩家必须配置同一个 wss 地址。

## 资源开销估算

游戏当前 SNAPSHOT 15 Hz、ENTITY_DELTA 6 Hz；4 人房间稳态约 30–80 KB/s 上行 + 同等下行（每条消息会扇出给其他 (N-1) 个 peer）。8 人满员高峰约 0.5–1 MB/s。一台 1C/512M、1 Mbps 带宽的小机器可承担 1–2 个 8 人房间。

## 协议（用于二次开发）

JSON over WebSocket，单条消息上限 96 KB。详见 [`index.js`](./index.js) 顶部注释。
