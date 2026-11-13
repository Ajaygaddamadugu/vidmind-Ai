# ---------- Build stage: compile server + client ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci --prefix server --legacy-peer-deps && npm ci --prefix client --legacy-peer-deps

COPY server server
COPY client client
RUN npm run build --prefix server \
 && npm run build --prefix client \
 && npm prune --omit=dev --prefix server --legacy-peer-deps

# ---------- Runtime stage ----------
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# yt-dlp must stay current — YouTube changes often. Rebuild the image regularly (e.g. weekly).
COPY server/requirements.txt server/
RUN pip3 install --no-cache-dir --break-system-packages -U -r server/requirements.txt

COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

RUN mkdir -p server/db server/downloads && chown -R node:node server/db server/downloads

ENV NODE_ENV=production \
    PORT=8080 \
    PYTHON_BIN=python3 \
    TRUST_PROXY=true

USER node
EXPOSE 8080
# Mount a persistent volume at /app/server/db so the cache (transcripts, summaries, chats) survives redeploys.
# (No VOLUME instruction: some hosts reject it, and `docker run -v` works without it.)

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/app.js"]
