import Jimp from "jimp";

/**
 * Represents the six faces of a cubemap in the order:
 * [+X (right), -X (left), +Y (top), -Y (bottom), +Z (front), -Z (back)]
 */
export type CubemapFaces = [Jimp, Jimp, Jimp, Jimp, Jimp, Jimp];

/**
 * Converts a cubemap (6 square faces) to an equirectangular (2:1) projection.
 *
 * @param faces - Array of 6 Jimp images representing cubemap faces in order: +X, -X, +Y, -Y, +Z, -Z
 * @param outputWidth - Width of output equirectangular image (height will be outputWidth/2)
 * @returns Jimp image in equirectangular projection
 */
export function cubemapToEquirectangular(faces: CubemapFaces, outputWidth: number): Jimp {
    const outputHeight = Math.floor(outputWidth / 2);

    // Correct face orientations - flip faces 0, 1, 4, 5 vertically
    const correctedFaces: Jimp[] = faces.map((face, i) => {
        if (i === 0 || i === 1 || i === 4 || i === 5) {
            return face.clone().flip(false, true);
        }
        return face;
    });

    const faceSize = correctedFaces[0].getWidth();
    const output = new Jimp(outputWidth, outputHeight);

    // For each pixel in the output equirectangular image
    for (let y = 0; y < outputHeight; y++) {
        for (let x = 0; x < outputWidth; x++) {
            // Convert pixel coordinates to normalized coordinates [0, 1]
            const u = x / outputWidth;
            const v = y / outputHeight;

            // Convert to spherical coordinates
            const theta = u * 2 * Math.PI;  // longitude
            const phi = v * Math.PI;         // latitude

            // Convert spherical to cartesian coordinates
            const cartX = -Math.sin(phi) * Math.sin(theta);
            const cartY = Math.cos(phi);
            const cartZ = -Math.sin(phi) * Math.cos(theta);

            // Determine which face to sample from and get UV coordinates on that face
            const { faceIndex, faceU, faceV } = cartesianToCubemapUV(cartX, cartY, cartZ);

            // Convert face UV [0, 1] to pixel coordinates
            const pixelU = Math.min(Math.floor(faceU * faceSize), faceSize - 1);
            const pixelV = Math.min(Math.floor(faceV * faceSize), faceSize - 1);

            // Sample the color from the appropriate face
            const color = correctedFaces[faceIndex].getPixelColor(pixelU, pixelV);
            output.setPixelColor(color, x, y);
        }
    }

    return output;
}

/**
 * Converts cartesian coordinates to cubemap face index and UV coordinates.
 *
 * @param x - X coordinate in cartesian space
 * @param y - Y coordinate in cartesian space
 * @param z - Z coordinate in cartesian space
 * @returns Object containing face index (0-5) and UV coordinates on that face
 */
function cartesianToCubemapUV(x: number, y: number, z: number): { faceIndex: number; faceU: number; faceV: number } {
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);

    const isXPositive = x > 0;
    const isYPositive = y > 0;
    const isZPositive = z > 0;

    let faceIndex: number;
    let uc: number;
    let vc: number;

    // Determine which face we're sampling from
    if (isXPositive && absX >= absY && absX >= absZ) {
        // +X face (right)
        faceIndex = 0;
        uc = -z / absX;
        vc = y / absX;
    } else if (!isXPositive && absX >= absY && absX >= absZ) {
        // -X face (left)
        faceIndex = 1;
        uc = z / absX;
        vc = y / absX;
    } else if (isYPositive && absY >= absX && absY >= absZ) {
        // +Y face (top)
        faceIndex = 2;
        uc = x / absY;
        vc = z / absY;
    } else if (!isYPositive && absY >= absX && absY >= absZ) {
        // -Y face (bottom)
        faceIndex = 3;
        uc = x / absY;
        vc = -z / absY;
    } else if (isZPositive && absZ >= absX && absZ >= absY) {
        // +Z face (front)
        faceIndex = 4;
        uc = x / absZ;
        vc = y / absZ;
    } else {
        // -Z face (back)
        faceIndex = 5;
        uc = -x / absZ;
        vc = y / absZ;
    }

    // Convert from [-1, 1] to [0, 1]
    const faceU = 0.5 * (uc + 1.0);
    const faceV = 0.5 * (vc + 1.0);

    return { faceIndex, faceU, faceV };
}
