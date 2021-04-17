# Spring Map Parser
Parser for SpringRTS map files

## Usage

`npm i --save spring-map-parser`

```ts
import { MapParser } from "spring-map-parser";

(async () => {
    const mapPath = "./working-files/maps/aberdeen3v3v3.sd7";

    const parser = new MapParser({ verbose: true, mipmapSize: 4, skipSmt: false });

    const map = await parser.parseMap(mapPath);

    console.log(map.info.startPositions[0].x);

    await map.textureMap!.writeAsync("working-files/texture.png");
    await map.heightMap!.resize(200, -1).writeAsync("working-files/height.png"); // -1 here means preserve aspect ratio
    await map.metalMap!.writeAsync("working-files/metal.png");
    await map.typeMap!.writeAsync("working-files/type.png");
    await map.miniMap!.writeAsync("working-files/mini.png");
    await map.textureMap!.scaleToFit(765, 300).quality(80).writeAsync("working-files/test.jpg");
})();
```

The different map images are [Jimp](https://www.npmjs.com/package/jimp) instances, which provides some useful image processing functionality.