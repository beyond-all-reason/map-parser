/**
 * Reproduction script for issue #19: Crashes when parsing big maps.
 *
 * Runs the map parser under constrained memory to demonstrate OOM.
 * Three phases isolate which stage consumes the most memory:
 *   Phase 1: skipSmt (no texture parsing)
 *   Phase 2: full parse, water disabled
 *   Phase 3: full parse, defaults
 *
 * Usage:
 *   node repro/repro-crash.js <path-to-map> [phase]
 *   phase: 1 | 2 | 3 | all (default: all)
 */

const path = require("path");
const { MapParser } = require("../dist/map-parser");

function logMemory(label) {
    const mem = process.memoryUsage();
    const MB = 1024 * 1024;
    console.log(`[memory:${label}] rss=${(mem.rss / MB).toFixed(1)}MB heap=${(mem.heapUsed / MB).toFixed(1)}/${(mem.heapTotal / MB).toFixed(1)}MB external=${(mem.external / MB).toFixed(1)}MB arrayBuffers=${(mem.arrayBuffers / MB).toFixed(1)}MB`);
}

async function runPhase(phaseNum, mapPath, config) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Phase ${phaseNum}: ${JSON.stringify(config)}`);
    console.log("=".repeat(60));

    if (global.gc) global.gc();
    logMemory(`phase${phaseNum}-before`);

    const parser = new MapParser(config);

    const startTime = Date.now();
    try {
        const map = await parser.parseMap(mapPath);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Phase ${phaseNum} completed in ${elapsed}s`);
        console.log(`  fileName: ${map.fileName}`);
        console.log(`  textureMap: ${map.textureMap ? `${map.textureMap.getWidth()}x${map.textureMap.getHeight()}` : "skipped"}`);
        console.log(`  heightMap: ${map.heightMap.getWidth()}x${map.heightMap.getHeight()}`);
        logMemory(`phase${phaseNum}-after`);
    } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`Phase ${phaseNum} FAILED after ${elapsed}s: ${err.message}`);
        logMemory(`phase${phaseNum}-error`);
        throw err;
    }
}

async function main() {
    const mapPath = process.argv[2];
    const phaseArg = process.argv[3] || "all";

    if (!mapPath) {
        console.error("Usage: node repro/repro-crash.js <path-to-map> [phase]");
        console.error("  phase: 1 | 2 | 3 | all (default: all)");
        process.exit(1);
    }

    console.log(`Map: ${path.resolve(mapPath)}`);
    console.log(`Node heap limit: ${(require("v8").getHeapStatistics().heap_size_limit / 1024 / 1024).toFixed(0)}MB`);
    logMemory("startup");

    const phases = {
        1: { mipmapSize: 4, skipSmt: true, water: false, verbose: true },
        2: { mipmapSize: 4, skipSmt: false, water: false, verbose: true },
        3: { mipmapSize: 4, skipSmt: false, water: true, verbose: true },
    };

    const toRun = phaseArg === "all" ? [1, 2, 3] : [parseInt(phaseArg)];

    for (const phase of toRun) {
        if (!phases[phase]) {
            console.error(`Unknown phase: ${phase}`);
            process.exit(1);
        }
        await runPhase(phase, mapPath, phases[phase]);

        // Force GC between phases if available
        if (global.gc) global.gc();
    }

    console.log("\nAll phases completed successfully.");
}

main().catch((err) => {
    console.error("\nFATAL:", err.message);
    process.exit(1);
});
