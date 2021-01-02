export namespace MapModel {

    export interface Map {
        
    }
    export interface SMF {
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
        maxHeight: number;
        heightMapIndex: number;
        typeMapIndex: number;
        tileIndex: number;
        miniMapIndex: number;
        metalMapIndex: number;
        featuresMapIndex: number;
        noOfExtraHeades: number;
    }
}