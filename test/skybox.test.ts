import fs from "fs";
import * as path from "path";

import { MapParser } from "../dist/map-parser";

const testDir = "test";
const testMapsDir = path.join(testDir, "test_maps");

beforeAll(async () => {
    await fs.promises.mkdir("test/output", { recursive: true });
});

test("skybox parsing - coast to coast", async () => {
    const mapPath = path.join(testMapsDir, "coast_to_coast_bar_v1.0.sd7");

    const parser = new MapParser({
        verbose: false,
        mipmapSize: 4,
        skipSmt: true,
        parseSkybox: true,
    });

    const map = await parser.parseMap(mapPath);

    // Check map parsed correctly
    expect(map).toBeDefined();
    expect(map.mapInfo).toBeDefined();
    expect(map.skybox).toBeDefined();

    // Check that it's a 2:1 aspect ratio (equirectangular)
    const width = map.skybox!.getWidth();
    const height = map.skybox!.getHeight();
    expect(width / height).toBe(2);

    // Save the skybox for visual inspection
    await map.skybox!.writeAsync("test/output/skybox.png");
    expect(fs.existsSync("test/output/skybox.png")).toBe(true);
}, 180000); // Increase timeout for large file processing

test("skybox disabled - coast to coast", async () => {
    const mapPath = path.join(testMapsDir, "coast_to_coast_bar_v1.0.sd7");

    const parser = new MapParser({
        verbose: false,
        mipmapSize: 4,
        skipSmt: true,
    });

    const map = await parser.parseMap(mapPath);

    // Check map parsed correctly
    expect(map).toBeDefined();
    expect(map.mapInfo).toBeDefined();
    expect(map.skybox).not.toBeDefined();
});

afterAll(async () => {
    await fs.promises.rmdir("test/output", { recursive: true });
});
