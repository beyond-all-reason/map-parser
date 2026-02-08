import { once } from "node:events";

import sevenBin from "7zip-bin";
import { existsSync, promises as fs } from "fs";
import { glob } from "glob";
import type { DeepPartial } from "jaz-ts-utils";
import Jimp from "jimp";
import * as luaparse from "luaparse";
import { LocalStatement, TableConstructorExpression } from "luaparse";
import { extractFull } from "node-7z";
import StreamZip from "node-stream-zip";
import * as os from "os";
import * as path from "path";

import { BufferStream } from "./buffer-stream";
import { defaultWaterOptions, MapInfo, SMD, SMF, SpringMap, WaterOptions } from "./map-model";
import { parseDxt } from "./parse-dxt";

/* eslint-disable @typescript-eslint/no-require-imports */
const TGA = require("tga");
const parseDDS = require("./utex.dds");
/* eslint-enable @typescript-eslint/no-require-imports */

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
    /**
     * Path to the 7za executable. Will automatically resolve if left unspecified.
     * @default sevenBin.path7za
     */
    path7za: string
    /**
     * Retroactively draw water on top of map texture based on the map's depth
     * @default true
     */
    water: boolean;
    /**
     * Parse resource image files from mapinfo->resources
     * @default false
     */
    parseResources: boolean;
    /**
     * List of specific resources to parse when parseResources: true
     * @default undefined
     */
    resources?: string[];
}

const mapParserDefaultConfig: Partial<MapParserConfig> = {
    verbose: false,
    mipmapSize: 4,
    skipSmt: false,
    path7za: sevenBin.path7za,
    water: true,
    parseResources: false
};

export class MapParser {
    protected config: MapParserConfig;

    constructor(config?: Partial<MapParserConfig>) {
        this.config = Object.assign({}, mapParserDefaultConfig as Required<MapParserConfig>, config);
    }

    public async parseMap(mapFilePath: string) : Promise<SpringMap> {
        const filePath = path.parse(mapFilePath);
        const fileName = filePath.name;
        const fileExt = filePath.ext;
        const tempArchiveDir = path.join(os.tmpdir(), fileName);

        // register a named handler so we can remove only our listener later
        const sigintHandler = async () => this.sigint(tempArchiveDir);
        process.on("SIGINT", sigintHandler);

        try {
            if (fileExt !== ".sd7" && fileExt !== ".sdz") {
                throw new Error(`${fileExt} extension is not supported, .sd7 and .sdz only.`);
            }

            const archive = fileExt === ".sd7" ? await this.extractSd7(mapFilePath, tempArchiveDir) : await this.extractSdz(mapFilePath, tempArchiveDir);

            let mapInfo: DeepPartial<MapInfo> | undefined;
            let smd: SMD | undefined;

            if (archive.mapInfo) {
                mapInfo = await this.parseMapInfo(archive.mapInfo);
            } else {
                smd = await this.parseSMD(archive.smd!);
            }

            const smf = await this.parseSMF(archive.smf);

            let smt: Jimp | undefined;
            if (!this.config.skipSmt) {
                smt = await this.parseSMT(archive.smt, smf.tileIndexMap, smf.mapWidthUnits, smf.mapHeightUnits, this.config.mipmapSize);
            }

            const minHeight = mapInfo?.smf?.minheight ?? smd?.minHeight ?? smf?.minDepth;
            const maxHeight = mapInfo?.smf?.maxheight ?? smd?.maxHeight ?? smf?.maxDepth;

            if (this.config.water && smt) {
                this.applyWater({
                    textureMap: smt,
                    heightMapValues: smf.heightMapValues,
                    minHeight,
                    maxHeight
                });
            }

            let scriptName = "";
            if (mapInfo && mapInfo.name && mapInfo.version && mapInfo.name.includes(mapInfo.version!)) {
                scriptName = mapInfo.name;
            } else if (mapInfo && mapInfo.name) {
                scriptName = `${mapInfo.name} ${mapInfo.version}`;
            } else if (archive.smfName) {
                scriptName = archive.smfName;
            }

            // remove only our SIGINT listener
            process.removeListener("SIGINT", sigintHandler);

            let resources: Record<string, Jimp | undefined> | undefined;
            if (this.config.parseResources) {
                resources = await this.parseResources(tempArchiveDir, mapInfo?.resources);
            }

            await this.cleanup(tempArchiveDir);

            return {
                fileName: filePath.name,
                fileNameWithExt: filePath.base,
                scriptName,
                minHeight,
                maxHeight,
                mapInfo,
                smd,
                smf,
                heightMap: smf.heightMap,
                metalMap: smf.metalMap,
                miniMap: smf.miniMap,
                typeMap: smf.typeMap,
                textureMap: smt,
                resources
            };
        } catch (err) {
            await this.cleanup(tempArchiveDir);
            process.removeListener("SIGINT", sigintHandler);
            console.error(err);
            throw err;
        }
    }

