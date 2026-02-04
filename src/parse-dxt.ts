export function parseDxt(buffer: Buffer, width: number, height: number): Buffer {
    try {
        return decompress(width, height, buffer);
    } catch (err) {
        console.error(err);
        throw new Error("Error parsing DXT");
    }
}

/**
 * Useful sources:
 * https://www.khronos.org/opengl/wiki/S3_Texture_Compression
 * https://www.khronos.org/registry/DataFormat/specs/1.1/dataformat.1.1.html#S3TC
 */
const DXT1BlockSize = 8;

const RGBABlockSize = 64;
const BlockWidth = 4;
const BlockHeight = 4;

function decompressBlockDXT1(data: Uint8Array, outArray?: Uint8Array) {
    const cVal0 = (data[1] << 8) + data[0];
    const cVal1 = (data[3] << 8) + data[2];
    const lookup = generateDXT1Lookup(cVal0, cVal1);

    const out = outArray || new Uint8Array(RGBABlockSize);
    for (let i = 0; i < 16; i++) {
        const bitOffset = i * 2;
        const byte = 4 + Math.floor(bitOffset / 8);
        const bits = (data[byte] >> (bitOffset % 8)) & 3;

        out[i * 4 + 0] = lookup[bits * 4 + 0];
        out[i * 4 + 1] = lookup[bits * 4 + 1];
        out[i * 4 + 2] = lookup[bits * 4 + 2];
        out[i * 4 + 3] = lookup[bits * 4 + 3];
    }

    return out;
}

function decompress(width: number, height: number, data: Uint8Array) {
    if (width % BlockWidth !== 0) {
        throw new Error("Width of the texture must be divisible by 4");
    }
    if (height % BlockHeight !== 0) {
        throw new Error("Height of the texture must be divisible by 4");
    }
    if (width < BlockWidth || height < BlockHeight) {
        throw new Error("Size of the texture is to small");
    }

    const w = width / BlockWidth;
    const h = height / BlockHeight;
    const blockNumber = w * h;

    //if (blockNumber * DXT1BlockSize != data.length) throw new Error("Data does not match dimensions");

    const out = new Uint8Array(width * height * 4);
    const blockBuffer = new Uint8Array(RGBABlockSize);

    for (let i = 0; i < blockNumber; i++) {
        const decompressed = decompressBlockDXT1(data.slice(i * DXT1BlockSize, (i + 1) * DXT1BlockSize), blockBuffer);

        const pixelX = (i % w) * 4;
        const pixelY = Math.floor(i / w) * 4;

        let j = 0;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const px = x + pixelX;
                const py = y + pixelY;
                const outIndex = (py * width + px) * 4;
                out[outIndex] = decompressed[j];
                out[outIndex + 1] = decompressed[j + 1];
                out[outIndex + 2] = decompressed[j + 2];
                out[outIndex + 3] = decompressed[j + 3];
                j += 4;
            }
        }
    }

    return Buffer.from(out);
}

function generateDXT1Lookup(colorValue0: number, colorValue1: number, out = null) {
    const color0 = getComponentsFromRGB565(colorValue0);
    const color1 = getComponentsFromRGB565(colorValue1);

    const lookup = out || new Uint8Array(16);

    if (colorValue0 > colorValue1) {
        // Non transparent mode
        lookup[0] = color0.R;
        lookup[1] = color0.G;
        lookup[2] = color0.B;
        lookup[3] = 255;

        lookup[4] = color1.R;
        lookup[5] = color1.G;
        lookup[6] = color1.B;
        lookup[7] = 255;

        lookup[8] = Math.floor((color0.R * 2 + color1.R * 1) / 3);
        lookup[9] = Math.floor((color0.G * 2 + color1.G * 1) / 3);
        lookup[10] = Math.floor((color0.B * 2 + color1.B * 1) / 3);
        lookup[11] = 255;

        lookup[12] = Math.floor((color0.R * 1 + color1.R * 2) / 3);
        lookup[13] = Math.floor((color0.G * 1 + color1.G * 2) / 3);
        lookup[14] = Math.floor((color0.B * 1 + color1.B * 2) / 3);
        lookup[15] = 255;

    } else {
        // transparent mode
        lookup[0] = color0.R;
        lookup[1] = color0.G;
        lookup[2] = color0.B;
        lookup[3] = 255;

        lookup[4] = color1.R;
        lookup[5] = color1.G;
        lookup[6] = color1.B;
        lookup[7] = 255;

        lookup[8] = Math.floor((color0.R + color1.R) / 2);
        lookup[9] = Math.floor((color0.G + color1.G) / 2);
        lookup[10] = Math.floor((color0.B + color1.B) / 2);
        lookup[11] = 255;

        lookup[12] = 0;
        lookup[13] = 0;
        lookup[14] = 0;
        lookup[15] = 0;
    }

    return lookup;
}


function getComponentsFromRGB565(color: number) {
    // Simple bit shift approach matching Python implementation
    // This produces smoother gradients with fewer artifacts than bit replication
    const r = (color & 0xF800) >> 8;  // 5 bits shifted to positions 3-7
    const g = (color & 0x07E0) >> 3;  // 6 bits shifted to positions 2-7
    const b = (color & 0x001F) << 3;  // 5 bits shifted to positions 3-7

    return { R: r, G: g, B: b };
}

function makeRGB565(r: any, g: any, b: any) {
    return ((r & 0b11111000) << 8) | ((g & 0b11111100) << 3) | ((b & 0b11111000) >> 3);
}
