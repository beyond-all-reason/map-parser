FROM node:18-slim

# 7zip needs p7zip-full on Debian
RUN apt-get update && apt-get install -y --no-install-recommends p7zip-full && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy bundled 7zip binary path fix — 7zip-bin ships its own, which works on slim
COPY . .
RUN npm run build

# Map files are mounted at runtime: -v /path/to/maps:/maps
# Usage:
#   docker build -t bar-map-repro -f repro/Dockerfile .
#   docker run --memory=512m -v /path/to/test_maps:/maps bar-map-repro node --expose-gc repro/repro-crash.js /maps/proving_grounds_v1.0.sd7 all
ENTRYPOINT ["node", "--expose-gc"]
CMD ["repro/repro-crash.js"]
