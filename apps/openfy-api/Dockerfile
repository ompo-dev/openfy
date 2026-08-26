FROM oven/bun:1.3.11-debian

WORKDIR /app

# youtube-dl-exec invokes yt-dlp through python3. This is deliberately a
# persistent Node container, not a serverless function.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["bun", "run", "start"]
