import fs from "fs";
import * as path from "path";

import { MapParser } from "../dist/map-parser";

const testDir = "test";
const testMapsDir = path.join(testDir, "test_maps");

it("full-export", async () => {
    const mapPath = path.join(testMapsDir, "red_comet.sd7");

    const parser = new MapParser({ verbose: false, mipmapSize: 4, skipSmt: false });

    const map = await parser.parseMap(mapPath);

    await map.textureMap?.writeAsync("test/texture.png");
    expect(fs.existsSync("test/texture.png")).toBe(true);

    await map.heightMap.quality(50).writeAsync("test/height.jpg");
    expect(fs.existsSync("test/height.jpg")).toBe(true);

    await map.metalMap.quality(50).writeAsync("test/metal.jpg");
    expect(fs.existsSync("test/metal.jpg")).toBe(true);

    await map.typeMap.quality(50).writeAsync("test/type.jpg");
    expect(fs.existsSync("test/type.jpg")).toBe(true);

    await map.miniMap.quality(50).writeAsync("test/mini.jpg");
    expect(fs.existsSync("test/mini.jpg")).toBe(true);

    // await map.specularMap.writeAsync("test/specular.png");
    // expect(fs.existsSync("test/specular.png")).toBe(true);
}, 20000);

it("minimap-export", async () => {
    const mapPath = path.join(testMapsDir, "red_comet.sd7");

    const parser = new MapParser({ mipmapSize: 4, skipSmt: true });

    const map = await parser.parseMap(mapPath);

    await map.miniMap.quality(50).writeAsync("test/mini.jpg");
    expect(fs.existsSync("test/mini.jpg")).toBe(true);
}, 20000);

it("map-info", async () => {
    const parser = new MapParser({ mipmapSize: 4, skipSmt: true });

    const mapPath = path.join(testMapsDir, "barren_2.sd7");

    const map = await parser.parseMap(mapPath);

    expect(map.mapInfo?.extractorRadius).toBe(100);
});

it("sdz", async () => {
    const parser = new MapParser({ mipmapSize: 4, skipSmt: true });

    const mapPath = path.join(testMapsDir, "tropical-v2.sdz");

    const map = await parser.parseMap(mapPath);
});