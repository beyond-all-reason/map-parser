# Spring Map Parser
Parser for SpringRTS map files

## Usage

`npm i --save spring-map-parser`

```
import { MapParser } from "spring-map-parser";

(async () => {
    const mapPath = "./working-files/maps/aberdeen3v3v3.sd7";

    const parser = new MapParser({ verbose: true, mipmapSize: 4 });

    const map = await parser.parseMap(mapPath);

    console.log(map.info.startPositions[0].x);

    await map.textureMap.toFile("texture.png");

    await map.heightMap.jpeg({ quality: 50 }).toFile("height.jpg");
})();
```
