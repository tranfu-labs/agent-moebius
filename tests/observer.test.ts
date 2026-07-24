import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTaskAcceptanceFactKey } from "../src/goal-ledger.js";
import type {
  GoalLedgerState,
  GoalRecord,
  IntegrationAcceptanceRecord,
  IssueReference,
  LedgerProvenance,
  MilestoneRecord,
  PhaseOwner,
  PhaseRecord,
  RunManifestReference,
  TaskAcceptanceRecord,
  TaskRecord,
} from "../src/goal-ledger.js";
import { buildObserverModel } from "../src/observer/model.js";
import { readObserverState, type ObserverRunManifestRecord } from "../src/observer/read-state.js";
import { renderObserverPage } from "../src/observer/render.js";
import { startObserverServer } from "../src/observer/server.js";

const originalPath = process.env.PATH;
const NOW = "2026-07-04T00:00:00.000Z";
const ROUNDTABLE_KEY = "moebius-roundtable-key:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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
        ".state/goal-ledger.json",
        ".state/github-response-intake.json",
        ".state/role-threads.json",
        ".state/agent-contexts.json",
        ".state/run-manifests.jsonl",
      ]),
    );
    expect(html).toContain("tranfu-labs/empty-repo");
    expect(html).toContain("没有记录");
    expect(html).toContain("目标账本缺失，树视图暂不可用。");
    expect(html).toContain("缺失");
    expect(html).not.toContain("读取失败");
  });

  it("renders ledger goal tree, unassigned tasks, task details, gates, evidence, and filtered goals", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "goal-ledger.json"), JSON.stringify(makePrimaryLedger()), "utf8");
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      `${JSON.stringify(makeManifest({ issueNumber: 81, publishedUrl: "https://example.test/linked.png" }))}\n${JSON.stringify(
        makeManifest({ issueNumber: 81, publishedUrl: "https://example.test/unlinked.png" }),
      )}\n`,
      "utf8",
    );

    const snapshot = await readObserverState({ projectRoot: root });
    const model = buildObserverModel(snapshot, new Date(NOW));
    const html = renderObserverPage(model);

    expect(snapshot.goalLedgerStatus).toBe("ok");
    expect(model.ledger.goals.map((goal) => goal.id)).toEqual(["goal-m3"]);
    expect(model.ledger.filteredGoalCount).toBe(1);
    expect(model.ledger.unlinkedRuns.map((run) => run.lineNumber)).toEqual([2]);
    expect(html).toContain("Goal M3 orchestration");
    expect(html).toContain("Milestone orchestration runtime");
    expect(html).toContain("Task T7 observer ledger UI");
    expect(html).toContain("未归属里程碑任务");
    expect(html).toContain("Task Missing references repair");
    expect(html).toContain("filtered ledger goals");
    expect(html).toContain("1 not watched");
    expect(html).toContain("other/repo issue 9");
    expect(html).toContain("not watched / no live poll status");
    expect(html).toContain("active phase: Goal active phase");
    expect(html).toContain("pending/completed phases");
    expect(html).toContain("readiness ready");
    expect(html).toContain("quality data-correct");
    expect(html).toContain("dependencies");
    expect(html).toContain("T1, T2, T4, T6");
    expect(html).toContain("scope");
    expect(html).toContain("Upgrade observer to ledger-first UI");
    expect(html).toContain("acceptance statements 2");
    expect(html).toContain("latest child acceptance");
    expect(html).toContain("passed 1, failed 1");
    expect(html).toContain("tranfu-labs/moebius issue 75");
    expect(html).toContain("waiting repair or re-acceptance by qa");
    expect(html).toContain("child issue ref other/repo issue 9");
    expect(html).toContain("waiting integration acceptance: requested");
    expect(html).toContain("integration event requested by product-manager");
    expect(html).toContain("闸口不可定位：ledger 缺 parent/child issue reference");
    expect(html).toContain("run evidence");
    expect(html).toContain(".state/run-manifests.jsonl line 1");
    expect(html).toContain("line 1 · dev · code-verified");
    expect(html).toContain("Unlinked local runs");
    expect(html).toContain("line 2 · dev · code-verified");
    expect(html).toContain("Legacy issue/run records");
    expect(html).not.toContain(ROUNDTABLE_KEY);
    expect(html).not.toContain("\"artifacts\"");
    expect(html).not.toContain("Full issue body");
  });

  it("keeps the tree available for owner-level no-active and multiple-active phase errors", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "goal-ledger.json"), JSON.stringify(makeOwnerPhaseFaultLedger()), "utf8");

    const snapshot = await readObserverState({ projectRoot: root });
    const html = renderObserverPage(buildObserverModel(snapshot, new Date(NOW)));

    expect(snapshot.goalLedgerStatus).toBe("ok");
    expect(html).toContain("Goal Owner phase tolerance");
    expect(html).toContain("Task Owner B multiple active");
    expect(html).toContain("no active phase");
    expect(html).toContain("ledger error");
    expect(html).toContain("multiple active phases: phase-task-a, phase-task-b");
    expect(html).not.toContain("账本读取失败，树视图暂不可用。");
  });

  it("distinguishes exact roundtable child notes from near-miss text without rendering hidden keys", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "goal-ledger.json"), JSON.stringify(makePrimaryLedger()), "utf8");

    const html = renderObserverPage(buildObserverModel(await readObserverState({ projectRoot: root }), new Date(NOW)));

    expect(countOccurrences(html, "roundtable child")).toBe(1);
    expect(html).toContain("ordinary provenance text");
    expect(html).toContain("moebius-roundtable-key:near-miss");
    expect(html).not.toContain(ROUNDTABLE_KEY);
    expect(html).toContain("Task Roundtable only child");
    expect(html).toContain("latest child acceptance</dt><dd>no acceptance facts");
    expect(html).toContain("waiting child acceptance by reviewer");
  });

  it("keeps legacy issue runs visible when the ledger is malformed", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "goal-ledger.json"), "{bad", "utf8");
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      `${JSON.stringify(makeManifest({ issueNumber: 50, publishedUrl: "https://example.test/t7.png" }))}\n`,
      "utf8",
    );

    const html = renderObserverPage(buildObserverModel(await readObserverState({ projectRoot: root }), new Date(NOW)));

    expect(html).toContain("账本读取失败，树视图暂不可用。");
    expect(html).toContain("Legacy issue/run records");
    expect(html).toContain("tranfu-labs/moebius#50");
    expect(html).toContain("https://example.test/t7.png");
  });

  it("times out goal ledger reads while keeping legacy issue runs visible without gh or codex", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      `${JSON.stringify(makeManifest({ issueNumber: 50, publishedUrl: "https://example.test/t7-timeout.png" }))}\n`,
      "utf8",
    );
    const fakeBin = path.join(root, "fake-bin");
    await fs.mkdir(fakeBin, { recursive: true });
    await fs.writeFile(path.join(fakeBin, "gh"), fakeCommandScript(path.join(root, "fake-gh.log"), "gh"), { mode: 0o755 });
    await fs.writeFile(path.join(fakeBin, "codex"), fakeCommandScript(path.join(root, "fake-codex.log"), "codex"), { mode: 0o755 });
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const { server, url } = await startObserverServer({
      projectRoot: root,
      port: 0,
      goalLedgerReadTimeoutMs: 25,
      readGoalLedgerFile: () => new Promise<string>(() => {}),
    });
    const startedAt = Date.now();
    try {
      const response = await fetch(url);
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(Date.now() - startedAt).toBeLessThan(1_000);
      expect(body).toContain("读取超时");
      expect(body).toContain("目标账本读取超时，树视图暂不可用。");
      expect(body).toContain("Legacy issue/run records");
      expect(body).toContain("tranfu-labs/moebius#50");
    } finally {
      await closeServer(server);
    }

    await expect(fs.stat(path.join(root, "fake-gh.log"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(root, "fake-codex.log"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps valid manifest records while diagnosing malformed JSON, missing fields, and truncated tail lines", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "role-threads.json"), "{bad", "utf8");
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      [
        JSON.stringify(makeManifest({ issueNumber: 50, publishedUrl: "https://example.test/t4.png" })),
        "not-json",
        JSON.stringify({ role: "dev", stage: "code-verified", artifacts: [], startedAt: NOW, completedAt: "2026-07-04T00:01:00.000Z" }),
        JSON.stringify({ issue: { owner: "tranfu-labs", repo: "moebius", number: 51 }, role: "dev", stage: "code-verified", startedAt: NOW, completedAt: "2026-07-04T00:01:00.000Z" }),
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
      { owner: "tranfu-labs", repo: "moebius" },
      { owner: "tranfu-labs", repo: "empty-repo" },
    ]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".state", "github-response-intake.json"),
      JSON.stringify({
        repositories: {},
        issues: {
          "tranfu-labs/moebius#50": {
            owner: "tranfu-labs",
            repo: "moebius",
            issueNumber: 50,
            updatedAt: NOW,
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: null,
          },
          "other/repo#1": {
            owner: "other",
            repo: "repo",
            issueNumber: 1,
            updatedAt: NOW,
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
        "tranfu-labs/moebius#50": { dev: { threadId: "thread-1234567890", lastSeenIndex: 7 } },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, ".state", "agent-contexts.json"),
      JSON.stringify({
        "tranfu-labs/moebius#50": {
          dev: {
            preScript: "src/agent-prescripts/dev-workspace.ts",
            owner: "tranfu-labs",
            repo: "moebius",
            issueNumber: 50,
            worktreePath: "<worktree>/moebius",
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

    expect(html).toContain("tranfu-labs/moebius#50");
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

  it("renders project issue DAG, selected run details, intake outcomes, and token cache diagnostics", async () => {
    const root = await makeFixtureRoot();
    await writeConfig(root, [
      { owner: "tranfu-labs", repo: "moebius" },
      { owner: "tranfu-labs", repo: "other-tool" },
    ]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    const firstDevRunDir = await writeRunDetails(root, "run-dev-first", {
      input: "dev first input context",
      output: "dev first output",
    });
    const secondDevRunDir = await writeRunDetails(root, "run-dev-second", {
      input:
        "dev selected input context moebius-orchestration-key:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ghp_abcdefghijklmnopqrstuvwxyz123456 /Users/wing/private/path",
      output: "dev selected output full text",
    });
    const qaRunDir = await writeRunDetails(root, "run-qa", {
      input: "qa private input context must not render with selected dev run",
      output: "qa private output text must not render with selected dev run",
    });
    await fs.writeFile(
      path.join(root, ".state", "github-response-intake.json"),
      JSON.stringify({
        repositories: {},
        issues: {
          "tranfu-labs/moebius#88": {
            owner: "tranfu-labs",
            repo: "moebius",
            issueNumber: 88,
            updatedAt: NOW,
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: null,
            lastOutcome: {
              result: "no-trigger",
              reason: "skip:no-trigger",
              recordedAt: "2026-07-04T00:04:00.000Z",
            },
          },
          "tranfu-labs/moebius#89": {
            owner: "tranfu-labs",
            repo: "moebius",
            issueNumber: 89,
            updatedAt: NOW,
            mode: "active",
            activeNoChangeCount: 0,
            nextPollAt: null,
            failureCount: 5,
            lastFailureReason: "codex:usage-limit",
          },
        },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(root, ".state", "run-manifests.jsonl"),
      [
        JSON.stringify(
          makeManifest({
            issueNumber: 88,
            runDir: firstDevRunDir,
            completedAt: "2026-07-04T00:01:00.000Z",
            usage: { inputTokens: 100, outputTokens: 30, cachedInputTokens: 80 },
          }),
        ),
        JSON.stringify(
          makeManifest({
            issueNumber: 88,
            runDir: secondDevRunDir,
            completedAt: "2026-07-04T00:02:00.000Z",
            usage: { inputTokens: 100, outputTokens: 25, cachedInputTokens: 0 },
          }),
        ),
        JSON.stringify(
          makeManifest({
            issueNumber: 88,
            role: "qa",
            runDir: qaRunDir,
            completedAt: "2026-07-04T00:03:00.000Z",
            usage: { outputTokens: 12 },
          }),
        ),
      ].join("\n"),
      "utf8",
    );

    const snapshot = await readObserverState({ projectRoot: root });
    const model = buildObserverModel(snapshot, new Date(NOW));
    const issue88 = model.repositories[0]?.issues.find((issue) => issue.number === 88);
    const issue89 = model.repositories[0]?.issues.find((issue) => issue.number === 89);
    const issue88Html = renderObserverPage(model, {
      projectKey: "tranfu-labs/moebius",
      issueKey: "tranfu-labs/moebius#88",
      runId: "run-line-2",
    });
    const issue89Html = renderObserverPage(model, {
      projectKey: "tranfu-labs/moebius",
      issueKey: "tranfu-labs/moebius#89",
    });

    expect(model.repositories.map((repository) => repository.key)).toEqual(["tranfu-labs/moebius", "tranfu-labs/other-tool"]);
    expect(issue88?.execution.nodes.map((node) => node.kind)).toEqual([
      "codex-run",
      "codex-run",
      "codex-run",
      "stuck-no-trigger",
    ]);
    expect(issue89?.execution.nodes.map((node) => node.kind)).toEqual(["dead-letter"]);
    expect(issue88Html).toContain("Project filter");
    expect(issue88Html).toContain("source WATCH_REPOSITORIES");
    expect(issue88Html).toContain("Issue execution DAG");
    expect(issue88Html).toContain("tranfu-labs/moebius#88");
    expect(issue88Html).toContain("kind=codex-run");
    expect(issue88Html).toContain("kind=stuck-no-trigger");
    expect(issue88Html).toContain("reason=skip:no-trigger");
    expect(issue88Html).toContain("dev selected input context");
    expect(issue88Html).toContain("dev selected output full text");
    expect(issue88Html).not.toContain("qa private input context");
    expect(issue88Html).not.toContain("qa private output text");
    expect(issue88Html).toContain("[hidden-key]");
    expect(issue88Html).toContain("[redacted]");
    expect(issue88Html).toContain("[local-path]");
    expect(issue88Html).not.toContain("moebius-orchestration-key:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(issue88Html).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(issue88Html).not.toContain("/Users/wing/private/path");
    expect(issue88Html).toContain("Token panel");
    expect(issue88Html).toContain("unknown 分母");
    expect(issue88Html).toContain("unknown denominator");
    expect(issue88Html).toContain("缓存疑似失效");
    expect(issue89Html).toContain("kind=dead-letter");
    expect(issue89Html).toContain("deadLetter=true");
    expect(issue89Html).toContain("reason=codex:usage-limit");
  });

  it("diagnoses malformed local config without reporting all repos as no records", async () => {
    const root = await makeFixtureRoot();
    await fs.writeFile(
      path.join(root, "config.toml"),
      `
[[watchRepositories]]
owner = "tranfu-labs"
repo = "moebius"
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
    await writeConfig(root, [{ owner: "tranfu-labs", repo: "moebius" }]);
    await fs.mkdir(path.join(root, ".state"), { recursive: true });
    await fs.writeFile(path.join(root, ".state", "goal-ledger.json"), JSON.stringify(makePrimaryLedger()), "utf8");
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
        expect(await response.text()).toContain("Goal M3 orchestration");
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
  return fs.mkdtemp(path.join(os.tmpdir(), "moebius-observer-test-"));
}

async function writeConfig(root: string, repositories: Array<{ owner: string; repo: string }>): Promise<void> {
  await fs.writeFile(
    path.join(root, "config.local.toml"),
    repositories.map((repository) => `[[watchRepositories]]\nowner = "${repository.owner}"\nrepo = "${repository.repo}"\n`).join("\n"),
    "utf8",
  );
}

function makePrimaryLedger(): GoalLedgerState {
  const parent = issueRef(75, "parent");
  const acceptedChild = issueRef(81, "child");
  const failedChild = issueRef(82, "child");
  const externalChild = issueRef(9, "child", { owner: "other", repo: "repo", note: "ordinary provenance text" });
  const nearMissChild = issueRef(10, "child", {
    owner: "other",
    repo: "repo",
    note: "moebius-roundtable-key:near-miss ordinary provenance text",
  });
  const roundtableChild = issueRef(83, "child", { note: `bounded note ${ROUNDTABLE_KEY}` });
  const runReference: RunManifestReference = {
    locator: { kind: "jsonl-line", path: ".state/run-manifests.jsonl", line: 1 },
    issue: { owner: "tranfu-labs", repo: "moebius", number: 81 },
    role: "dev",
    completedAt: "2026-07-04T00:01:00.000Z",
    stage: "code-verified",
    resolution: "linked",
  };
  const integrationEvent: IntegrationAcceptanceRecord = {
    joinKey: "join-1",
    phaseId: "phase-task-active",
    parentIssue: { owner: "tranfu-labs", repo: "moebius", number: 75 },
    reviewerRole: "product-manager",
    status: "requested",
    childPassDigest: "child-pass-digest",
    targetAcceptanceDigest: "target-acceptance-digest",
    capturedAt: "2026-07-04T00:04:00.000Z",
  };

  return {
    schemaVersion: 1,
    goals: {
      "goal-m3": goal({
        id: "goal-m3",
        title: "M3 orchestration",
        issueRefs: [parent],
        milestoneIds: ["milestone-runtime"],
      }),
      "goal-unwatched": goal({
        id: "goal-unwatched",
        title: "Unwatched goal",
        issueRefs: [issueRef(1, "source", { owner: "elsewhere", repo: "outside" })],
        provenance: [
          {
            issue: { owner: "elsewhere", repo: "outside", number: 1 },
            messageIndex: 1,
            capturedAt: NOW,
          },
        ],
      }),
    },
    milestones: {
      "milestone-runtime": milestone({
        id: "milestone-runtime",
        goalId: "goal-m3",
        title: "orchestration runtime",
        taskIds: ["task-t7"],
      }),
    },
    tasks: {
      "task-t7": task({
        id: "task-t7",
        goalId: "goal-m3",
        milestoneId: "milestone-runtime",
        title: "T7 observer ledger UI",
        scope: "Upgrade observer to ledger-first UI",
        acceptanceStatements: ["tree visible", "read-only observer"],
        dependencies: ["T1", "T2", "T4", "T6"],
        parentIssueRef: parent,
        childIssueRefs: [acceptedChild, failedChild, externalChild, nearMissChild],
        acceptanceFacts: [
          acceptanceFact(acceptedChild, "qa", "passed", "2026-07-04T00:02:00.000Z"),
          acceptanceFact(failedChild, "qa", "failed", "2026-07-04T00:03:00.000Z"),
        ],
        runManifestRefs: [runReference],
      }),
      "task-roundtable": task({
        id: "task-roundtable",
        goalId: "goal-m3",
        title: "Roundtable only child",
        childIssueRefs: [roundtableChild],
        acceptanceFacts: [acceptanceFact(roundtableChild, "ceo", "passed", "2026-07-04T00:05:00.000Z")],
      }),
      "task-missing-refs": task({
        id: "task-missing-refs",
        goalId: "goal-m3",
        title: "Missing references repair",
        childIssueRefs: [],
      }),
    },
    phases: {
      "phase-goal-active": phase({
        id: "phase-goal-active",
        owner: { kind: "goal", id: "goal-m3" },
        name: "Goal active phase",
        status: "active",
      }),
      "phase-goal-pending": phase({
        id: "phase-goal-pending",
        owner: { kind: "goal", id: "goal-m3" },
        name: "Goal pending phase",
        status: "pending",
      }),
      "phase-milestone-active": phase({
        id: "phase-milestone-active",
        owner: { kind: "milestone", id: "milestone-runtime" },
        name: "Milestone active phase",
        status: "active",
      }),
      "phase-milestone-completed": phase({
        id: "phase-milestone-completed",
        owner: { kind: "milestone", id: "milestone-runtime" },
        name: "Milestone completed phase",
        status: "completed",
      }),
      "phase-task-active": phase({
        id: "phase-task-active",
        owner: { kind: "task", id: "task-t7" },
        name: "Task active phase",
        status: "active",
        integrationAcceptance: [integrationEvent],
      }),
    },
  };
}

function makeOwnerPhaseFaultLedger(): GoalLedgerState {
  const child = issueRef(91, "child");
  return {
    schemaVersion: 1,
    goals: {
      "goal-owner-fault": goal({
        id: "goal-owner-fault",
        title: "Owner phase tolerance",
        milestoneIds: ["milestone-owner-fault"],
      }),
    },
    milestones: {
      "milestone-owner-fault": milestone({
        id: "milestone-owner-fault",
        goalId: "goal-owner-fault",
        title: "Owner phase milestone",
        taskIds: ["task-owner-b"],
      }),
    },
    tasks: {
      "task-owner-b": task({
        id: "task-owner-b",
        goalId: "goal-owner-fault",
        milestoneId: "milestone-owner-fault",
        title: "Owner B multiple active",
        childIssueRefs: [child],
      }),
    },
    phases: {
      "phase-task-a": phase({
        id: "phase-task-a",
        owner: { kind: "task", id: "task-owner-b" },
        name: "Task active A",
        status: "active",
      }),
      "phase-task-b": phase({
        id: "phase-task-b",
        owner: { kind: "task", id: "task-owner-b" },
        name: "Task active B",
        status: "active",
      }),
    },
  };
}

function goal(overrides: Partial<GoalRecord> & Pick<GoalRecord, "id" | "title">): GoalRecord {
  return {
    id: overrides.id,
    title: overrides.title,
    status: overrides.status ?? "ready",
    summary: overrides.summary ?? "Goal summary",
    scope: overrides.scope ?? "Goal scope",
    acceptanceStatements: overrides.acceptanceStatements ?? ["Goal acceptance"],
    dependencies: overrides.dependencies ?? [],
    qualityBaseline: overrides.qualityBaseline ?? "data-correct",
    issueRefs: overrides.issueRefs ?? [],
    milestoneIds: overrides.milestoneIds ?? [],
    provenance: overrides.provenance ?? [provenance(75)],
    missingFields: overrides.missingFields ?? [],
    nextQuestions: overrides.nextQuestions ?? [],
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function milestone(overrides: Partial<MilestoneRecord> & Pick<MilestoneRecord, "id" | "goalId" | "title">): MilestoneRecord {
  return {
    id: overrides.id,
    goalId: overrides.goalId,
    title: overrides.title,
    qualityBaseline: overrides.qualityBaseline ?? "data-correct",
    taskIds: overrides.taskIds ?? [],
    phaseIds: overrides.phaseIds ?? [],
    issueRefs: overrides.issueRefs ?? [],
    provenance: overrides.provenance ?? [provenance(75)],
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function task(overrides: Partial<TaskRecord> & Pick<TaskRecord, "id" | "goalId" | "title">): TaskRecord {
  return {
    id: overrides.id,
    goalId: overrides.goalId,
    ...(overrides.milestoneId === undefined ? {} : { milestoneId: overrides.milestoneId }),
    title: overrides.title,
    status: overrides.status ?? "ready",
    scope: overrides.scope ?? "Task scope",
    acceptanceStatements: overrides.acceptanceStatements ?? ["Task acceptance"],
    dependencies: overrides.dependencies ?? [],
    qualityBaseline: overrides.qualityBaseline ?? "data-correct",
    phaseIds: overrides.phaseIds ?? [],
    ...(overrides.parentIssueRef === undefined ? {} : { parentIssueRef: overrides.parentIssueRef }),
    childIssueRefs: overrides.childIssueRefs ?? [],
    acceptanceFacts: overrides.acceptanceFacts ?? [],
    runManifestRefs: overrides.runManifestRefs ?? [],
    provenance: overrides.provenance ?? [provenance(75)],
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

function phase(overrides: Partial<PhaseRecord> & Pick<PhaseRecord, "id" | "owner" | "name" | "status">): PhaseRecord {
  return {
    id: overrides.id,
    owner: overrides.owner,
    name: overrides.name,
    status: overrides.status,
    qualityBaseline: overrides.qualityBaseline ?? "data-correct",
    objective: overrides.objective ?? "Phase objective",
    acceptanceStatements: overrides.acceptanceStatements ?? ["Phase acceptance"],
    dependencies: overrides.dependencies ?? [],
    integrationAcceptance: overrides.integrationAcceptance ?? [],
    provenance: overrides.provenance ?? [provenance(75)],
    ...(overrides.startedAt === undefined ? {} : { startedAt: overrides.startedAt }),
    ...(overrides.completedAt === undefined ? {} : { completedAt: overrides.completedAt }),
  };
}

function issueRef(
  number: number,
  relation: IssueReference["relation"],
  overrides: Partial<IssueReference> = {},
): IssueReference {
  return {
    owner: overrides.owner ?? "tranfu-labs",
    repo: overrides.repo ?? "moebius",
    number,
    relation,
    status: overrides.status ?? "open",
    ...(overrides.note === undefined ? {} : { note: overrides.note }),
  };
}

function provenance(number: number): LedgerProvenance {
  return {
    issue: { owner: "tranfu-labs", repo: "moebius", number },
    messageIndex: 1,
    capturedAt: NOW,
  };
}

function acceptanceFact(
  reference: IssueReference,
  role: string,
  status: TaskAcceptanceRecord["status"],
  capturedAt: string,
): TaskAcceptanceRecord {
  const statementResults = [{ id: "statement-1", status, statement: "Task acceptance" }];
  const issue = { owner: reference.owner, repo: reference.repo, number: reference.number };
  return {
    factKey: buildTaskAcceptanceFactKey({
      issue,
      statementResults,
      messageIndex: 10,
    }),
    issue,
    role,
    status,
    statementResults,
    messageIndex: 10,
    capturedAt,
  };
}

function makeManifest(input: {
  owner?: string;
  repo?: string;
  issueNumber: number;
  role?: string;
  completedAt?: string;
  runDir?: string;
  usage?: ObserverRunManifestRecord["usage"];
  publishedUrl?: string | null;
  extraArtifacts?: ObserverRunManifestRecord["artifacts"];
}): ObserverRunManifestRecord {
  return {
    issue: {
      owner: input.owner ?? "tranfu-labs",
      repo: input.repo ?? "moebius",
      number: input.issueNumber,
    },
    ...(input.runDir === undefined ? {} : { runDir: input.runDir }),
    role: input.role ?? "dev",
    stage: "code-verified",
    artifacts: [
      {
        path: "output-artifacts/t7.png",
        publishedUrl: input.publishedUrl ?? null,
      },
      ...(input.extraArtifacts ?? []),
    ],
    startedAt: NOW,
    completedAt: input.completedAt ?? "2026-07-04T00:01:00.000Z",
    ...(input.usage === undefined ? {} : { usage: input.usage }),
  };
}

async function writeRunDetails(
  root: string,
  name: string,
  content: { input: string; output: string },
): Promise<string> {
  const runDir = path.join(root, "runs", name);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "input.jsonl"), content.input, "utf8");
  await fs.writeFile(path.join(runDir, "stdout.jsonl"), content.output, "utf8");
  return runDir;
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

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
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
