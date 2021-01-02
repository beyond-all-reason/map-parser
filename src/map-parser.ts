import { promises as fs } from "fs";
import { glob } from "glob";
import { extractFull } from "node-7z";
import * as path from "path";
import sharp from "sharp";

import { BufferStream } from "./buffer-stream";
import { MapModel } from "./map-model";
const dxt = require("dxt-js");

// https://github.com/spring/spring/tree/develop/rts/Map

export interface MapParserConfig {
    verbose?: boolean;
}

export class MapParser {
    protected tmpDir: string = "";
    protected meta!: MapModel.Meta;

    constructor() {
        process.on("SIGINT", async () => {
            console.log("\ngracefully shutting down from SIGINT (Crtl-C)");
            if (this.tmpDir){
                await fs.rmdir(this.tmpDir, { recursive: true } );
            }
            process.exit();
        });
    }

    public async parseMap(filePath: string) : Promise<MapModel.Map> {
        let map: Partial<MapModel.Map> = {};

        try {
            const fileType = path.extname(filePath);
            if (fileType === ".sd7") {
                const archive = await this.extractSd7(filePath);
                this.meta = await this.parseSmf(await fs.readFile(archive.smf));
                const smt = await this.parseSmt(await fs.readFile(archive.smt));
            }
        } catch (err) {
            console.error(err);
        } finally {
            await fs.rmdir(this.tmpDir, { recursive: true } );

            return {} as any;
        }
    }

    protected async extractSd7(filePath: string) : Promise<{ smf: string, smt: string, mapinfo?: string }> {
        return new Promise(async resolve => {
            this.tmpDir = await fs.mkdtemp("tmp");
            const extractStream = extractFull(filePath, this.tmpDir, { recursive: true, $cherryPick: ["*.smf", "*.smt", "mapinfo.lua"] });
            extractStream.on("end", async () => {
                resolve({
                    smf: glob.sync(`${this.tmpDir}/**/*.smf`)[0],
                    smt: glob.sync(`${this.tmpDir}/**/*.smt`)[0],
                    mapinfo: glob.sync(`${this.tmpDir}/mapinfo.lua`)[0],
                });
            });
        });
    }

