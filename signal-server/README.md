# CCGame WebRTC 信令转发服务器（ws-relay）

基于 [`@trystero-p2p/ws-relay`](https://www.npmjs.com/package/@trystero-p2p/ws-relay) 的最小信令转发服务器。**只转发 WebRTC 握手信令**，握手成功后玩家之间的游戏数据走 P2P，本服务器不承载任何游戏数据流量。

> 如果你的网络下连 P2P 都无法建立（对称 NAT / UDP 全屏蔽 / 企业内网仅放行 wss:443），请改用仓库 [`server/`](../server) 下的**完整数据中转**。

## 直接运行

需要 Node.js 18+：

```bash
cd signal-server
npm install
npm start
```

默认监听 `0.0.0.0:8080`。可通过环境变量覆盖：

```bash
PORT=9000 HOST=127.0.0.1 npm start
```

健康检查：`GET /healthz`。

协议识别：`GET /ccgame-info` 返回 `{"service":"ccgame-relay","type":"ws-relay","version":1}`。游戏前端在「联机服务器」设置中选择「自定义」并填入本服务器地址后，会自动请求该接口识别中转类型。

## Docker

构建并运行：

```bash
docker build -t ccgame-signal-relay .
docker run --rm -p 8080:8080 ccgame-signal-relay
```

或使用 docker compose：

```bash
docker compose up -d
```

## TLS

浏览器在 `https://` 页面下只能连接 `wss://`，生产环境务必走 TLS。推荐用 Caddy / Nginx 终结 TLS 再回源到本服务的 `ws://`：

```caddy
signal.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

## 在游戏中启用

1. 打开联机弹窗，点击右上角 ⚙ "自定义中转服务器"。
2. 选择 **"自定义 WebSocket 信令中转"**。
3. 在文本框里填入服务器 wss 地址：

   ```
   wss://signal.example.com
   ```

4. 点击「保存并应用」。
5. 同一房间的所有玩家必须配置同一个 wss 地址。
