import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_CONFIG, loadLocalConfig, parseLocalConfig } from "../src/local-config.js";

describe("local config", () => {
  it("uses an empty repository whitelist when config.local does not exist", async () => {
    const filePath = path.join(await makeTempDir(), "config.local");

    expect(loadLocalConfig(filePath)).toEqual(DEFAULT_LOCAL_CONFIG);
  });

  it("parses TOML repository whitelist entries", () => {
    expect(
      parseLocalConfig(`
[[watchRepositories]]
owner = "tranfu-labs"
repo = "tranfu-agents-app"

[[watchRepositories]]
owner = "tranfu-labs"
repo = "agent-moebius"
`),
    ).toEqual({
      watchRepositories: [
        { owner: "tranfu-labs", repo: "tranfu-agents-app" },
        { owner: "tranfu-labs", repo: "agent-moebius" },
      ],
    });
  });

  it("fails fast when TOML cannot be parsed", () => {
    expect(() => parseLocalConfig('[[watchRepositories]]\nowner = "unterminated')).toThrow(/Invalid local config TOML/);
  });

  it("fails fast when repository entries have invalid shape", () => {
    expect(() =>
      parseLocalConfig(`
[[watchRepositories]]
owner = ""
repo = "agent-moebius"
`),
    ).toThrow(/Invalid local config shape/);
  });

  it("loads config.local from disk", async () => {
    const filePath = path.join(await makeTempDir(), "config.local");
    await fs.writeFile(
      filePath,
      `
[[watchRepositories]]
owner = "tranfu-labs"
repo = "agent-moebius"
`,
      "utf8",
    );

    expect(loadLocalConfig(filePath)).toEqual({
      watchRepositories: [{ owner: "tranfu-labs", repo: "agent-moebius" }],
    });
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-local-config-test-"));
}
