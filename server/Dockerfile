# CCGame 完整数据中转服务器（ws-fullrelay）
# 构建：docker build -t ccgame-fullrelay ./server
# 运行：docker run --rm -p 8090:8090 ccgame-fullrelay
FROM node:20-alpine

WORKDIR /app

# 仅复制 manifest，利用 Docker 层缓存
COPY package.json package-lock.json* ./

# 使用 lockfile 安装生产依赖
RUN npm ci --omit=dev

# 复制源码
COPY index.js ./
COPY README.md ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8090

EXPOSE 8090

# 不以 root 运行
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 || exit 1

CMD ["node", "index.js"]
