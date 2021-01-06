import { Merge } from "jaz-ts-utils";
import { Sharp } from "sharp";

export namespace MapModel {
    export interface Map {
        fileName: string;
        info: Merge<MapInfo, SMD>;
        meta: SMF;
        textureMap: Sharp;
        heightMap: Sharp;
        miniMap: Sharp;
        metalMap: Sharp;
        typeMap: Sharp;
    }

    export interface MapInfo {
        name: string;
        shortname: string;
        description: string;
        author: string;
        version: string;
        mapfile: string;
        modtype: number;
        maphardness: number;
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
        heightMap: Sharp;
        typeMap: Sharp;
        miniMap: Sharp;
        metalMap: Sharp;
        tileIndexMap: number[];
        features: any; // TODO
    }

    export interface SMFExtraHeader {
        size: number;
        type: number;
        data: Buffer;
    }
}