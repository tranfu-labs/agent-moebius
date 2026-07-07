import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "../src/config.js";
import { DEFAULT_LOCAL_CONFIG, loadLocalConfig, loadMergedLocalConfig, parseLocalConfig } from "../src/local-config.js";

describe("local config", () => {
  it("uses an empty repository whitelist when config.local.toml does not exist", async () => {
    const filePath = path.join(await makeTempDir(), "config.local.toml");

    expect(loadLocalConfig(filePath)).toEqual(DEFAULT_LOCAL_CONFIG);
  });

  it("parses TOML repository whitelist entries", () => {
    expect(
      parseLocalConfig(`
[[watchRepositories]]
owner = " tranfu-labs "
repo = " tranfu-agents-app "

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

  it("treats a pure-comment config as an empty repository whitelist", () => {
    expect(parseLocalConfig("# example only\n")).toEqual(DEFAULT_LOCAL_CONFIG);
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

  it("loads config.local.toml from disk", async () => {
    const filePath = path.join(await makeTempDir(), "config.local.toml");
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

  it("loads config.toml defaults and lets config.local.toml override them", async () => {
    const dir = await makeTempDir();
    const configPath = path.join(dir, "config.toml");
    const localConfigPath = path.join(dir, "config.local.toml");

    await fs.writeFile(
      configPath,
      `
[[watchRepositories]]
owner = "tranfu-labs"
repo = "default-repo"
`,
      "utf8",
    );

    expect(loadMergedLocalConfig({ configPath, localConfigPath })).toEqual({
      watchRepositories: [{ owner: "tranfu-labs", repo: "default-repo" }],
    });

    await fs.writeFile(
      localConfigPath,
      `
[[watchRepositories]]
owner = "tranfu-labs"
repo = "local-repo"
`,
      "utf8",
    );

    expect(loadMergedLocalConfig({ configPath, localConfigPath })).toEqual({
      watchRepositories: [{ owner: "tranfu-labs", repo: "local-repo" }],
    });
  });

  it("resolves runtime config and agents paths from the data root override", () => {
    expect(
      resolveRuntimePaths({
        projectRoot: "/repo/agent-moebius",
        env: { AGENT_MOEBIUS_DATA_ROOT: "/Users/test/.agent-moebius" },
      }),
    ).toEqual({
      projectRoot: "/repo/agent-moebius",
      dataRoot: "/Users/test/.agent-moebius",
      configPath: "/Users/test/.agent-moebius/config.toml",
      localConfigPath: "/Users/test/.agent-moebius/config.local.toml",
      agentsDir: "/Users/test/.agent-moebius/agents",
    });
  });

  it("keeps runtime paths on the project root when the data root override is absent", () => {
    expect(resolveRuntimePaths({ projectRoot: "/repo/agent-moebius", env: {} })).toEqual({
      projectRoot: "/repo/agent-moebius",
      dataRoot: "/repo/agent-moebius",
      configPath: "/repo/agent-moebius/config.toml",
      localConfigPath: "/repo/agent-moebius/config.local.toml",
      agentsDir: "/repo/agent-moebius/agents",
    });
  });
});

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-local-config-test-"));
}
