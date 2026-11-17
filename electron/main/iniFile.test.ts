import { describe, expect, it } from "vitest";
import { parseIni, serializeIni } from "./iniFile";

describe("serializeIni", () => {
  it("groups dotted keys into sections, sorted", () => {
    const text = serializeIni(
      { "player.volume": "80", "ui.theme": "dark", "player.repeat": "all", plain: "1" },
      ["Waves settings"],
    );
    expect(text).toBe(
      [
        "; Waves settings",
        "",
        "[general]",
        "plain = 1",
        "",
        "[player]",
        "repeat = all",
        "volume = 80",
        "",
        "[ui]",
        "theme = dark",
        "",
      ].join("\n"),
    );
  });

  it("keeps the rest of the key after the first dot", () => {
    expect(serializeIni({ "remote.port.number": "1" })).toBe("[remote]\nport.number = 1\n");
  });
});

describe("parseIni", () => {
  it("reads what serializeIni writes", () => {
    const values = {
      "player.volume": "80",
      "queue.source": '{"sourceType":"album","sourceId":"1"}',
      "ui.note": "  spaced  ",
      "ui.multiline": "one\ntwo",
      "ui.quoted": '"hello"',
      "ui.empty": "",
      plain: "x",
    };
    expect(parseIni(serializeIni(values, ["header"]))).toEqual(values);
  });

  it("ignores comments, blank lines and broken lines", () => {
    const text = "; comment\n# other\n\n[player]\nvolume=35\n=nothing\nno separator\n[ui]\n theme = light \r\n";
    expect(parseIni(text)).toEqual({ "player.volume": "35", "ui.theme": "light" });
  });

  it("keeps an unparseable quoted value as written", () => {
    expect(parseIni('[ui]\nvalue = "a\\q"')).toEqual({ "ui.value": '"a\\q"' });
  });

  it("puts keys before any section in general", () => {
    expect(parseIni("a = 1\n[general]\nb = 2")).toEqual({ a: "1", b: "2" });
  });
});
