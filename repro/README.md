# Reproduction: Issue #19 — Crashes when parsing big maps

## Quick Start

### 1. Build the Docker image

```bash
docker build -t bar-map-repro -f repro/Dockerfile .
```

### 2. Run with memory constraints

Mount your test maps directory and specify a large map:

```bash
# 512MB — simulates constrained hardware
docker run --rm --memory=512m \
  -v "$(pwd)/test/test_maps:/maps" \
  bar-map-repro node --expose-gc repro/repro-crash.js /maps/proving_grounds_v1.0.sd7 all

# 256MB — stress test
docker run --rm --memory=256m \
  -v "$(pwd)/test/test_maps:/maps" \
  bar-map-repro node --expose-gc repro/repro-crash.js /maps/proving_grounds_v1.0.sd7 all
```

### 3. Run individual phases

Phases isolate memory consumption by feature:

| Phase | Config | What it tests |
|-------|--------|---------------|
| 1 | `skipSmt: true` | Archive extraction + SMF parsing only |
| 2 | `skipSmt: false, water: false` | Adds full SMT texture parsing |
| 3 | `skipSmt: false, water: true` | Full parse including water overlay clone |

```bash
# Run only phase 2 (texture parsing — the suspected worst offender)
docker run --rm --memory=512m \
  -v "$(pwd)/test/test_maps:/maps" \
  bar-map-repro node --expose-gc repro/repro-crash.js /maps/proving_grounds_v1.0.sd7 2
```

### 4. With a Node heap limit (diagnostic)

```bash
docker run --rm --memory=512m \
  -v "$(pwd)/test/test_maps:/maps" \
  bar-map-repro node --expose-gc --max-old-space-size=320 repro/repro-crash.js /maps/proving_grounds_v1.0.sd7 all
```

## Downloading large maps from BAR

```bash
# Mediterraneum (~300MB, the map referenced in the issue)
curl -L -o test/test_maps/mediterraneum_v1.sd7 \
  "https://files-cdn.beyondallreason.dev/file/9b864770a443048395263e304de64ec2/mediterraneum_v1.sd7"
```
