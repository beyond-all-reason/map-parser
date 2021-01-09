import { promises as fs, existsSync } from "fs";
import { glob } from "glob";
import { Merge } from "jaz-ts-utils";
import { extractFull } from "node-7z";
import * as os from "os";
import * as path from "path";
import sharp, { Sharp } from "sharp";

import { BufferStream } from "./buffer-stream";
import { MapModel } from "./map-model";
const dxt = require("dxt-js");

// https://github.com/spring/spring/tree/develop/rts/Map
// https://springrts.com/wiki/Mapdev:mapinfo.lua
// https://springrts.com/wiki/Mapdev:SMF_format
// https://springrts.com/wiki/Mapdev:SMT_format

export interface MapParserConfig {
    verbose: boolean;
    /**
     * Resolution of tile mipmaps. Can be 4, 8, 16 or 32. Each higher mipmap level doubles the final output resolution, and also resource usage.
     * @default 4
     * */
    mipmapSize: 4 | 8 | 16 | 32;
    /**
     * If you don't want textureMap, set this to true to speed up parsing.
     * @default false
     */
    skipSmt: boolean;
}

const mapParserDefaultConfig: Partial<MapParserConfig> = {
    verbose: false,
    mipmapSize: 4,
    skipSmt: false
};

export class MapParser {
    protected config: MapParserConfig;

    constructor(config?: Partial<MapParserConfig>) {
        this.config = Object.assign({}, mapParserDefaultConfig as Required<MapParserConfig>, config);
    }

    public async parseMap(mapFilePath: string) : Promise<MapModel.Map> {
        const filePath = path.parse(mapFilePath);
        const fileName = filePath .name;
        const fileExt = filePath.ext;
        const tempDir = path.join(os.tmpdir(), fileName);

        process.on("SIGINT", async () => this.sigint(tempDir));

        try {
            if (fileExt !== ".sd7") {
                throw new Error(`${fileExt} extension not yet supported, .sd7 only for now, sorry!`);
            }

            const archive = await this.extractSd7(mapFilePath, tempDir);

            let info: Merge<MapModel.MapInfo, MapModel.SMD>;
            if (archive.mapInfo) {
                info = await this.parseMapInfo(archive.mapInfo);
            } else {
                info = await this.parseSMD(archive.smd!);
            }

            const smf = await this.parseSMF(archive.smf);

            let smt: Sharp | undefined;
            if (!this.config.skipSmt){
                smt = await this.parseSMT(archive.smt, smf.tileIndexMap, smf.mapWidthUnits, smf.mapHeightUnits, this.config.mipmapSize);
            }

            let scriptName = "";
            if (info.name && info.version === "1") {
                scriptName = info.name;
            } else if (info.name) {
                scriptName = `${info.name} ${info.version}`;
            } else if (archive.smdName) {
                scriptName = archive.smdName;
            }

            this.cleanup(tempDir);

            return {
                fileName,
                scriptName,
                info,
                meta: smf,
                heightMap: smf.heightMap,
                metalMap: smf.metalMap,
                miniMap: smf.miniMap,
                typeMap: smf.typeMap,
                textureMap: smt
            };
        } catch (err: any) {
            this.cleanup(tempDir);
            throw err;
        }
    }

    protected async extractSd7(sd7Path: string, outPath: string): Promise<{ smf: Buffer, smt: Buffer, smd?: Buffer, smdName?: string, mapInfo?: Buffer }> {
        return new Promise(async resolve => {
            if (this.config.verbose) {
                console.log(`Extracting .sd7 to ${outPath}`);
            }

            if (!existsSync(sd7Path)) {
                throw new Error(`File not found: ${sd7Path}`);
            }

            await fs.mkdir(outPath, { recursive: true });

            const extractStream = extractFull(sd7Path, outPath, { recursive: true, $cherryPick: ["*.smf", "*.smd", "*.smt", "mapinfo.lua"] });

            extractStream.on("end", async () => {
                const smfPath = glob.sync(`${outPath}/**/*.smf`)[0];
                const smtPath = glob.sync(`${outPath}/**/*.smt`)[0];
                const smdPath = glob.sync(`${outPath}/**/*.smd`)[0];
                const mapInfoPath = glob.sync(`${outPath}/mapinfo.lua`)[0];

                const smf = await fs.readFile(smfPath);
                const smt = await fs.readFile(smtPath);
                const smd = smdPath ? await fs.readFile(smdPath) : undefined;
                const smdName = smdPath ? path.parse(smdPath).name : undefined;
                const mapInfo = mapInfoPath ? await fs.readFile(mapInfoPath) : undefined;

                resolve({ smf, smt, smd, smdName, mapInfo });
            });
        });
    }