    protected async extractSd7(sd7Path: string, outPath: string): Promise<{ smf: Buffer, smt: Buffer, smd?: Buffer, smfName?: string, mapInfo?: Buffer, specular?: Jimp }> {
        if (this.config.verbose) {
            console.log(`Extracting .sd7 to ${outPath}`);
        }

        if (!existsSync(sd7Path)) {
            throw new Error(`File not found: ${sd7Path}`);
        }

        await fs.mkdir(outPath, { recursive: true });

        const extractStream = extractFull(sd7Path, outPath, {
            $bin: this.config.path7za,
            recursive: true
        });

        await once(extractStream, "end");
        return await this.extractArchiveFiles(outPath);
    }

    protected async extractSdz(sdzPath: string, outPath: string): Promise<{ smf: Buffer, smt: Buffer, smd?: Buffer, smfName?: string, mapInfo?: Buffer, specular?: Jimp }> {
        if (this.config.verbose) {
            console.log(`Extracting .sdz to ${outPath}`);
        }

        if (!existsSync(sdzPath)) {
            throw new Error(`File not found: ${sdzPath}`);
        }

        await fs.mkdir(outPath, { recursive: true });

        const zip = new StreamZip.async({ file: sdzPath });
        await zip.extract("maps/", outPath);
        await zip.close();

        return this.extractArchiveFiles(outPath);
    }

    protected async extractArchiveFiles(outPath: string) {
        const files = glob.sync(`${outPath}/**/*`);

        const smfPath = files.find(filePath => filePath.match(/.*\.smf/))!;
        const smtPath = files.find(filePath => filePath.match(/.*\.smt/))!;
        const smdPath = files.find(filePath => filePath.match(/.*\.smd/));
        const mapInfoPath = files.find(filePath => path.resolve(filePath) === path.join(outPath, "/", "mapinfo.lua"));

        const smf = await fs.readFile(smfPath);
        const smfName = smfPath ? path.parse(smfPath).name : undefined;
        const smt = await fs.readFile(smtPath);
        const smd = smdPath ? await fs.readFile(smdPath) : undefined;
        const mapInfo = mapInfoPath ? await fs.readFile(mapInfoPath) : undefined;

        return { smf, smt, smd, smfName, mapInfo };
    }

