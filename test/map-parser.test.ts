import fs from "fs";
import * as path from "path";

import { MapParser } from "../src/map-parser";

const testDir = "test";
const testMapsDir = path.join(testDir, "test_maps");

it("full-export", async () => {
    // expect.assertions(3);

    const mapPath = path.join(testMapsDir, "red_comet.sd7");

    const parser = new MapParser({ verbose: true, mipmapSize: 4, skipSmt: false });

    const map = await parser.parseMap(mapPath);

    await map.textureMap?.toFile("test/texture.png");
    expect(fs.existsSync("test/texture.png")).toBe(true);

    await map.heightMap.jpeg({ quality: 50 }).toFile("test/height.jpg");
    expect(fs.existsSync("test/height.jpg")).toBe(true);

    await map.metalMap.jpeg({ quality: 50 }).toFile("test/metal.jpg");
    expect(fs.existsSync("test/metal.jpg")).toBe(true);

    await map.typeMap.jpeg({ quality: 50 }).toFile("test/type.jpg");
    expect(fs.existsSync("test/type.jpg")).toBe(true);

    await map.miniMap.jpeg({ quality: 50 }).toFile("test/mini.jpg");
    expect(fs.existsSync("test/mini.jpg")).toBe(true);
});

it("minimap-export", async () => {
    // expect.assertions(1);

    const mapPath = path.join(testMapsDir, "red_comet.sd7");

    const parser = new MapParser({ verbose: true, mipmapSize: 4, skipSmt: true });

    const map = await parser.parseMap(mapPath);

    await map.miniMap.jpeg({ quality: 50 }).toFile("test/mini.jpg");
    expect(fs.existsSync("test/mini.jpg")).toBe(true);
});