    protected async parseSMF(smfBuffer: Buffer): Promise<MapModel.SMF> {
        if (this.config.verbose) {
            console.log("Parsing .smf");
        }

        const bufferStream = new BufferStream(smfBuffer);

        const magic = bufferStream.readString(16);
        const version = bufferStream.readInt();
        const id = bufferStream.readInt(4, true);
        const mapWidth = bufferStream.readInt();
        const mapHeight = bufferStream.readInt();
        const mapWidthUnits = mapWidth / 128;
        const mapHeightUnits = mapHeight / 128;
        const squareSize = bufferStream.readInt();
        const texelsPerSquare = bufferStream.readInt();
        const tileSize = bufferStream.readInt();
        const minDepth = bufferStream.readFloat();
        const maxDepth = bufferStream.readFloat();
        const heightMapIndex = bufferStream.readInt();
        const typeMapIndex = bufferStream.readInt();
        const tileIndexMapIndex = bufferStream.readInt();
        const miniMapIndex = bufferStream.readInt();
        const metalMapIndex = bufferStream.readInt();
        const featureMapIndex = bufferStream.readInt();
        const noOfExtraHeaders = bufferStream.readInt();
        const extraHeaders = bufferStream.read(heightMapIndex - bufferStream.getPosition());

        // TODO
        // for (let i=0; i<noOfExtraHeaders; i++){
        //     const extraHeaderSize = bufferStream.readInt();
        //     const extraHeaderType = bufferStream.readInt();
        //     if (extraHeaderType === 1) { // grass
        //         const extraOffset = bufferStream.readInt();
        //         const grassMapLength = (widthPixels / 4) * (heightPixels / 4);
        //         const grassMap = bufferStream.read(grassMapLength);
        //     }
        // }

        bufferStream.destroy();

        const heightMapSize = (mapWidth+1) * (mapHeight+1);
        const heightMapBuffer = smfBuffer.slice(heightMapIndex, heightMapIndex + heightMapSize * 2);
        const heightMapValues = new BufferStream(heightMapBuffer).readInts(heightMapSize, 2, true);
        const heightMapColors = heightMapValues.map(val => {
            return (val / 65536) * 255;
        });
        const heightMap = sharp(Buffer.from(heightMapColors), {
            raw: { width: mapWidth + 1, height: mapHeight + 1, channels: 1 },
        });

        const typeMapSize = (mapWidth/2) * (mapHeight/2);
        const typeMapBuffer = smfBuffer.slice(typeMapIndex, typeMapIndex + typeMapSize);
        const typeMap = sharp(typeMapBuffer, {
            raw: { width: mapWidth / 2, height: mapHeight / 2, channels: 1 }
        });

        const miniMapSize = 699048;
        const miniMapBuffer = smfBuffer.slice(miniMapIndex, miniMapIndex + miniMapSize);
        const miniMapRgbas: Uint8Array = dxt.decompress(miniMapBuffer, 1024, 1024, dxt.flags.DXT1);
        const miniMapRgbaBuffer = Buffer.from(miniMapRgbas);
        const miniMap = sharp(miniMapRgbaBuffer, {
            raw: { width: 1024, height: 1024, channels: 4 }
        });

        const metalMapSize = (mapWidth/2) * (mapHeight/2);
        const metalMapBuffer = smfBuffer.slice(metalMapIndex, metalMapIndex + metalMapSize);
        const metalMap = sharp(metalMapBuffer, {
            raw: { width: mapWidth / 2, height: mapHeight / 2, channels: 1 }
        });

        const tileIndexMapBufferStream = new BufferStream(smfBuffer.slice(tileIndexMapIndex));
        const numOfTileFiles = tileIndexMapBufferStream.readInt();
        const numOfTilesInAllFiles = tileIndexMapBufferStream.readInt();
        const numOfTilesInThisFile = tileIndexMapBufferStream.readInt();
        const smtFileName = tileIndexMapBufferStream.readUntilNull().toString();
        const tileIndexMapSize = (mapWidth / 4) * (mapHeight / 4);
        const tileIndexMap = tileIndexMapBufferStream.readInts(tileIndexMapSize);
        tileIndexMapBufferStream.destroy();

        // TODO
        // const featuresBuffer = buffer.slice(featureMapIndex + 8);
        // const features: string[] = featuresBuffer.toString().split("\u0000").filter(Boolean);

        return {
            magic, version, id, mapWidth, mapWidthUnits, mapHeight, mapHeightUnits, squareSize, texelsPerSquare, tileSize, minDepth, maxDepth,
            heightMapIndex, typeMapIndex, tileIndexMapIndex, miniMapIndex, metalMapIndex, featureMapIndex, noOfExtraHeaders, extraHeaders: [],
            numOfTileFiles, numOfTilesInAllFiles, numOfTilesInThisFile, smtFileName,
            heightMap, typeMap, miniMap, metalMap, tileIndexMap,
            features: [] // TODO
        };
    }

