import Jimp from "jimp";

import { CubemapFaces } from "./cubemap-to-equirectangular";

/* eslint-disable @typescript-eslint/no-require-imports */
const parseDDS = require("./utex.dds");
const { UTEX, readDDSHeader, DDS_CONSTANTS, DDS_FORMATS, DDS_SIZES, DDS_HEADER_OFFSETS } = require("./utex.dds");
/* eslint-enable @typescript-eslint/no-require-imports */


/**
 * Validates that a buffer starts with the DDS magic number "DDS "
 * @param data - Uint8Array to validate
 * @param offset - Offset to check for magic number
 * @throws Error if magic number is not found
 */
function validateDDSMagic(data: Uint8Array, offset: number): void {
    const magic = UTEX.U.readASCII(data, offset, 4);
    if (magic !== "DDS ") {
        throw new Error("Invalid DDS file: missing DDS magic number");
    }
}

/**
 * Checks if a DDS file is a cubemap by examining its header
 * @param buffer - Buffer containing the DDS file
 * @returns true if the DDS file is a cubemap, false if it's a regular 2D texture
 */
export function isDDSCubemap(buffer: Buffer): boolean {
    try {
        const data = new Uint8Array(buffer);
        let offset = 0;

        // Check magic number using UTEX utility
        validateDDSMagic(data, offset);
        offset += DDS_SIZES.MAGIC;

        // Read header using UTEX.DDS.readHeader
        const header = readDDSHeader(data, offset);

        // Check if cubemap flag is set
        return (header.caps2 & DDS_CONSTANTS.DDSCAPS2_CUBEMAP) !== 0;
    } catch (err) {
        console.error("Error checking if DDS is cubemap:", err);
        return false;
    }
}

/**
 * Parses a DDS cubemap file and returns the 6 faces as Jimp images.
 * @param buffer - Buffer containing the DDS cubemap file
 * @returns Array of 6 Jimp images representing the cubemap faces in order: +X, -X, +Y, -Y, +Z, -Z
 */
export async function parseDDSCubemap(buffer: Buffer): Promise<CubemapFaces> {
    // Read DDS header
    const data = new Uint8Array(buffer);
    let offset = 0;

    // Check magic number
    validateDDSMagic(data, offset);
    offset += DDS_SIZES.MAGIC;

    // Read header (124 bytes)
    const header = readDDSHeader(data, offset);
    offset += DDS_SIZES.HEADER;

    // Check if DX10 header exists
    if ((header.pixFormat.flags & DDS_CONSTANTS.DDPF_FOURCC) && header.pixFormat.fourCC === DDS_FORMATS.DX10) {
        offset += DDS_SIZES.DX10_HEADER;
    }

    const faceWidth = header.width;
    const faceHeight = header.height;
    const mipCount = Math.max(1, header.mmcount);

    // Calculate size of one mipmap chain for one face
    const mainFaceBytes = calculateMipChainSize(faceWidth, faceHeight, 1, header.pixFormat.fourCC, header.pixFormat.bitCount);
    const fullMipChainBytes = calculateMipChainSize(faceWidth, faceHeight, mipCount, header.pixFormat.fourCC, header.pixFormat.bitCount);
    const skipBytes = fullMipChainBytes - mainFaceBytes;

    // Create a modified header with no mipmaps for parsing individual faces
    const modifiedHeader = Buffer.from(buffer.slice(0, 128));
    // Set mipmap count to 0 at offset 28 (after 4 byte magic)
    modifiedHeader.writeUInt32LE(0, DDS_HEADER_OFFSETS.MIPMAP_COUNT);
    // Clear cubemap flags from caps
    const simpleCaps = DDS_CONSTANTS.DDSCAPS_TEXTURE;
    modifiedHeader.writeUInt32LE(simpleCaps, DDS_HEADER_OFFSETS.CAPS);
    // Clear caps2 - remove all cubemap flags
    modifiedHeader.writeUInt32LE(0, DDS_HEADER_OFFSETS.CAPS2);

    const faces: Jimp[] = [];

    // Read 6 faces
    for (let i = 0; i < 6; i++) {
        // Read the main mipmap level for this face
        const faceData = buffer.slice(offset, offset + mainFaceBytes);
        offset += mainFaceBytes;

        // Skip smaller mipmap levels if they exist
        if (skipBytes > 0) {
            offset += skipBytes;
        }

        // Create a complete DDS file for this face (header + data)
        const faceDDS = Buffer.concat([modifiedHeader, faceData]);

        try {
            // Parse this face using the existing DDS parser
            const decoded = parseDDS(faceDDS);
            const face = new Jimp({
                data: Buffer.from(decoded.image),
                width: decoded.width,
                height: decoded.height
            });
            faces.push(face);
        } catch (err) {
            console.error(err);

            throw new Error(`Failed to parse cubemap face ${i}: ${err}`);
        }
    }

    if (faces.length !== 6) {
        throw new Error(`Expected 6 cubemap faces, got ${faces.length}`);
    }

    return faces as CubemapFaces;
}


/**
 * Calculates the total size of a mipmap chain for a texture
 */
function calculateMipChainSize(
    width: number,
    height: number,
    mipCount: number,
    formatCode: string,
    bitCount: number
): number {
    let totalBytes = 0;
    let w = width;
    let h = height;

    // Determine block size based on format
    let blockSize = 0;
    if (formatCode === DDS_FORMATS.DXT1) {
        blockSize = 8;
    } else if (formatCode === DDS_FORMATS.DXT3 || formatCode === DDS_FORMATS.DXT5) {
        blockSize = 16;
    }

    // Determine bytes per pixel for uncompressed formats
    let bpp = 4;
    if (blockSize === 0) {
        if (bitCount === 24) {
            bpp = 3;
        } else if (bitCount === 8) {
            bpp = 1;
        } else {
            bpp = 4;
        }
    }

    for (let i = 0; i < Math.max(1, mipCount); i++) {
        if (blockSize > 0) {
            // Block-compressed format
            const blocksWide = Math.max(1, Math.floor((w + 3) / 4));
            const blocksHigh = Math.max(1, Math.floor((h + 3) / 4));
            totalBytes += blocksWide * blocksHigh * blockSize;
        } else {
            // Uncompressed format
            totalBytes += w * h * bpp;
        }

        w = Math.max(1, Math.floor(w / 2));
        h = Math.max(1, Math.floor(h / 2));
    }

    return totalBytes;
}

