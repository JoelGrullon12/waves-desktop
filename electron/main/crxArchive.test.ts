import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isSafeEntryName, readCrxEntries, readZipEntries, zipOffsetOfCrx } from "./crxArchive";

interface FixtureFile {
  name: string;
  content: string;
  deflate: boolean;
}

// Builds a ZIP by hand so the reader is tested against the real format
// without needing a zip dependency or binary fixtures.
function buildZip(files: FixtureFile[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const raw = Buffer.from(file.content);
    const data = file.deflate ? deflateRawSync(raw) : raw;
    const method = file.deflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function wrapInCrx(zip: Buffer, header: Buffer): Buffer {
  const preamble = Buffer.alloc(12);
  preamble.write("Cr24", 0, "latin1");
  preamble.writeUInt32LE(3, 4);
  preamble.writeUInt32LE(header.length, 8);
  return Buffer.concat([preamble, header, zip]);
}

const SAMPLE_FILES: FixtureFile[] = [
  { name: "manifest.json", content: '{"version":"1.2.3"}', deflate: true },
  { name: "_platform_specific/linux_x64/libwidevinecdm.so", content: "binary-ish", deflate: false },
];

describe("readZipEntries", () => {
  it("reads stored and deflated entries", () => {
    const entries = readZipEntries(buildZip(SAMPLE_FILES));
    expect(entries.map((entry) => entry.name)).toEqual(SAMPLE_FILES.map((file) => file.name));
    expect(entries[0]?.data.toString()).toBe('{"version":"1.2.3"}');
    expect(entries[1]?.data.toString()).toBe("binary-ish");
  });

  it("rejects data without an end of central directory", () => {
    expect(() => readZipEntries(Buffer.alloc(64))).toThrow(/central directory/);
  });
});

describe("readCrxEntries", () => {
  it("skips the CRX header before reading the ZIP", () => {
    const crx = wrapInCrx(buildZip(SAMPLE_FILES), Buffer.from("signed-header-bytes"));
    expect(readCrxEntries(crx)).toHaveLength(2);
  });

  it("locates the ZIP right after the declared header length", () => {
    const header = Buffer.alloc(40);
    expect(zipOffsetOfCrx(wrapInCrx(buildZip(SAMPLE_FILES), header))).toBe(52);
  });

  it("rejects files without the CRX magic", () => {
    expect(() => readCrxEntries(buildZip(SAMPLE_FILES))).toThrow(/Not a CRX/);
  });

  it("rejects unsupported CRX versions", () => {
    const crx = wrapInCrx(buildZip(SAMPLE_FILES), Buffer.alloc(4));
    crx.writeUInt32LE(2, 4);
    expect(() => readCrxEntries(crx)).toThrow(/Unsupported CRX version/);
  });
});

describe("isSafeEntryName", () => {
  it("accepts relative nested paths", () => {
    expect(isSafeEntryName("_platform_specific/linux_x64/libwidevinecdm.so")).toBe(true);
  });

  it.each(["../evil", "a/../../evil", "/etc/passwd", "C:\\evil", "a\\b", "", "a//b"])(
    "rejects %j",
    (name) => {
      expect(isSafeEntryName(name)).toBe(false);
    },
  );
});