    protected async parseSMT(smtBuffer: Buffer, tileIndexes: number[], mapWidthUnits: number, mapHeightUnits: number, mipmapSize: 4 | 8 | 16 | 32) : Promise<Sharp> {
        if (this.config.verbose) {
            console.log(`Parsing .smt at mipmap size ${mipmapSize}`);
        }

        const bufferStream = new BufferStream(smtBuffer);

        const magic = bufferStream.readString(16);
        const version = bufferStream.readInt();
        const numOfTiles = bufferStream.readInt();
        const tileSize = bufferStream.readInt();
        const compressionType = bufferStream.readInt();

        const startIndex = mipmapSize === 32 ? 0 : mipmapSize === 16 ? 512 : mipmapSize === 8 ? 640 : 672;
        const dxt1Size = Math.pow(mipmapSize, 2) / 2;
        const rowLength = mipmapSize * 4;

        const refTiles: Buffer[][] = [];
        for (let i=0; i<numOfTiles; i++) {
            const dxt1 = bufferStream.read(680).slice(startIndex, startIndex + dxt1Size);
            const refTileRGBA: Uint8Array = dxt.decompress(dxt1, mipmapSize, mipmapSize, dxt.flags.DXT1);
            const refTileRGBABuffer = Buffer.from(refTileRGBA);
            const refTile: Buffer[] = [];
            for (let k=0; k<mipmapSize; k++) {
                const pixelIndex = k * rowLength;
                const refTileRow = refTileRGBABuffer.slice(pixelIndex, pixelIndex + rowLength);
                refTile.push(refTileRow);
            }
            refTiles.push(refTile);
        }

        const tiles: Buffer[][] = [];
        for (let i=0; i<tileIndexes.length; i++) {
            const refTileIndex = tileIndexes[i];
            const tile = this.cloneTile(refTiles[refTileIndex]);
            tiles.push(tile);
        }

        const tileStrips: Buffer[] = [];
        for (let y=0; y<mapHeightUnits * 32; y++) {
            const tileStrip: Buffer[][] = [];
            for (let x=0; x<mapWidthUnits * 32; x++) {
                const tile = tiles.shift()!;
                tileStrip.push(tile);
            }
            const textureStrip = this.joinTilesHorizontally(tileStrip, mipmapSize);
            tileStrips.push(textureStrip);
        }

        return sharp(Buffer.concat(tileStrips), { raw: { width: mipmapSize * mapWidthUnits * 32, height: mipmapSize * mapHeightUnits * 32, channels: 4 } });
    }

