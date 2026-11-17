import { describe, expect, it } from "vitest";
import {
  optionalResourceId,
  requireNumberInRange,
  authorizationCodeFromRedirect,
  isTrustedSenderUrl,
  optionalCursor,
  parseTidalAppCredentials,
  requireCollectionName,
  requireMixRelationship,
  requireResourceId,
  requireResourceIdList,
  requireSearchQuery,
  parseTursoConfig,
  requireNetworkPort,
  resolveTidalAppCredentials,
  resolveTursoConfig,
} from "./validation";

describe("requireResourceId", () => {
  it.each(["12345", "0f2c6c3e-8a41-4a3b-9d5e-6f1c2b7a9d10", "abc_DEF-9"])("accepts %s", (id) => {
    expect(requireResourceId(id, "id")).toBe(id);
  });

  it.each(["", "../etc/passwd", "1/2", "1?x=y", "a b", "1#2", 42, null, undefined, "x".repeat(65)])(
    "rejects %j",
    (id) => {
      expect(() => requireResourceId(id, "id")).toThrow(/Invalid id/);
    },
  );
});

describe("optionalResourceId", () => {
  it("accepts a missing value and validates a present one", () => {
    expect(optionalResourceId(null, "track id")).toBeNull();
    expect(optionalResourceId(undefined, "track id")).toBeNull();
    expect(optionalResourceId("12345", "track id")).toBe("12345");
    expect(() => optionalResourceId("../etc", "track id")).toThrow("Invalid track id.");
  });
});

describe("requireNumberInRange", () => {
  it("accepts numbers inside the range, bounds included", () => {
    expect(requireNumberInRange(0, "volume", 0, 100)).toBe(0);
    expect(requireNumberInRange(42.5, "volume", 0, 100)).toBe(42.5);
    expect(requireNumberInRange(100, "volume", 0, 100)).toBe(100);
  });

  it("rejects anything that is not a finite number in range", () => {
    for (const value of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY, "50", null, undefined]) {
      expect(() => requireNumberInRange(value, "volume", 0, 100)).toThrow("Invalid volume.");
    }
  });
});

describe("requireCollectionName", () => {
  it("accepts a resource type and rejects path tricks", () => {
    expect(requireCollectionName("playlists", "mix type")).toBe("playlists");
    expect(() => requireCollectionName("playlists/..", "mix type")).toThrow();
    expect(() => requireCollectionName("a1", "mix type")).toThrow();
  });
});

describe("requireMixRelationship", () => {
  it("only accepts the two known relationships", () => {
    expect(requireMixRelationship("myMixes")).toBe("myMixes");
    expect(() => requireMixRelationship("userCollection")).toThrow();
  });
});

describe("optionalCursor", () => {
  it("maps missing and empty cursors to null", () => {
    expect(optionalCursor(undefined)).toBeNull();
    expect(optionalCursor(null)).toBeNull();
    expect(optionalCursor("")).toBeNull();
    expect(optionalCursor("abc")).toBe("abc");
  });

  it("rejects non-strings and oversized cursors", () => {
    expect(() => optionalCursor(5)).toThrow();
    expect(() => optionalCursor("x".repeat(3000))).toThrow();
  });
});

describe("requireSearchQuery", () => {
  it("trims and bounds the query", () => {
    expect(requireSearchQuery("  daft punk ")).toBe("daft punk");
    expect(() => requireSearchQuery("   ")).toThrow();
    expect(() => requireSearchQuery("x".repeat(201))).toThrow();
    expect(() => requireSearchQuery({})).toThrow();
  });
});

describe("requireResourceIdList", () => {
  it("validates every element", () => {
    expect(requireResourceIdList(["1", "2"], "track ids")).toEqual(["1", "2"]);
    expect(() => requireResourceIdList(["1", "../2"], "track ids")).toThrow();
    expect(() => requireResourceIdList("1", "track ids")).toThrow();
  });
});

describe("isTrustedSenderUrl", () => {
  it("in development only trusts the dev server origin", () => {
    const trusted = { developmentOrigin: "http://localhost:5173" };
    expect(isTrustedSenderUrl("http://localhost:5173/songs", trusted)).toBe(true);
    expect(isTrustedSenderUrl("http://localhost:5174/", trusted)).toBe(false);
    expect(isTrustedSenderUrl("https://evil.example/", trusted)).toBe(false);
    expect(isTrustedSenderUrl("file:///app/index.html", trusted)).toBe(false);
  });

  it("in a packaged build trusts file URLs only", () => {
    const trusted = { developmentOrigin: null };
    expect(isTrustedSenderUrl("file:///app/out/renderer/index.html#/x", trusted)).toBe(true);
    expect(isTrustedSenderUrl("file:///songs", trusted)).toBe(true);
    expect(isTrustedSenderUrl("https://listen.tidal.com/", trusted)).toBe(false);
    expect(isTrustedSenderUrl("", trusted)).toBe(false);
    expect(isTrustedSenderUrl("not a url", trusted)).toBe(false);
  });
});

