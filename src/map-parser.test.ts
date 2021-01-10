import fs  from 'fs';

import { MapParser } from "./map-parser";

it('full-export', async () => {
    // expect.assertions(3);

    const mapPath = "./test_maps/red_comet.sd7";

    const parser = new MapParser({ verbose: true, mipmapSize: 4, skipSmt: false });

    const map = await parser.parseMap(mapPath);

    await map.textureMap?.toFile("texture.png");
    expect(fs.existsSync("texture.png")).toBe(true);

    await map.heightMap.jpeg({ quality: 50 }).toFile("height.jpg");
    expect(fs.existsSync("height.jpg")).toBe(true);

    await map.miniMap.jpeg({ quality: 50 }).toFile("minimap.jpg");
    expect(fs.existsSync("minimap.jpg")).toBe(true);
});

it('minimap-export', async () => {
    // expect.assertions(1);

    const mapPath = "./test_maps/red_comet.sd7";

    const parser = new MapParser({ verbose: true, mipmapSize: 4, skipSmt: true });

    const map = await parser.parseMap(mapPath);

    await map.miniMap.jpeg({ quality: 50 }).toFile("minimap.jpg");
    expect(fs.existsSync("minimap.jpg")).toBe(true);
});