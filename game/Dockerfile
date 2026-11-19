# syntax=docker/dockerfile:1
# Образ игры: API + собранный клиент. Контекст сборки — корень репозитория
# (нужен пакет игрока); в образ попадают только собранные starting.json (для клиента) и
# server.json (правила и закрытые материалы — их читает только сервер, клиенту не отдаются);
# сам пакет игрока, gm/ и locked/ — нет (P-10).

FROM node:26.13.0-slim AS build
RUN npm install -g pnpm@12.18.0
WORKDIR /app/game
COPY game/package.json game/pnpm-lock.yaml game/pnpm-workspace.yaml ./
COPY game/packages/shared/package.json packages/shared/
COPY game/packages/content/package.json packages/content/
COPY game/packages/engine/package.json packages/engine/
COPY game/packages/api/package.json packages/api/
COPY game/packages/game-web/package.json packages/game-web/
RUN pnpm install --frozen-lockfile
COPY game/ ./
COPY playtest/packs/v3.4-2026-11-18/player /app/playtest/packs/v3.4-2026-11-18/player
COPY playtest/packs/v3.4-2026-11-18/locked /app/playtest/packs/v3.4-2026-11-18/locked
COPY playtest/packs/v3.4-2026-11-18/gm/access.json /app/playtest/packs/v3.4-2026-11-18/gm/access.json
# Ответы формы заключения (A-270) — только в серверный контент, в браузер не попадают.
COPY playtest/packs/v3.4-2026-11-18/gm/verdict.json /app/playtest/packs/v3.4-2026-11-18/gm/verdict.json
RUN pnpm content:build && pnpm -F @bunker/game-web build

FROM node:26.13.0-slim
ENV NODE_ENV=production \
    API_PORT=8787 \
    CONTENT_FILE=packages/content/dist/starting.json \
    SERVER_CONTENT_FILE=packages/content/dist/server.json \
    WEB_DIST=packages/game-web/dist
COPY --from=build /app/game /app/game
USER node
EXPOSE 8787
WORKDIR /app/game/packages/api
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