    protected async parseSMF(smfBuffer: Buffer): Promise<SMF> {
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
        const largeHeightMapValues = new BufferStream(heightMapBuffer).readInts(heightMapSize, 2, true);
        const heightMapValues: number[] = [];
        const heightMapColors = largeHeightMapValues.map((val, i) => {
            const percent = val / 65536; // 2 bytes
            heightMapValues.push(percent);
            const level = percent * 255;
            return [level, level, level, 255];
        });
        const hmBuf = Buffer.from(heightMapColors.flat());

        let heightMap: Jimp;
        try {
            heightMap = new Jimp({ data: hmBuf, width: mapWidth + 1, height: mapHeight + 1 });
        } catch (err) {
            const empty = Buffer.alloc((mapWidth + 1) * (mapHeight + 1) * 4, 0);
            heightMap = new Jimp({ data: empty, width: mapWidth + 1, height: mapHeight + 1 });
        }

        const typeMapSize = (mapWidth/2) * (mapHeight/2);
        const typeMapBuffer = smfBuffer.slice(typeMapIndex, typeMapIndex + typeMapSize);
        const tmBuf = singleChannelToQuadChannel(typeMapBuffer);

        let typeMap: Jimp;
        try {
            typeMap = new Jimp({ data: tmBuf, width: mapWidth / 2, height: mapHeight / 2 });
        } catch (err) {
            const empty = Buffer.alloc((mapWidth / 2) * (mapHeight / 2) * 4, 0);
            typeMap = new Jimp({ data: empty, width: mapWidth / 2, height: mapHeight / 2 });
        }

        // Calculate miniMap size from surrounding indices instead of hardcoding
        let miniMapSize = 0;
        if (metalMapIndex && metalMapIndex > miniMapIndex) {
            miniMapSize = metalMapIndex - miniMapIndex;
        } else if (featureMapIndex && featureMapIndex > miniMapIndex) {
            miniMapSize = featureMapIndex - miniMapIndex;
        } else {
            miniMapSize = smfBuffer.length - miniMapIndex;
        }

        const miniMapBuffer = smfBuffer.slice(miniMapIndex, miniMapIndex + miniMapSize);
        const miniMapRgbaBuffer = parseDxt(miniMapBuffer, 1024, 1024);

        let miniMap: Jimp;
        try {
            miniMap = new Jimp({ data: miniMapRgbaBuffer, width: 1024, height: 1024 });
        } catch (err) {
            const empty = Buffer.alloc(1024 * 1024 * 4, 0);
            miniMap = new Jimp({ data: empty, width: 1024, height: 1024 });
        }

        const metalMapSize = (mapWidth/2) * (mapHeight/2);
        const metalMapBuffer = smfBuffer.slice(metalMapIndex, metalMapIndex + metalMapSize);
        const mmBuf = singleChannelToQuadChannel(metalMapBuffer);

        let metalMap: Jimp;
        try {
            metalMap = new Jimp({ data: mmBuf, width: mapWidth / 2, height: mapHeight / 2 });
        } catch (err) {
            const empty = Buffer.alloc((mapWidth / 2) * (mapHeight / 2) * 4, 0);
            metalMap = new Jimp({ data: empty, width: mapWidth / 2, height: mapHeight / 2 });
        }

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
            heightMap, typeMap, miniMap, metalMap, tileIndexMap, heightMapValues,
            features: [] // TODO
        };
    }

    protected async parseSMT(smtBuffer: Buffer, tileIndexes: number[], mapWidthUnits: number, mapHeightUnits: number, mipmapSize: 4 | 8 | 16 | 32) : Promise<Jimp> {
        if (this.config.verbose) {
            console.log(`Parsing .smt at mipmap size ${mipmapSize}`);
        }

        const bufferStream = new BufferStream(smtBuffer);

        const magic = bufferStream.readString(16);
        const version = bufferStream.readInt();
        const numOfTiles = bufferStream.readInt();
        const tileSize = bufferStream.readInt();
        const compressionType = bufferStream.readInt();

        // compute header size (we've read 16 + 4*4 = 32 bytes)
        const headerSize = bufferStream.getPosition();
        const dataSize = smtBuffer.length - headerSize;
        const calcStride = numOfTiles > 0 ? Math.floor(dataSize / numOfTiles) : 680;

        let TILE_STRIDE: number;
        let bytesToRead: number;
        let real_w = 4, real_h = 4;

        if (calcStride >= 512) {
            TILE_STRIDE = 680; real_w = 32; real_h = 32; bytesToRead = 512;
        } else {
            TILE_STRIDE = calcStride; bytesToRead = calcStride;
            if (calcStride >= 128) {
                real_w = 16; real_h = 16;
            } else if (calcStride >= 32) {
                real_w = 8; real_h = 8;
            } else {
                real_w = 4; real_h = 4;
            }
        }

        const rowLength = real_w * 4;

        // We'll assemble tiles at the requested mipmapSize. When tiles are stored at larger sizes
        // (e.g. 32x32) we'll decode at real_w/real_h then resize down to mipmapSize. If stored at
        // smaller sizes we'll decode and scale up.
        const assembledRowLength = mipmapSize * 4;

        // Prepare default empty tile to fill missing indices (mipmapSize rows)
        const defaultRow = Buffer.alloc(assembledRowLength, 0);
        const defaultTile: Buffer[] = [];
        for (let r = 0; r < mipmapSize; r++) {
            defaultTile.push(Buffer.from(defaultRow));
        }

        // pre-allocate refTiles with placeholders sized to mipmapSize
        const refTiles: Buffer[][] = new Array(numOfTiles).fill(null).map(() => defaultTile.map(row => Buffer.from(row)));

        const uniqueIndices = Array.from(new Set(tileIndexes));
        const smtDataStart = headerSize;
        let successCount = 0;

        for (const tileId of uniqueIndices) {
            if (typeof tileId !== "number") {
                continue;
            }
            if (tileId < 0 || tileId >= numOfTiles) {
                continue;
            }

            const offset = smtDataStart + (tileId * TILE_STRIDE);
            if (offset + bytesToRead > smtBuffer.length) {
                continue;
            }

            // Determine expected DXT length for this tile's native resolution
            const dxtLen = (real_w * real_h) / 2; // bytes for DXT1

            // If tiles are stored in 680-byte blocks with multiple mipmaps embedded, pick the correct offset
            let dxtSlice: Buffer | null = null;
            if (TILE_STRIDE === 680) {
                const tileBlock = smtBuffer.slice(offset, Math.min(offset + TILE_STRIDE, smtBuffer.length));
                const startIndex = real_w === 32 ? 0 : real_w === 16 ? 512 : real_w === 8 ? 640 : 672;
                dxtSlice = tileBlock.slice(startIndex, startIndex + dxtLen);
            } else {
                // Tiles are tightly packed per-mip; read only the expected DXT length
                if (offset + dxtLen > smtBuffer.length) {
                    continue;
                }
                dxtSlice = smtBuffer.slice(offset, offset + dxtLen);
            }

            if (!dxtSlice || dxtSlice.length < dxtLen) {
                continue;
            }

            try {
                // Decode the tile at its native resolution using the exact DXT bytes
                const refTileRGBABuffer = parseDxt(dxtSlice, real_w, real_h);

                // Create a temporary Jimp image to perform a nearest-neighbour resize to the requested mipmapSize
                let tileImage = new Jimp({ data: Buffer.from(refTileRGBABuffer), width: real_w, height: real_h });
                if (real_w !== mipmapSize || real_h !== mipmapSize) {
                    tileImage = tileImage.resize(mipmapSize, mipmapSize, Jimp.RESIZE_NEAREST_NEIGHBOR);
                }

                // Extract per-row buffers at the assembled mip size
                const assembledRows: Buffer[] = [];
                const tileData = tileImage.bitmap.data;
                for (let k = 0; k < mipmapSize; k++) {
                    const pixelIndex = k * mipmapSize * 4;
                    const rowBuf = Buffer.from(tileData.slice(pixelIndex, pixelIndex + mipmapSize * 4));
                    assembledRows.push(rowBuf);
                }
                refTiles[tileId] = assembledRows;
                successCount++;
            } catch (err) {
                // ignore single tile failures
            }
        }

        if (successCount === 0) {
            // fallback: try to decode sequentially like older implementation
            bufferStream.destroy();
            for (let i=0; i<numOfTiles; i++) {
                const offset = headerSize + i * TILE_STRIDE;
                if (offset + bytesToRead > smtBuffer.length) {
                    break;
                }
                try {
                    const dxtLen = (real_w * real_h) / 2;
                    let dxtSlice: Buffer | null = null;
                    if (TILE_STRIDE === 680) {
                        const tileBlock = smtBuffer.slice(offset, Math.min(offset + TILE_STRIDE, smtBuffer.length));
                        const startIndex = real_w === 32 ? 0 : real_w === 16 ? 512 : real_w === 8 ? 640 : 672;
                        dxtSlice = tileBlock.slice(startIndex, startIndex + dxtLen);
                    } else {
                        if (offset + dxtLen > smtBuffer.length) {
                            continue;
                        }
                        dxtSlice = smtBuffer.slice(offset, offset + dxtLen);
                    }

                    if (!dxtSlice || dxtSlice.length < dxtLen) {
                        continue;
                    }

                    const refTileRGBABuffer = parseDxt(dxtSlice, real_w, real_h);

                    let tileImage = new Jimp({ data: Buffer.from(refTileRGBABuffer), width: real_w, height: real_h });
                    if (real_w !== mipmapSize || real_h !== mipmapSize) {
                        tileImage = tileImage.resize(mipmapSize, mipmapSize, Jimp.RESIZE_NEAREST_NEIGHBOR);
                    }

                    const assembledRows: Buffer[] = [];
                    const tileData = tileImage.bitmap.data;
                    for (let k = 0; k < mipmapSize; k++) {
                        const pixelIndex = k * mipmapSize * 4;
                        const rowBuf = Buffer.from(tileData.slice(pixelIndex, pixelIndex + mipmapSize * 4));
                        assembledRows.push(rowBuf);
                    }
                    refTiles[i] = assembledRows;
                } catch (err) {
                    // ignore
                }
            }
        } else {
            bufferStream.destroy();
        }

        const tiles: Buffer[][] = [];
        for (let i=0; i<tileIndexes.length; i++) {
            const refTileIndex = tileIndexes[i];
            const tile = this.cloneTile(refTiles[refTileIndex] || defaultTile);
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

        const finalWidth = mipmapSize * mapWidthUnits * 32;
        const finalHeight = mipmapSize * mapHeightUnits * 32;
        const finalExpectedLen = finalWidth * finalHeight * 4;
        const finalBuffer = Buffer.concat(tileStrips);


        // Ensure we have a Buffer instance (defensive) before passing to Jimp
        const safeBuffer = Buffer.isBuffer(finalBuffer) ? finalBuffer : Buffer.from(finalBuffer || []);

        try {
            if (safeBuffer.length !== finalExpectedLen) {
                const emptyBuf = Buffer.alloc(finalExpectedLen, 0);
                return new Jimp({ data: emptyBuf, width: finalWidth, height: finalHeight }).background(0x000000);
            }

            return new Jimp({ data: safeBuffer, width: finalWidth, height: finalHeight }).background(0x000000);
        } catch (err) {
            const emptyBuf = Buffer.alloc(finalExpectedLen, 0);
            return new Jimp({ data: emptyBuf, width: finalWidth, height: finalHeight }).background(0x000000);
        }
    }

    protected async parseMapInfo(buffer: Buffer): Promise<MapInfo> {
        if (this.config.verbose) {
            console.log("Parsing mapinfo.lua");
        }

        const mapInfoStr = buffer.toString();
        const parsedMapInfo = luaparse.parse(mapInfoStr, { encodingMode: "x-user-defined", comments: false });
        const rootObj = parsedMapInfo.body[0] as LocalStatement;
        const rootTable = rootObj.init.find(block => block.type === "TableConstructorExpression") as TableConstructorExpression;

        const obj = this.parseMapInfoFields(rootTable.fields);

        return obj as MapInfo;
    }

    protected parseMapInfoFields(fields: (luaparse.TableKey | luaparse.TableKeyString | luaparse.TableValue)[]) {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const arr: any = [];
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const obj: any = {};

        for (const field of fields) {
            if (field.type === "TableKeyString") {
                if (field.value.type === "StringLiteral" || field.value.type === "NumericLiteral" || field.value.type === "BooleanLiteral") {
                    obj[field.key.name] = field.value.value;
                } else if (field.value.type === "UnaryExpression" && field.value.argument.type === "NumericLiteral") {
                    obj[field.key.name] = -field.value.argument.value;
                } else if (field.value.type === "TableConstructorExpression") {
                    obj[field.key.name] = this.parseMapInfoFields(field.value.fields);
                }
            } else if (field.type === "TableValue") {
                if (field.value.type === "StringLiteral" || field.value.type === "NumericLiteral" || field.value.type === "BooleanLiteral") {
                    const val = field.value.value;
                    arr.push(val);
                }
            } else if (field.type === "TableKey") {
                if (field.value.type === "StringLiteral" || field.value.type === "NumericLiteral" || field.value.type === "BooleanLiteral") {
                    if (field.key.type === "NumericLiteral") {
                        // use the numeric literal value as the array index (was using .type previously which is incorrect)
                        arr[field.key.value] = field.value.value;
                    }
                } else if (field.value.type === "UnaryExpression" && field.value.argument.type === "NumericLiteral") {
                    // Ensure the key is a numeric literal before using .value, and assert types for the unary argument
                    if (field.key.type === "NumericLiteral") {
                        arr[field.key.value] = -field.value.argument.value;
                    }
                } else if (field.value.type === "TableConstructorExpression") {
                    arr.push(this.parseMapInfoFields(field.value.fields));
                }
            }
        }

        if (arr.length) {
            return arr;
        }

        return obj;
    }

    protected async parseSMD(buffer: Buffer) : Promise<SMD> {
        if (this.config.verbose) {
            console.log("Parsing .smd");
        }

        const smd = buffer.toString();

        const matches = smd.matchAll(/\s(?<key>\w+)\s*=\s?(?<val>.*?);/g);
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const obj: { [key: string]: any } = {};
        const startPositions: Array<{ x: number, z: number }> = [];
        for (const match of matches) {
            const key = match.groups!.key;
            let val: string | number = Number(match.groups!.val);
            if (Number.isNaN(val)) {
                val = match.groups!.val;
            }

            if (key === "StartPosX") {
                startPositions.push({ x: Number(val), z: 0 });
            } else if (key === "StartPosZ") {
                startPositions[startPositions.length - 1].z = Number(val);
            } else {
                obj[key] = val;
            }
        }

        return {
            description: obj.Description,
            tidalStrength: obj.TidalStrength,
            gravity: obj.Gravity,
            maxMetal: obj.MaxMetal,
            extractorRadius: obj.ExtractorRadius,
            mapHardness: obj.MapHardness,
            minWind: obj.MinWind,
            maxWind: obj.MaxWind,
            minHeight: obj.minheight,
            maxHeight: obj.maxheight,
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

    protected joinTilesHorizontally(tiles: Buffer[][], rows: number) : Buffer {
        const tileRows: Buffer[] = [];
        for (let y=0; y<rows; y++) {
            for (let x=0; x<tiles.length; x++) {
                const row = tiles[x].shift()!;
                tileRows.push(row);
            }
        }

        return Buffer.concat(tileRows);
    }

    protected applyWater(options: WaterOptions) {
        if (options.minHeight >= 0) {
            // water level is always at 0, so if minDepth is above 0 then map has no water
            return;
        }

        const width = options.textureMap.getWidth();
        const height = options.textureMap.getHeight();
        const heightMapRatio = this.config.mipmapSize / 4;
        const heightMapWidth = Math.floor(width / heightMapRatio) + 1;
        const heightMapHeight = Math.floor(height / heightMapRatio) + 1;
        const depthRange = options.maxHeight - options.minHeight;
        const waterLevelPercent = Math.abs(options.minHeight / depthRange);
        const color = options.rgbColor ?? defaultWaterOptions.rgbColor;
        // was incorrectly using rgbColor for modifier - use rgbModifier when present
        const colorModifier = options.rgbModifier ?? defaultWaterOptions.rgbModifier;

        for (let y=0; y<height; y++) {
            for (let x=0; x<width; x++) {
                const pixelHex = options.textureMap.getPixelColor(x, y);
                const pixelRGBA = Jimp.intToRGBA(pixelHex);
                const heightMapY = Math.floor((y+1)/heightMapRatio);
                // avoid wrapping with modulo - compute direct division into heightmap coords
                const heightMapX = Math.floor((x+1) / heightMapRatio);
                const heightValue = options.heightMapValues[heightMapWidth * heightMapY + heightMapX];
                if (heightValue < waterLevelPercent) {
                    const waterDepth = heightValue / waterLevelPercent;

                    pixelRGBA.r = Math.min(Math.max(((color.r + (pixelRGBA.r * waterDepth)) / 2) * colorModifier.r, 0), 255);
                    pixelRGBA.g = Math.min(Math.max(((color.g + (pixelRGBA.g * waterDepth)) / 2) * colorModifier.g, 0), 255);
                    pixelRGBA.b = Math.min(Math.max(((color.b + (pixelRGBA.b * waterDepth)) / 2) * colorModifier.b, 0), 255);
                    const newHex = Jimp.rgbaToInt(pixelRGBA.r, pixelRGBA.g, pixelRGBA.b, pixelRGBA.a);
                    options.textureMap.setPixelColor(newHex, x, y);
                }
            }
        }
    }

    protected async parseResources(mapArchiveDir: string, resourceFiles?: Record<string, unknown>) : Promise<Record<string, Jimp | undefined>> {
        if (!resourceFiles) {
            return {};
        }

        const resources: Record<string, Jimp | undefined> = {};

        for (const key in resourceFiles) {
            const value = resourceFiles[key];

            if (typeof value !== "string") {
                continue;
            }
            if (this.config.resources && !this.config.resources.includes(key)) {
                continue;
            }

            const filename = path.join(mapArchiveDir, "maps", value);

            try {
                if ([".png", ".jpg", ".bmp"].includes(path.extname(filename))) {
                    resources[key] = await Jimp.read(filename);
                } else if (path.extname(filename) === ".dds") {
                    const resourceBuffer = await fs.readFile(filename);
                    const decodedDXT1 = parseDDS(resourceBuffer);
                    resources[key] = new Jimp({
                        data: Buffer.from(decodedDXT1.image),
                        width: decodedDXT1.width,
                        height: decodedDXT1.height
                    });
                } else if (path.extname(filename) === ".tga") {
                    const buffer = await fs.readFile(filename);
                    const tga = new TGA(buffer);
                    resources[key] = new Jimp({
                        data: tga.pixels,
                        width: tga.width,
                        height: tga.height
                    });
                } else {
                    console.warn(`No resource image parser for ${key}: ${filename}`);
                }
            } catch (err) {
                console.error(`Error parsing resource: ${key}: ${filename} `, err);
            }
        }

        return resources;
    }

    protected async cleanup(tmpDir: string) {
        if (this.config.verbose) {
            console.log(`Cleaning up temp dir: ${tmpDir}`);
        }

        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch (err) {
            console.error(err);
        }
    }

    protected async sigint(tmpDir: string) {
        await this.cleanup(tmpDir);
        process.exit();
    }
}

function singleChannelToQuadChannel(buffer: Buffer) : Buffer {
    const outBuffer: number[] = [];
    buffer.forEach(val => {
        outBuffer.push(val, val, val, 255);
    });

    return Buffer.from(outBuffer);
}
