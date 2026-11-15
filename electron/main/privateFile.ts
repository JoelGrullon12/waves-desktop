import fs from "node:fs";

const OWNER_READ_WRITE_ONLY = 0o600;

// `mode` in writeFileSync only applies when the file is created, so the chmod
// also tightens files written by earlier versions. It is a no-op on Windows,
// where the per-user profile ACLs already apply.
export function writePrivateFile(filePath: string, contents: string | Buffer): void {
  fs.writeFileSync(filePath, contents, { mode: OWNER_READ_WRITE_ONLY });
  fs.chmodSync(filePath, OWNER_READ_WRITE_ONLY);
}
