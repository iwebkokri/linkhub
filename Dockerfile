# Build:  docker build -t linkhub .
# Run:    see docker-compose.yml
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /app/server
# Only needed if a prebuilt better-sqlite3 binary isn't available for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=4000 HOST=0.0.0.0
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server ./
COPY --from=client /app/client/dist /app/client/dist
# The database and uploaded images live in /data - mount a volume there.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]
