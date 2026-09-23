import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, defaultDocsDir, loadConfig } from "../config.js";

const key = (env: "dev" | "stg" | "prd") => `crk_${env}_0123456789abcdefghijkl_${"s".repeat(43)}`;

function refusal(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as Error).message;
  }
  throw new Error("expected loadConfig to refuse");
}

describe("loadConfig", () => {
  it("defaults to staging with the staging URL and the repo docs dir", () => {
    const config = loadConfig({ CITYROAM_API_KEY_STAGING: key("stg") });
    expect(config.env).toBe("staging");
    expect(config.apiUrl).toBe("https://api-staging.cityroam.co.uk");
    expect(config.apiKey).toBe(key("stg"));
    expect(config.docsDir).toBe(defaultDocsDir());
    expect(config.docsDir.endsWith(path.join("docs", "llm-authoring"))).toBe(true);
    expect(config.imageRoots).toEqual([]);
  });

  it("uses the local URL and crk_dev_ keys for local", () => {
    const config = loadConfig({ CITYROAM_ENV: "local", CITYROAM_API_KEY_LOCAL: key("dev") });
    expect(config.apiUrl).toBe("http://localhost:3001");
  });

  it("refuses production without CITYROAM_ALLOW_PRODUCTION=1", () => {
    const msg = refusal({ CITYROAM_ENV: "production", CITYROAM_API_KEY_PRODUCTION: key("prd") });
    expect(msg).toContain("CITYROAM_ALLOW_PRODUCTION=1");
    expect(refusal({ CITYROAM_ENV: "production", CITYROAM_ALLOW_PRODUCTION: "true", CITYROAM_API_KEY_PRODUCTION: key("prd") })).toContain(
      "CITYROAM_ALLOW_PRODUCTION=1",
    );
  });

  it("starts against production with both opt-ins and a crk_prd_ key", () => {
    const config = loadConfig({
      CITYROAM_ENV: "production",
      CITYROAM_ALLOW_PRODUCTION: "1",
      CITYROAM_API_KEY_PRODUCTION: key("prd"),
    });
    expect(config.env).toBe("production");
    expect(config.apiUrl).toBe("https://api.cityroam.co.uk");
  });

  it.each([
    ["staging", "CITYROAM_API_KEY_STAGING", key("prd"), "crk_stg_"],
    ["staging", "CITYROAM_API_KEY_STAGING", key("dev"), "crk_stg_"],
    ["local", "CITYROAM_API_KEY_LOCAL", key("stg"), "crk_dev_"],
  ] as const)("refuses a key whose prefix does not match %s", (env, keyVar, value, expected) => {
    const msg = refusal({ CITYROAM_ENV: env, [keyVar]: value });
    expect(msg).toContain(expected);
    expect(msg).not.toContain(value);
  });

  it("refuses a production config holding a staging key", () => {
    const msg = refusal({ CITYROAM_ENV: "production", CITYROAM_ALLOW_PRODUCTION: "1", CITYROAM_API_KEY_PRODUCTION: key("stg") });
    expect(msg).toContain("crk_prd_");
    expect(msg).toContain('"crk_stg_"');
  });

  it("refuses a missing key, naming the variable", () => {
    expect(refusal({})).toContain("CITYROAM_API_KEY_STAGING");
    // A key for another environment does not count.
    expect(refusal({ CITYROAM_API_KEY_PRODUCTION: key("prd") })).toContain("CITYROAM_API_KEY_STAGING");
  });

  it("refuses an unknown CITYROAM_ENV", () => {
    expect(refusal({ CITYROAM_ENV: "prod", CITYROAM_API_KEY_STAGING: key("stg") })).toContain("CITYROAM_ENV");
  });

  it("honours CITYROAM_API_URL, CITYROAM_DOCS_DIR and CITYROAM_IMAGE_ROOTS", () => {
    const roots = [path.resolve("a"), path.resolve("b")];
    const config = loadConfig({
      CITYROAM_API_KEY_STAGING: key("stg"),
      CITYROAM_API_URL: "https://staging.example.test/",
      CITYROAM_DOCS_DIR: "some/docs",
      CITYROAM_IMAGE_ROOTS: roots.join(path.delimiter) + path.delimiter,
    });
    expect(config.apiUrl).toBe("https://staging.example.test");
    expect(config.docsDir).toBe(path.resolve("some/docs"));
    expect(config.imageRoots).toEqual(roots);
  });

  it("refuses a malformed CITYROAM_API_URL", () => {
    expect(refusal({ CITYROAM_API_KEY_STAGING: key("stg"), CITYROAM_API_URL: "ftp://x" })).toContain("CITYROAM_API_URL");
  });
});