describe("parseTidalAppCredentials", () => {
  it("trims pasted values", () => {
    expect(parseTidalAppCredentials("  abcd1234 ", "secret+/=-_.12\n")).toEqual({
      clientId: "abcd1234",
      clientSecret: "secret+/=-_.12",
    });
  });

  it.each([
    ["short", "abcd1234efgh"],
    ["abcd1234", "has space inside1"],
    ["", "abcd1234efgh"],
    ["abcd1234", "x".repeat(300)],
  ])("rejects %j / %j", (clientId, clientSecret) => {
    expect(() => parseTidalAppCredentials(clientId, clientSecret)).toThrow();
  });

  it("rejects non-strings", () => {
    expect(() => parseTidalAppCredentials(null, "abcd1234efgh")).toThrow();
  });
});

describe("resolveTidalAppCredentials", () => {
  const stored = { clientId: "storedid1", clientSecret: "storedsecret" };

  it("prefers the environment when both variables are set", () => {
    const resolved = resolveTidalAppCredentials(
      { TIDAL_CLIENT_ID: "envid", TIDAL_CLIENT_SECRET: "envsecret" },
      stored,
    );
    expect(resolved?.source).toBe("env");
    expect(resolved?.credentials.clientId).toBe("envid");
  });

  it("falls back to stored credentials when the environment is incomplete", () => {
    expect(resolveTidalAppCredentials({ TIDAL_CLIENT_ID: "envid" }, stored)?.source).toBe("stored");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveTidalAppCredentials({}, null)).toBeNull();
  });
});

describe("authorizationCodeFromRedirect", () => {
  const redirectUri = "https://listen.tidal.com/login/auth";

  it("extracts the code from the redirect URL", () => {
    expect(authorizationCodeFromRedirect(`${redirectUri}?code=abc123&state=x`, redirectUri)).toBe(
      "abc123",
    );
  });

  it("ignores other pages, hosts and a missing or empty code", () => {
    expect(authorizationCodeFromRedirect("https://login.tidal.com/authorize?code=abc", redirectUri)).toBeNull();
    expect(authorizationCodeFromRedirect("https://evil.example/login/auth?code=abc", redirectUri)).toBeNull();
    expect(authorizationCodeFromRedirect(redirectUri, redirectUri)).toBeNull();
    expect(authorizationCodeFromRedirect(`${redirectUri}?code=`, redirectUri)).toBeNull();
    expect(authorizationCodeFromRedirect("not a url", redirectUri)).toBeNull();
  });
});

describe("parseTursoConfig", () => {
  const token = "eyJhbGciOiJFZERTQSJ9.payload_part-1";

  it.each(["libsql://waves-user.turso.io", "https://waves-user.turso.io", "  libsql://db.example.com  "])(
    "accepts %s",
    (url) => {
      expect(parseTursoConfig(url, ` ${token} `)).toEqual({ databaseUrl: url.trim(), authToken: token });
    },
  );

  it.each(["", "waves.turso.io", "http://waves.turso.io", "file:///tmp/db", "libsql://user:pass@db.io", 3])(
    "rejects the URL %j",
    (url) => {
      expect(() => parseTursoConfig(url, token)).toThrow(/database URL|Turso settings/);
    },
  );

  it.each(["short", "has spaces in it here", "x".repeat(5000)])("rejects the token %j", (badToken) => {
    expect(() => parseTursoConfig("libsql://db.turso.io", badToken)).toThrow(/auth token/);
  });
});

describe("resolveTursoConfig", () => {
  const stored = { tursoDatabaseUrl: "libsql://stored.turso.io", tursoAuthToken: "stored-token" };

  it("prefers the environment when both variables are set", () => {
    const resolved = resolveTursoConfig(
      { TURSO_DATABASE_URL: "libsql://env.turso.io", TURSO_AUTH_TOKEN: "env-token" },
      stored,
    );
    expect(resolved).toEqual({
      config: { databaseUrl: "libsql://env.turso.io", authToken: "env-token" },
      source: "env",
    });
  });

  it("falls back to the stored values", () => {
    expect(resolveTursoConfig({ TURSO_DATABASE_URL: "libsql://env.turso.io" }, stored)?.source).toBe("stored");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveTursoConfig({}, {})).toBeNull();
    expect(resolveTursoConfig({}, { tursoDatabaseUrl: "libsql://only-url.turso.io" })).toBeNull();
  });
});

describe("requireNetworkPort", () => {
  it("accepts unprivileged ports", () => {
    expect(requireNetworkPort(1024)).toBe(1024);
    expect(requireNetworkPort(47836)).toBe(47836);
  });

  it.each([80, 1023, 65536, 4000.5, "47836", null])("rejects %j", (port) => {
    expect(() => requireNetworkPort(port)).toThrow(/port/);
  });
});
