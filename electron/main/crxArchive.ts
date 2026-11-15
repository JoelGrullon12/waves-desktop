import { inflateRawSync } from "node:zlib";

// Minimal reader for the CRX3 packages Chromium's Component Updater downloads.
// A CRX3 file is a small signed header followed by an ordinary ZIP archive, so
// the only parsing needed is skipping the header and walking the ZIP central
// directory. Written on node:zlib to avoid adding an archive dependency.

const CRX_MAGIC = "Cr24";
const CRX_SUPPORTED_VERSION = 3;
const CRX_PREAMBLE_BYTES = 12;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_MIN_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

export interface ArchiveEntry {
  name: string;
  data: Buffer;
}

export function zipOffsetOfCrx(crx: Buffer): number {
  if (crx.length < CRX_PREAMBLE_BYTES || crx.toString("latin1", 0, 4) !== CRX_MAGIC) {
    throw new Error("Not a CRX package.");
  }
  const version = crx.readUInt32LE(4);
  if (version !== CRX_SUPPORTED_VERSION) {
    throw new Error(`Unsupported CRX version ${version}.`);
  }
  const headerLength = crx.readUInt32LE(8);
  const zipOffset = CRX_PREAMBLE_BYTES + headerLength;
  if (zipOffset >= crx.length) {
    throw new Error("CRX header is larger than the package.");
  }
  return zipOffset;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const earliestOffset = Math.max(
    0,
    zip.length - END_OF_CENTRAL_DIRECTORY_MIN_BYTES - MAX_ZIP_COMMENT_BYTES,
  );
  for (let offset = zip.length - END_OF_CENTRAL_DIRECTORY_MIN_BYTES; offset >= earliestOffset; offset--) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new Error("ZIP end of central directory not found.");
}

export function readZipEntries(zip: Buffer): ArchiveEntry[] {
  const endOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(endOffset + 10);
  let cursor = zip.readUInt32LE(endOffset + 16);

  const entries: ArchiveEntry[] = [];
  for (let index = 0; index < entryCount; index++) {
    if (zip.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Corrupt ZIP central directory.");
    }
    const compressionMethod = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;

    if (zip.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Corrupt ZIP local header for "${name}".`);
    }
    const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === COMPRESSION_STORED) {
      entries.push({ name, data: Buffer.from(compressed) });
    } else if (compressionMethod === COMPRESSION_DEFLATE) {
      entries.push({ name, data: inflateRawSync(compressed) });
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for "${name}".`);
    }
  }
  return entries;
}

export function readCrxEntries(crx: Buffer): ArchiveEntry[] {
  return readZipEntries(crx.subarray(zipOffsetOfCrx(crx)));
}

// Entry names come from a downloaded archive, so refuse anything that could
// land outside the destination folder (zip-slip).
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.startsWith("/") || name.includes("\\") || /^[a-zA-Z]:/.test(name)) {
    return false;
  }
  return !name.split("/").some((segment) => segment === ".." || segment === "");
}
