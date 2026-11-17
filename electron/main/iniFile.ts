// A minimal INI reader and writer, enough for settings the user may open in a
// text editor. Keys are flat dotted names ("player.volume"): the part before
// the first dot is the section, the rest is the key inside it. Keys without a
// dot go to the [general] section.
//
// Values are written as they are, unless they have surrounding spaces, line
// breaks or start with a quote: then they are written as a JSON string, which
// the reader turns back into the original text.

const DEFAULT_SECTION = "general";
const SECTION_LINE = /^\[([^\]]+)\]$/;

export function parseIni(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  let section = DEFAULT_SECTION;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith(";") || line.startsWith("#")) continue;
    const sectionMatch = SECTION_LINE.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key === "") continue;
    const fullKey = section === DEFAULT_SECTION && !key.includes(".") ? key : `${section}.${key}`;
    values[fullKey] = readValue(line.slice(separator + 1).trim());
  }
  return values;
}

export function serializeIni(values: Record<string, string>, headerLines: string[] = []): string {
  const sections = new Map<string, Array<[string, string]>>();
  for (const fullKey of Object.keys(values).sort()) {
    const separator = fullKey.indexOf(".");
    const section = separator > 0 ? fullKey.slice(0, separator) : DEFAULT_SECTION;
    const key = separator > 0 ? fullKey.slice(separator + 1) : fullKey;
    const entries = sections.get(section) ?? [];
    entries.push([key, values[fullKey]]);
    sections.set(section, entries);
  }

  const lines = headerLines.map((headerLine) => `; ${headerLine}`);
  for (const [section, entries] of sections) {
    if (lines.length > 0) lines.push("");
    lines.push(`[${section}]`);
    for (const [key, value] of entries) lines.push(`${key} = ${writeValue(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function needsQuoting(value: string): boolean {
  return value !== value.trim() || value.startsWith('"') || /[\r\n]/.test(value);
}

function writeValue(value: string): string {
  return needsQuoting(value) ? JSON.stringify(value) : value;
}

function readValue(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Not one of ours: keep the text as written.
    }
  }
  return raw;
}
