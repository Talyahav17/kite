# Kite runs as a single container: the API also serves the built client, so
# there is no second service, no CORS, and the session cookie stays same-origin.
#
# Node 22+ is required — the app uses node:sqlite, which does not exist earlier.

# ---- build the client ----
FROM node:22-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- runtime ----
FROM node:22-slim
ENV NODE_ENV=production

# sqlite3 is the CLI the backup job shells out to for an online .backup
RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server

COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist

# Durable state lives on the mounted volume, never in the image
ENV KITE_DATA_DIR=/data
ENV PORT=8080
EXPOSE 8080

# The platform health check hits /healthz, which also verifies the database
CMD ["node", "server/index.js"]
