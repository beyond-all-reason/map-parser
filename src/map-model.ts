export namespace MapModel {
    // export interface Map {
    //     name: string;
    //     shortname: string;
    //     description: string;
    //     author: string;
    //     version: string;
    //     mapfile: string;
    //     modtype: number;
    //     maphardness: number;
    //     notDeformable: boolean;
    //     gravity: number;
    //     tidalStrength: number;
    //     maxMetal: number;
    //     extractorRadius: number;
    //     voidWater: boolean;
    //     voidGround: boolean;
    //     autoShowMetal: boolean;
    //     minWind: number;
    //     maxWind: number;
    //     startPositions: { [teamId: number]: { x: number, z: number} };
    // }

    export interface Map {

    }

    export interface Meta {
        magic: string;
        version: number;
        id: number;
        widthPixels: number;
        widthUnits: number;
        heightPixels: number;
        heightUnits: number;
        squareSize: number;
        texelsPerSquare: number;
        tileSize: number;
        minHeight: number;
    }
}