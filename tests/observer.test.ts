import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildObserverModel } from "../src/observer/model.js";
import { readObserverState, type ObserverRunManifestRecord } from "../src/observer/read-state.js";
import { renderObserverPage } from "../src/observer/render.js";
import { startObserverServer } from "../src/observer/server.js";

const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
});

describe("observer", () => {
  it("shows a no-records state when whitelisted repos have no state files", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "empty-repo" }]);

    const snapshot = await readObserverState({ projectRoot: root });
    const model = buildObserverModel(snapshot, new Date("2026-07-04T00:00:00.000Z"));
    const html = renderObserverPage(model);

    expect(model.repositories).toHaveLength(1);
    expect(model.repositories[0]?.hasRecords).toBe(false);
    expect(snapshot.diagnostics.filter((diagnostic) => diagnostic.status === "error")).toEqual([]);
    expect(snapshot.diagnostics.filter((diagnostic) => diagnostic.status === "missing").map((diagnostic) => diagnostic.source)).toEqual(
      expect.arrayContaining([
        "config.toml",
        ".state/github-response-intake.json",
        ".state/role-threads.json",
        ".state/agent-contexts.json",
        ".state/run-manifests.jsonl",
      ]),
    );
    expect(html).toContain("tranfu-labs/empty-repo");
    expect(html).toContain("没有记录");
    expect(html).toContain("缺失");
    expect(html).not.toContain("读取失败");
  });

  it("keeps valid manifest records while diagnosing malformed JSON, missing fields, and truncated tail lines", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "agent-moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "role-threads.json"), "{bad", "utf8");
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      [
        JSON.stringify(makeManifest({ issueNumber: 50, publishedUrl: "https://example.test/t4.png" })),
        "not-json",
        JSON.stringify({ role: "dev", stage: "code-verified", artifacts: [], startedAt: "2026-07-04T00:00:00.000Z", completedAt: "2026-07-04T00:01:00.000Z" }),
        JSON.stringify({ issue: { owner: "tranfu-labs", repo: "agent-moebius", number: 51 }, role: "dev", stage: "code-verified", startedAt: "2026-07-04T00:00:00.000Z", completedAt: "2026-07-04T00:01:00.000Z" }),
        '{"issue":',
      ].join("\n"),
      "utf8",
    );

    const snapshot = await readObserverState({ projectRoot: root });
    const model = buildObserverModel(snapshot);
    const html = renderObserverPage(model);

    expect(snapshot.runManifests).toHaveLength(1);
    expect(model.repositories[0]?.issues.map((issue) => issue.number)).toEqual([50]);
    expect(html).toContain("读取失败");
    expect(html).toContain("第 2 行跳过");
    expect(html).toContain("缺字段 issue");
    expect(html).toContain("缺字段 artifacts");
    expect(html).toContain("第 5 行跳过");
    expect(html).toContain("https://example.test/t4.png");
    expect(html).toContain("<img");
  });

  it("aggregates whitelisted issue sources and renders published and unpublished artifacts", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [
      { owner: "tranfu-labs", repo: "agent-moebius" },
      { owner: "tranfu-labs", repo: "empty-repo" },
    ]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".state", "github-response-intake.json"),
      JSON.stringify({
        repositories: {},
        issues: {
          "tranfu-labs/agent-moebius#50": {
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 50,
            updatedAt: "2026-07-04T00:00:00.000Z",
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: null,
          },
          "other/repo#1": {
            owner: "other",
            repo: "repo",
            issueNumber: 1,
            updatedAt: "2026-07-04T00:00:00.000Z",
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: null,
          },
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, ".state", "role-threads.json"),
      JSON.stringify({
        "tranfu-labs/agent-moebius#50": { dev: { threadId: "thread-1234567890", lastSeenIndex: 7 } },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, ".state", "agent-contexts.json"),
      JSON.stringify({
        "tranfu-labs/agent-moebius#50": {
          dev: {
            preScript: "src/agent-prescripts/dev-workspace.ts",
            owner: "tranfu-labs",
            repo: "agent-moebius",
            issueNumber: 50,
            worktreePath: "<worktree>/agent-moebius",
            preparedFromMessageIndex: 4,
          },
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      `${JSON.stringify(
        makeManifest({
          issueNumber: 50,
          publishedUrl: "https://example.test/t4.png?download=1",
          extraArtifacts: [{ path: "output-artifacts/draft.png", publishedUrl: null }],
        }),
      )}\n${JSON.stringify(makeManifest({ owner: "other", repo: "repo", issueNumber: 1 }))}\n`,
      "utf8",
    );

    const html = renderObserverPage(buildObserverModel(await readObserverState({ projectRoot: root })));

    expect(html).toContain("tranfu-labs/agent-moebius#50");
    expect(html).toContain("intake");
    expect(html).toContain("role threads");
    expect(html).toContain("agent contexts");
    expect(html).toContain("lastSeenIndex");
    expect(html).toContain("worktreePath");
    expect(html).toContain("https://example.test/t4.png?download=1");
    expect(html).toContain("<img");
    expect(html).toContain("未发布");
    expect(html).toContain("output-artifacts/draft.png");
    expect(html).toContain("tranfu-labs/empty-repo");
    expect(html).toContain("没有记录");
    expect(html).not.toContain("other/repo#1");
  });

  it("diagnoses malformed local config without reporting all repos as no records", async () => {
    const root = await makeFixtureRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      `
[[watchRepositories]]
owner = "tranfu-labs"
repo = "agent-moebius"
`,
      "utf8",
    );
    await fs.writeFile(path.join(root, "config.local.toml"), '[[watchRepositories]]\nowner = "unterminated', "utf8");

    const html = renderObserverPage(buildObserverModel(await readObserverState({ projectRoot: root })));

    expect(html).toContain("配置读取失败");
    expect(html).toContain("暂不展示 issue 记录");
    expect(html).not.toContain("没有记录");
  });

  it("serves the page without modifying files or invoking gh and codex", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "agent-moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      `${JSON.stringify(makeManifest({ issueNumber: 50, publishedUrl: "https://example.test/t4.png" }))}\n`,
      "utf8",
    );
    await fs.mkdir(path.join(root, "release-assets"), { recursive: true });
    await fs.writeFile(path.join(root, "release-assets", "existing.txt"), "unchanged", "utf8");
    const fakeBin = path.join(root, "fake-bin");
    await fs.mkdir(fakeBin, { recursive: true });
    await fs.writeFile(path.join(fakeBin, "gh"), fakeCommandScript(path.join(root, "fake-gh.log"), "gh"), { mode: 0o755 });
    await fs.writeFile(path.join(fakeBin, "codex"), fakeCommandScript(path.join(root, "fake-codex.log"), "codex"), { mode: 0o755 });
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;
    const before = await snapshotFiles(root);

    const { server, url } = await startObserverServer({ projectRoot: root, port: 0 });
    try {
      for (let index = 0; index < 3; index += 1) {
        const response = await fetch(url);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("tranfu-labs/agent-moebius#50");
      }
    } finally {
      await closeServer(server);
    }

    await expect(fs.stat(path.join(root, "fake-gh.log"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(root, "fake-codex.log"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await snapshotFiles(root)).toEqual(before);
  });
});

async function makeFixtureRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-observer-test-"));
}

