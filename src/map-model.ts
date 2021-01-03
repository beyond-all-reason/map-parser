export namespace MapModel {
    export interface Map {
        info: Info;
        meta: Meta;
    }

    export interface Info {
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
    export interface Meta {
        magic: string;
        version: number;
        id: number;
        mapWidth: number;
        widthUnits: number;
        mapHeight: number;
        heightUnits: number;
        squareSize: number;
        texelsPerSquare: number;
        tileSize: number;
        minDepth: number;
        maxDepth: number;
    }

    export interface SMTHeader {

    }
}