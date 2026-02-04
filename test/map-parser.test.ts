import fs from "fs";
import * as path from "path";

import { MapParser } from "../dist/map-parser";

const testDir = "test";
const testMapsDir = path.join(testDir, "test_maps");

beforeAll(async () => {
    await fs.promises.mkdir("test/output", { recursive: true });
});

test("everything", async () => {
    const mapPath = path.join(testMapsDir, "coast_to_coast_bar_v1.0.sd7");

    const parser = new MapParser({
        verbose: false,
        mipmapSize: 4,
        skipSmt: false,
        parseResources: true
    });

    const map = await parser.parseMap(mapPath);

    expect(map.mapInfo?.gravity).toBe(120);

    await map.textureMap?.writeAsync("test/output/texture.png");
    expect(fs.existsSync("test/output/texture.png")).toBe(true);

    await map.heightMap.quality(50).writeAsync("test/output/height.jpg");
    expect(fs.existsSync("test/output/height.jpg")).toBe(true);

    await map.metalMap.quality(50).writeAsync("test/output/metal.jpg");
    expect(fs.existsSync("test/output/metal.jpg")).toBe(true);

    await map.typeMap.quality(50).writeAsync("test/output/type.jpg");
    expect(fs.existsSync("test/output/type.jpg")).toBe(true);

    await map.miniMap.quality(50).writeAsync("test/output/mini.jpg");
    expect(fs.existsSync("test/output/mini.jpg")).toBe(true);

    await map.resources!.specularTex?.writeAsync("test/output/specularTex.png");
    expect(fs.existsSync("test/output/specularTex.png")).toBe(true);

    await map.resources!.splatDetailNormalTex1?.writeAsync("test/output/splatDetailNormalTex1.png");
    expect(fs.existsSync("test/output/splatDetailNormalTex1.png")).toBe(true);
}, 60000);

test("sdz", async () => {
    const parser = new MapParser({ mipmapSize: 4, skipSmt: true });

    const mapPath = path.join(testMapsDir, "tropical-v2.sdz");

    const map = await parser.parseMap(mapPath);

    expect(true);
}, 60000);

// afterAll(async () => {
//     await fs.promises.rmdir("test/output", { recursive: true });
// });
