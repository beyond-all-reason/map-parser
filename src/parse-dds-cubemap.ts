import Jimp from "jimp";

import { CubemapFaces } from "./cubemap-to-equirectangular";

import parseDDS from "./utex.dds";

interface DDSHeader {
    flags: number;
    height: number;
    width: number;
    pitch: number;
    depth: number;
    mmcount: number; // mipmap count
    pixFormat: {
        flags: number;
        fourCC: string;
        bitCount: number;
    };
    caps: number;
    caps2: number;
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
    const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (magic !== "DDS ") {
        throw new Error("Invalid DDS file: missing DDS magic number");
    }
    offset += 4;

    // Read header (124 bytes)
    const header = readDDSHeader(data, offset);
    offset += 124;

    // Check if DX10 header exists
    const DDPF_FOURCC = 0x4;
    if ((header.pixFormat.flags & DDPF_FOURCC) && header.pixFormat.fourCC === "DX10") {
        offset += 20; // Skip DX10 header
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
    modifiedHeader.writeUInt32LE(0, 28);
    // Clear cubemap flags from caps (offset 108 after magic)
    // DDSCAPS_COMPLEX = 0x8, DDSCAPS_MIPMAP = 0x400000, DDSCAPS_TEXTURE = 0x1000
    const simpleCaps = 0x1000; // Just DDSCAPS_TEXTURE
    modifiedHeader.writeUInt32LE(simpleCaps, 108);
    // Clear caps2 (offset 112 after magic) - remove all cubemap flags
    modifiedHeader.writeUInt32LE(0, 112);

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
 * Reads DDS header from buffer
 */
function readDDSHeader(data: Uint8Array, offset: number): DDSHeader {
    const readUint32LE = (data: Uint8Array, offset: number): number => {
        return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    };

    offset += 4; // Skip size field (124)
    const flags = readUint32LE(data, offset); offset += 4;
    const height = readUint32LE(data, offset); offset += 4;
    const width = readUint32LE(data, offset); offset += 4;
    const pitch = readUint32LE(data, offset); offset += 4;
    const depth = readUint32LE(data, offset); offset += 4;
    const mmcount = readUint32LE(data, offset); offset += 4;

    offset += 11 * 4; // Skip reserved fields

    // Read pixel format (32 bytes)
    offset += 4; // Skip pixel format size
    const pfFlags = readUint32LE(data, offset); offset += 4;
    const fourCC = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    offset += 4;
    const bitCount = readUint32LE(data, offset); offset += 4;
    offset += 16; // Skip RGBA masks

    const caps = readUint32LE(data, offset); offset += 4;
    const caps2 = readUint32LE(data, offset);

    return {
        flags,
        height,
        width,
        pitch,
        depth,
        mmcount,
        pixFormat: {
            flags: pfFlags,
            fourCC,
            bitCount
        },
        caps,
        caps2
    };
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
    if (formatCode === "DXT1") {
        blockSize = 8;
    } else if (formatCode === "DXT3" || formatCode === "DXT5") {
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

