# syntax=docker/dockerfile:1
# Образ игры: API + собранный клиент. Контекст сборки — корень репозитория
# (нужен пакет игрока); в образ попадает только собранный starting.json,
# сам пакет игрока и тем более gm/ и locked/ — нет (P-10).

FROM node:26.13.0-slim AS build
RUN npm install -g pnpm@12.18.0
WORKDIR /app/game
COPY game/package.json game/pnpm-lock.yaml game/pnpm-workspace.yaml ./
COPY game/packages/shared/package.json packages/shared/
COPY game/packages/content/package.json packages/content/
COPY game/packages/api/package.json packages/api/
COPY game/packages/game-web/package.json packages/game-web/
RUN pnpm install --frozen-lockfile
COPY game/ ./
COPY playtest/packs/v3.3-2026-10-29/player /app/playtest/packs/v3.3-2026-10-29/player
RUN pnpm content:build && pnpm -F @bunker/game-web build

FROM node:26.13.0-slim
ENV NODE_ENV=production \
    API_PORT=8787 \
    CONTENT_FILE=packages/content/dist/starting.json \
    WEB_DIST=packages/game-web/dist
COPY --from=build /app/game /app/game
USER node
EXPOSE 8787
WORKDIR /app/game/packages/api
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
