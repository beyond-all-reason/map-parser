import { DeepPartial, Optionals } from "jaz-ts-utils";
import Jimp from "jimp";

export interface SpringMap {
    fileName: string;
    fileNameWithExt: string;
    scriptName: string;
    minHeight: number;
    maxHeight: number;
    mapInfo?: DeepPartial<MapInfo>;
    smd?: SMD;
    smf?: SMF;
    textureMap?: Jimp;
    heightMap: Jimp;
    miniMap: Jimp;
    metalMap: Jimp;
    typeMap: Jimp;
    specularMap?: Jimp;
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
    minHeight?: number;
    maxHeight?: number;
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
    minHeight: number;
    maxHeight: number;

    rgbColor?: { r: number, g: number, b: number };
    rgbModifier?: { r: number, g: number, b: number };
}

export interface MapInfo {
    fileName: string;
    scriptName: string;
    name: string;
    shortname: string;
    description: string;
    author: string;
    version: string;
    mapfile: string;
    modtype: number;
    depend: any;
    replace: any;
    maphardness: number;
    notDeformable: boolean;
    gravity: number;
    tidalStrength: number;
    maxMetal: number;
    extractorRadius: number;
    voidGround: boolean;
    voidWater: boolean;
    autoShowMetal: boolean;
    smf: Smf;
    sound: Sound;
    resources: Resources;
    splats: Splats;
    atmosphere: Atmosphere;
    grass: Grass;
    lighting: Lighting;
    water: Water;
    teams: Team[];
    terrainTypes: TerrainType[];
    custom: Custom;
    mapWidthUnits: number;
    mapHeightUnits: number;
    minDepth: number;
    maxDepth: number;
    smtFileName: string;
}

export interface Smf {
    minheight: number;
    maxheight: number;
    smtFileName0: string;
}

export interface Passfilter {
    gainlf: number;
    gainhf: number;
}

export interface Sound {
    preset: string;
    passfilter: Passfilter;
    reverb: any;
}

export interface Resources {
    detailTex: string;
    splatDetailTex: string;
    splatDistrTex: string;
    splatDetailNormalDiffuseAlpha: number;
    splatDetailNormalTex1: string;
    splatDetailNormalTex2: string;
    splatDetailNormalTex3: string;
    splatDetailNormalTex4: string;
    detailNormalTex: string;
    specularTex: string;
}

export interface Splats {
    TexScales: number[];
    TexMults: number[];
}

export interface Atmosphere {
    minWind: number;
    maxWind: number;
    fogEnd: number;
    fogStart: number;
    skyBox: string;
    cloudColor: number[];
    fogColor: number[];
    skyColor: number[];
    sunColor: number[];
    skyDir: number[];
    cloudDensity: number;
}

export interface Grass {
    bladeWaveScale: number;
    bladeWidth: number;
    bladeHeight: number;
    bladeAngle: number;
    bladeColor: number[];
}

export interface Lighting {
    groundShadowDensity: number;
    unitShadowDensity: number;
    groundAmbientColor: number[];
    groundDiffuseColor: number[];
    groundSpecularColor: number[];
    sunDir: number[];
    unitAmbientColor: number[];
    unitDiffuseColor: number[];
    unitSpecularColor: number[];
    groundambientcolor: number[];
    grounddiffusecolor: number[];
    groudspecularcolor: number[];
    groundshadowdensity: number;
    unitshadowdensity: number;
    specularsuncolor: number[];
    specularExponent: number;
}

export interface Water {
    ambientFactor: number;
    blurBase: number;
    blurExponent: number;
    diffuseFactor: number;
    foamTexture: string;
    forceRendering: boolean;
    fresnelMax: number;
    fresnelMin: number;
    fresnelPower: number;
    hasWaterPlane: boolean;
    normalTexture: string;
    numTiles: number;
    perlinAmplitude: number;
    perlinLacunarity: number;
    perlinStartFreq: number;
    reflectionDistortion: number;
    repeatX: number;
    repeatY: number;
    shoreWaves: boolean;
    specularFactor: number;
    specularPower: number;
    texture: string;
    diffuseColor: number[];
    planeColor: number[];
    specularColor: number[];
    damage: number;
    absorb: number[];
    basecolor: number[];
    mincolor: number[];
    surfacecolor: number[];
    surfaceAlpha: number;
    windSpeed: number;
}

export interface StartPos {
    x: number;
    z: number;
}

export interface Team {
    startPos: StartPos;
}

export interface MoveSpeeds {
    tank: number;
    kbot: number;
    hover: number;
    ship: number;
}

export interface TerrainType {
    name: string;
    hardness: number;
    receiveTracks: boolean;
    moveSpeeds: MoveSpeeds;
}

export interface Fog {
    color: number[];
    height: string;
    fogatten: number;
}

export interface Precipitation {
    density: number;
    size: number;
    speed: number;
    windscale: number;
    texture: string;
}

export interface Custom {
    fog: Fog;
    precipitation: Precipitation;
}

export const defaultWaterOptions: Optionals<WaterOptions> = {
    rgbColor: { r: 33, g: 35, b: 77 },
    rgbModifier: { r: 1, g: 1.2, b: 1 }
};