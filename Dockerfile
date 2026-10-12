# syntax=docker/dockerfile:1
FROM oven/bun:1.3.13-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.13-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:24-slim AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2500 DATABASE_URL=file:/app/data/pomodoro.db
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 2500
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "./dist/server/entry.mjs"]
