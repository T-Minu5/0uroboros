# 0uroboros game server. Build from the repository root:
#   docker build -f deploy/Dockerfile -t ouroboros-server .
# The runtime image carries only the bundled server and its two runtime dependencies (ws, zod); no assets, no studio.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/content/package.json packages/content/
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.server.config.ts ./
COPY packages ./packages
COPY content ./content
RUN npm run server:build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 OUROBOROS_DB=/data/ouroboros.sqlite
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/node_modules/ws ./node_modules/ws
COPY --from=build /app/node_modules/zod ./node_modules/zod
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server/main.mjs"]
