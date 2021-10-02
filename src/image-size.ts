export function getDDSSize(buffer: Buffer) : { width: number, height: number } | null {
    if (validatePNG(buffer)) {
        return sizeOfPNG(buffer);
    } else if (validateDDS(buffer)) {
        return sizeOfDDS(buffer);
    }
    
    return null;
}

const pngSignature = 'PNG\r\n\x1a\n'
const pngImageHeaderChunkName = 'IHDR'

// Used to detect "fried" png's: http://www.jongware.com/pngdefry.html
const pngFriedChunkName = 'CgBI'

function validatePNG(buffer: Buffer) {
    if (pngSignature === buffer.toString('ascii', 1, 8)) {
        let chunkName = buffer.toString('ascii', 12, 16)
        if (chunkName === pngFriedChunkName) {
            chunkName = buffer.toString('ascii', 28, 32)
        }
        if (chunkName !== pngImageHeaderChunkName) {
            throw new TypeError('Invalid PNG')
        }
        return true
    }
    return false
}

function sizeOfPNG(buffer: Buffer) {
    if (buffer.toString('ascii', 12, 16) === pngFriedChunkName) {
        return {
            height: buffer.readUInt32BE(36),
            width: buffer.readUInt32BE(32)
        }
    }
    return {
        height: buffer.readUInt32BE(20),
        width: buffer.readUInt32BE(16)
    }
}

function validateDDS(buffer: Buffer) {
    return buffer.readUInt32LE(0) === 0x20534444
}

export function sizeOfDDS(buffer: Buffer) {
    return {
        height: buffer.readUInt32LE(12),
        width: buffer.readUInt32LE(16)
    }
}