async function writeConfig(root: string, repositories: Array<{ owner: string; repo: string }>): Promise<void> {
  await fs.writeFile(
    path.join(root, "config.local.toml"),
    repositories.map((repository) => `[[watchRepositories]]\nowner = "${repository.owner}"\nrepo = "${repository.repo}"\n`).join("\n"),
    "utf8",
  );
}

function makeManifest(input: {
  owner?: string;
  repo?: string;
  issueNumber: number;
  publishedUrl?: string | null;
  extraArtifacts?: ObserverRunManifestRecord["artifacts"];
}): ObserverRunManifestRecord {
  return {
    issue: {
      owner: input.owner ?? "tranfu-labs",
      repo: input.repo ?? "agent-moebius",
      number: input.issueNumber,
    },
    role: "dev",
    stage: "code-verified",
    artifacts: [
      {
        path: "output-artifacts/t4.png",
        publishedUrl: input.publishedUrl ?? null,
      },
      ...(input.extraArtifacts ?? []),
    ],
    startedAt: "2026-07-04T00:00:00.000Z",
    completedAt: "2026-07-04T00:01:00.000Z",
  };
}

async function snapshotFiles(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  await walk(root, async (filePath) => {
    const relative = path.relative(root, filePath).split(path.sep).join(path.posix.sep);
    snapshot[relative] = await fs.readFile(filePath, "utf8");
  });
  return snapshot;
}

function fakeCommandScript(logPath: string, label: string): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(logPath)}, ${JSON.stringify(label)});
process.exit(1);
`;
}

async function walk(dir: string, visitFile: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, visitFile);
    } else if (entry.isFile()) {
      await visitFile(entryPath);
    }
  }
}

async function closeServer(server: import("node:http").Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
