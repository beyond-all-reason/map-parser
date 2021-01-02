# Spring Map Parser
Parser for SpringRTS .sd7, .smf, .smt map files

## Usage

`npm i --save spring-map-parser`

```
import { MapParser } from "spring-map-parser";
const parser = new MapParser();
const map = await parser.parseMap("dsdr_3.98");
```
