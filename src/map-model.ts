import { Merge, Optionals } from "jaz-ts-utils";
import Jimp from "jimp";

export namespace MapModel {
    export interface Map {
        info: Info;
        textureMap?: Jimp;
        heightMap: Jimp;
        miniMap: Jimp;
        metalMap: Jimp;
        typeMap: Jimp;
    }

    export type Info = { fileName: string, scriptName: string } & MapInfo & Pick<SMF, "mapWidthUnits" | "mapHeightUnits" | "minDepth" | "maxDepth" | "smtFileName">;
    export interface MapInfo {
        name: string;
        shortname: string;
        description: string;
        author: string;
        version: string;
        mapfile: string;
        modtype: number;
        mapHardness: number;
        notDeformable: boolean;
        gravity: number;
        tidalStrength: number;
        maxMetal: number;
        extractorRadius: number;
        voidWater: boolean;
        voidGround: boolean;
        autoShowMetal: boolean;
        minWind: number;
        maxWind: number;
        startPositions: Array<{ x: number, z: number }>;
    }

    export interface SMD {
        description: string;
        tidalStrength: number;
        gravity: number;
        maxMetal: number;
        extractorRadius: number;
        mapHardness: number;
        minWind: number;
        maxWind: number;
        startPositions: Array<{ x: number, z: number }>;
    }

    export interface SMF {
        magic: string;
        version: number;
        id: number;
        mapWidth: number;
        mapWidthUnits: number;
        mapHeight: number;
        mapHeightUnits: number;
        squareSize: number;
        texelsPerSquare: number;
        tileSize: number;
        minDepth: number;
        maxDepth: number;
        heightMapIndex: number;
        typeMapIndex: number;
        tileIndexMapIndex: number;
        miniMapIndex: number;
        metalMapIndex: number;
        featureMapIndex: number;
        noOfExtraHeaders: number;
        extraHeaders: Array<SMFExtraHeader>;
        numOfTileFiles: number;
        numOfTilesInAllFiles: number;
        numOfTilesInThisFile: number;
        smtFileName: string;
        heightMap: Jimp;
        typeMap: Jimp;
        miniMap: Jimp;
        metalMap: Jimp;
        tileIndexMap: number[];
        features: any; // TODO
        heightMapValues: number[];
    }

    export interface SMFExtraHeader {
        size: number;
        type: number;
        data: Buffer;
    }

    export interface WaterOptions {
        textureMap: Jimp;
        heightMapValues: number[];
        minDepth: number;
        maxDepth: number;
        rgbColor?: { r: number, g: number, b: number };
        rgbModifier?: { r: number, g: number, b: number };
    }
}

export const defaultWaterOptions: Optionals<MapModel.WaterOptions> = {
    rgbColor: { r: 33, g: 35, b: 77 },
    rgbModifier: { r: 1, g: 1.2, b: 1 }
};