    protected async parseMapInfo(buffer: Buffer): Promise<MapModel.MapInfo> {
        if (this.config.verbose) {
            console.log("Parsing mapinfo.lua");
        }

        const str = buffer.toString();

        // yes, all this regex is messy and expensive. no, i don't care

        const name = str.match(/(?!t).name\s*\=\s*\"(.*?)\"/i)?.[1]!;
        const shortname = str.match(/shortname\s*\=\s*\"(.*?)\"/i)?.[1]!;
        const description = str.match(/description\s*\=\s*\"(.*?)\"/i)?.[1]!;
        const author = str.match(/author\s*\=\s*\"(.*?)\"/i)?.[1]!;
        const version = str.match(/version\s*\=\s*\"(.*?)\"/i)?.[1]!;
        const mapfile = str.match(/mapfile\s*\=\s*\"(.*?)\"/i)?.[1]!;
        const modtype = Number(str.match(/modtype\s*\=\s*(.*?)\,/i)?.[1]);
        const mapHardness = Number(str.match(/maphardness\s*\=\s*(.*?)\,/i)?.[1]);
        const notDeformable = str.match(/notDeformable\s*\=\s*(.*?)\,/i)?.[1] === "true";
        const gravity = Number(str.match(/gravity\s*\=\s*(.*?)\,/i)?.[1]);
        const tidalStrength = Number(str.match(/tidalStrength\s*\=\s*(.*?)\,/i)?.[1]);
        const maxMetal = Number(str.match(/maxMetal\s*\=\s*(.*?)\,/i)?.[1]);
        const extractorRadius = Number(str.match(/extractorRadius\s*\=\s*(.*?)\,/i)?.[1]);
        const voidWater = str.match(/voidWater\s*\=\s*(.*?)\,/i)?.[1] === "true";
        const voidGround = str.match(/voidGround\s*\=\s*(.*?)\,/i)?.[1] === "true";
        const autoShowMetal = str.match(/autoShowMetal\s*\=\s*(.*?)\,/i)?.[1] === "true";
        const minWind = Number(str.match(/minWind\s*\=\s*(.*?)\,/i)?.[1]);
        const maxWind = Number(str.match(/maxWind\s*\=\s*(.*?)\,/i)?.[1]);

        const startPositionsGroups = str.matchAll(/\s*\[(\d)\]\s?\=\s?\{startPos\s?\=\s?\{x\s?\=\s?(\d*)\,\s?z\s?\=\s?(\d*)\}\}\,\s*/gm);
        const startPositionsArray = Array.from(startPositionsGroups).map(matches => matches.slice(1, 4).map(num => parseInt(num)));
        const startPositions: Array<{ x: number, z: number }> = [];
        for (const [teamId, x, z] of startPositionsArray) {
            startPositions[teamId] = { x, z };
        }

        return {
            name, shortname, description, author, version, mapfile, modtype, mapHardness, notDeformable, gravity, tidalStrength,
            maxMetal, extractorRadius, voidWater, voidGround, autoShowMetal, minWind, maxWind, startPositions
        };
    }

    protected async parseSMD(buffer: Buffer) : Promise<MapModel.SMD> {
        if (this.config.verbose) {
            console.log("Parsing .smd");
        }

        const smd = buffer.toString();

        const strPairs = smd.match(/(\w*)\=(.*?)\;/gm)!;
        const strObj: { [key: string]: string } = {};
        const startPositions: Array<{ x: number, z: number }> = [];

        for (const strPair of strPairs) {
            const [key, val] = strPair.slice(0, strPair.length - 1).split("=");
            if (key === "StartPosX") {
                startPositions.push({ x: Number(val), z: 0 });
            } else if (key === "StartPosZ") {
                startPositions[startPositions.length - 1].z = Number(val);
            } else {
                strObj[key] = val;
            }
        }

        return {
            description: strObj.Description,
            tidalStrength: Number(strObj.TidalStrength),
            gravity: Number(strObj.Gravity),
            maxMetal: Number(strObj.MaxMetal),
            extractorRadius: Number(strObj.ExtractorRadius),
            mapHardness: Number(strObj.MapHardness),
            minWind: Number(strObj.MinWind),
            maxWind: Number(strObj.MaxWind),
            startPositions
        };
    }

    protected cloneTile(tile: Buffer[]) : Buffer[] {
        const clone: Buffer[] = [];
        for (const row of tile) {
            clone.push(Buffer.from(row));
        }
        return clone;
    }

    protected joinTilesHorizontally(tiles: Buffer[][], mipmapSize: 4 | 8 | 16 | 32) : Buffer {
        const tileRows: Buffer[] = [];
        for (let y=0; y<mipmapSize; y++) {
            for (let x=0; x<tiles.length; x++) {
                const row = tiles[x].shift()!;
                tileRows.push(row);
            }
        }

        return Buffer.concat(tileRows);
    }

    protected async cleanup(tmpDir: string) {
        if (this.config.verbose) {
            console.log(`Cleaning up temp dir: ${tmpDir}`);
        }

        await fs.rmdir(tmpDir, { recursive: true });
    }

    protected async sigint(tmpDir: string) {
        if (this.config.verbose) {
            console.log("\nGracefully shutting down from SIGINT (Crtl-C)");
        }
        await this.cleanup(tmpDir);
        process.exit();
    }
}