    protected async parseMapInfo(buffer: Buffer) : Promise<MapModel.Info> {
        const str = buffer.toString();

        // yes, all this regex is messy and expensive. no, i don't care

        const name            = str.match(/(?!t).name\s*\=\s*\"(.*?)\"/)?.[1]!;
        const shortname       = str.match(/shortname\s*\=\s*\"(.*?)\"/)?.[1]!;
        const description     = str.match(/description\s*\=\s*\"(.*?)\"/)?.[1]!;
        const author          = str.match(/author\s*\=\s*\"(.*?)\"/)?.[1]!;
        const version         = str.match(/version\s*\=\s*\"(.*?)\"/)?.[1]!;
        const mapfile         = str.match(/mapfile\s*\=\s*\"(.*?)\"/)?.[1]!;
        const modtype         = Number(str.match(/modtype\s*\=\s*(.*?)\,/)?.[1]);
        const maphardness     = Number(str.match(/maphardness\s*\=\s*(.*?)\,/)?.[1]);
        const notDeformable   = str.match(/notDeformable\s*\=\s*(.*?)\,/)?.[1] === "true";
        const gravity         = Number(str.match(/gravity\s*\=\s*(.*?)\,/)?.[1]);
        const tidalStrength   = Number(str.match(/tidalStrength\s*\=\s*(.*?)\,/)?.[1]);
        const maxMetal        = Number(str.match(/maxMetal\s*\=\s*(.*?)\,/)?.[1]);
        const extractorRadius = Number(str.match(/extractorRadius\s*\=\s*(.*?)\,/)?.[1]);
        const voidWater       = str.match(/voidWater\s*\=\s*(.*?)\,/)?.[1] === "true";
        const voidGround      = str.match(/voidGround\s*\=\s*(.*?)\,/)?.[1] === "true";
        const autoShowMetal   = str.match(/autoShowMetal\s*\=\s*(.*?)\,/)?.[1] === "true";
        const minWind         = Number(str.match(/minWind\s*\=\s*(.*?)\,/)?.[1]);
        const maxWind         = Number(str.match(/maxWind\s*\=\s*(.*?)\,/)?.[1]);

        const startPositionsGroups = str.matchAll(/\s*\[(\d)\]\s?\=\s?\{startPos\s?\=\s?\{x\s?\=\s?(\d*)\,\s?z\s?\=\s?(\d*)\}\}\,\s*/gm);
        const startPositionsArray = Array.from(startPositionsGroups).map(matches => matches.slice(1, 4).map(num => parseInt(num)));
        const startPositions: Array<{ x: number, z: number }> = [];
        for (const [teamId, x, z] of startPositionsArray) {
            startPositions[teamId] = { x, z };
        }

        return {
            name, shortname, description, author, version, mapfile, modtype, maphardness, notDeformable, gravity, tidalStrength,
            maxMetal, extractorRadius, voidWater, voidGround, autoShowMetal, minWind, maxWind, startPositions
        };
    }

    protected async parseSmf(buffer: Buffer) : Promise<MapModel.Meta> {
        let bufferStream = new BufferStream(buffer);

        const magic = bufferStream.readString(16);
        const version = bufferStream.readInt();
        const id = bufferStream.readInt(4, true);
        const mapWidth = bufferStream.readInt();
        const mapHeight = bufferStream.readInt();
        const widthUnits = mapWidth / 128;
        const heightUnits = mapHeight / 128;
        const squareSize = bufferStream.readInt();
        const texelsPerSquare = bufferStream.readInt();
        const tileSize = bufferStream.readInt();
        const minDepth = bufferStream.readFloat();
        const maxDepth = bufferStream.readFloat();
        const heightMapIndex = bufferStream.readInt();
        const typeMapIndex = bufferStream.readInt();
        const tileIndex = bufferStream.readInt();
        const miniMapIndex = bufferStream.readInt();
        const metalMapIndex = bufferStream.readInt();
        const featureMapIndex = bufferStream.readInt();
        const noOfExtraHeaders = bufferStream.readInt();

        // for (let i=0; i<noOfExtraHeaders; i++){
        //     const extraHeaderSize = bufferStream.readInt();
        //     const extraHeaderType = bufferStream.readInt();
        //     if (extraHeaderType === 1) { // grass
        //         const extraOffset = bufferStream.readInt();
        //         const grassMapLength = (widthPixels / 4) * (heightPixels / 4);
        //         const grassMap = bufferStream.read(grassMapLength);
        //     }
        // }

        // const heightMapBuffer = buffer.slice(heightMapIndex, typeMapIndex);
        // await (await this.heightMapToImage(heightMapBuffer, mapWidth, mapHeight)).toFile("out.png");
        // const relativeHeightMap = this.getRelativeHeightmap(heightMapBuffer, mapWidth, mapHeight, minDepth, maxDepth);

        // const typeMapBuffer = buffer.slice(typeMapIndex, miniMapIndex);
        // await (await this.typeMapToImage(typeMapBuffer, mapWidth, mapHeight)).toFile("out.png");

        // const minimapBuffer = buffer.slice(miniMapIndex, metalMapIndex);
        // await (await this.minimapToImage(minimapBuffer)).toFile("out.png");

        // const metalMapBuffer = buffer.slice(metalMapIndex, tileIndex);
        // await (await this.typeMapToImage(metalMapBuffer, mapWidth, mapHeight)).toFile("out.png");

        // const featuresBuffer = buffer.slice(featureMapIndex + 8);
        // const features: string[] = featuresBuffer.toString().split("\u0000").filter(Boolean);

        return { magic, version, id, mapWidth, widthUnits, mapHeight, heightUnits, squareSize, texelsPerSquare, tileSize, minDepth, maxDepth };
    }

    protected async parseSmt(buffer: Buffer, mipmapSize: 32 | 16 | 8 | 4 = 4) {
        const bufferStream = new BufferStream(buffer);

        const magic = bufferStream.readString(16);
        const version = bufferStream.readInt();
        const numOftiles = bufferStream.readInt();
        const tileSize = bufferStream.readInt();
        const compressionType = bufferStream.readInt();

        console.log(numOftiles, tileSize, compressionType);

        const startIndex = mipmapSize === 32 ? 0 : mipmapSize === 16 ? 512 : mipmapSize === 8 ? 640 : 672;
        const dxt1Size = Math.pow(mipmapSize, 2) / 2;

        await fs.mkdir("tiles", { recursive: true });

        for (let smuX=0; smuX<this.meta.widthUnits; smuX++) {
            for (let smuY=0; smuY<this.meta.heightUnits; smuY++) {
                let tile: Buffer[][] = [];
                for (let x=0; x<tileSize; x++) {
                    const col: Buffer[][] = [];
                    for (let y=0; y<tileSize; y++) {
                        const mipmap = bufferStream.read(680);
                        const dxt1 = mipmap.slice(startIndex, startIndex + dxt1Size);
                        const rgbaArray: Uint8Array = dxt.decompress(dxt1, mipmapSize, mipmapSize, dxt.flags.DXT1);
                        const rgbaBuffer = Buffer.from(rgbaArray);
                        let pixels = this.rgbaBufferToPixels(rgbaBuffer, mipmapSize);
                        if (this.isTileEmpty(pixels)) {
                            console.log("Empty tile detected, ignoring");
                            y -= 1;
                            continue;
                        }
                        col.push(...pixels);
                    }
                    tile = this.mergeRight(tile, col);
                }
                const rawData = tile.flat(2);
                await this.generateImage(rawData, tileSize * mipmapSize, tileSize * mipmapSize, `tiles/${smuX}_${smuY}.png`);
            }
        }

        await this.stitchFinalMapTexture(mipmapSize, "tiles", "texture.png");
    }

    protected rgbaBufferToPixels(buffer: Buffer, mipmapSize: 32 | 16 | 8 | 4) : Buffer[][] {
        const bufferStream = new BufferStream(buffer);
        const pixels: Buffer[][] = [];
        for (let y=0; y<mipmapSize; y++) {
            const row: Buffer[] = [];
            for (let x=0; x<mipmapSize; x++) {
                row.push(bufferStream.read(4));
            }
            pixels.push(row);
        }
        return pixels;
    }

    protected async generateImage(pixels: Buffer[], width: number, height: number, fileName = "out.png") {
        return sharp(Buffer.concat(pixels), { raw: { width, height, channels: 4 } }).toFile(fileName);
    }

    protected mergeRight<T>(a: T[][], b: T[][]) : T[][] {
        const out: T[][] = [];
        for (let row=0; row<b.length; row++) {
            if (a[row]) {
                out.push(a[row].concat(b[row]));
            } else {
                out.push(b[row]);
            }
        }
        return out;
    }

    protected isTileEmpty(pixels: Buffer[][]) : boolean {
        for (let row of pixels) {
            for (let pixel of row) {
                const pixelIsBlack = pixel[0] === 0x00 && pixel[1] === 0x00 && pixel[2] === 0x00 && pixel[3] === 0xFF;
                if (!pixelIsBlack) {
                    return false;
                }
            }
        }

        return true;
    }

    protected async stitchFinalMapTexture(mipmapSize: 32 | 16 | 8 | 4, tilesDir: string, outPath: string) {
        let files: Array<{ x: number; y: number }> = [];
        for (let x=0; x<this.meta.widthUnits; x++) {
            for (let y=0; y<this.meta.heightUnits; y++) {
                files.push({ x, y });
            }
        }

        return await sharp({
            create: {
                width: (mipmapSize * 32) * this.meta.widthUnits,
                height: (mipmapSize * 32) * this.meta.heightUnits,
                background: { r: 0, g: 0, b: 0, alpha: 255 },
                channels: 4
            },
        }).composite(files.map(file => {
            return {
                input: `${tilesDir}/${file.x}_${file.y}.png`,
                raw: { width: (mipmapSize * 32), height: (mipmapSize * 32), channels: 4 as 4 },
                top: file.y * (mipmapSize * 32),
                left: file.x * (mipmapSize * 32)
            };
        })).toFile(outPath);
    }

    protected getRelativeHeightmap(heightMapBuffer: Buffer, mapWidth: number, mapHeight: number, minDepth: number, maxDepth: number) : number[][] {
        const bufferStream = new BufferStream(heightMapBuffer);
        const heightUnit = (maxDepth - minDepth) / 65536;
        const heights: number[][] = [];
        for (let y=0; y<mapHeight+1; y++) {
            const row: number[] = [];
            for (let x=0; x<mapWidth+1; x++){
                const rawHeight = bufferStream.readInt(2, true);
                const height = Math.round(((heightUnit * rawHeight) + minDepth));
                row.push(height);
            }
            heights.push(row);
        }
        
        return heights;
    }

    protected async heightMapToImage(heightMapBuffer: Buffer, mapWidth: number, mapHeight: number) {
        const ints = new BufferStream(heightMapBuffer).readInts(heightMapBuffer.length / 2, 2, true);
        const test = ints.map(int => { return (int / 65536) * 255 });

        return await sharp(Buffer.from(test), {
            raw: { width: mapWidth + 1, height: mapHeight + 1, channels: 1 },
        });
    }

    protected async typeMapToImage(typeMapBuffer: Buffer, mapWidth: number, mapHeight: number) {
        return await sharp(typeMapBuffer, {
            raw: { width: mapWidth / 2, height: mapHeight / 2, channels: 1 }
        });
    }

    protected async minimapToImage(miniMapBuffer: Buffer) {
        const rgbaArray: Uint8Array = dxt.decompress(miniMapBuffer, 1024, 1024, dxt.flags.DXT1);
        const rgbaBuffer = Buffer.from(rgbaArray);

        return await sharp(rgbaBuffer, {
            raw: { width: 1024, height: 1024, channels: 4 }
        });
    }

    protected async metalMapToImage(metalMapBuffer: Buffer, mapWidth: number, mapHeight: number) {
        return await sharp(metalMapBuffer, {
            raw: { width: mapWidth / 2, height: mapHeight / 2, channels: 1 }
        });
    }
}