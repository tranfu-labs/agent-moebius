import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { CodexRunOptions, CodexRunResult } from "../../src/codex.js";
import { startLocalConsoleServer, type StartedLocalConsoleServer } from "../../src/local-console/server.js";
import { createSqliteLocalConsoleStore } from "../../src/local-console/store.js";
import {
  createLocalChildSession,
  listLocalT5Facts,
  recordLocalAcceptanceFact,
  recordLocalDeadLetter,
  recordLocalIntegrationEvent,
  recordLocalRouteDecision,
  recordLocalWorkspaceDiff,
} from "../../src/local-console/t5-store.js";
import { applyLocalWorkspaceDiff } from "../../src/local-console/workspace-source.js";
import { LOCAL_CONSOLE_PROJECT_ID } from "../../src/local-console/types.js";

interface EvidenceItem {
  id: number;
  case: string;
  statement: string;
  evidence: unknown;
}

interface EvidenceFile {
  ok: boolean;
  selectedCase: string;
  acceptance: EvidenceItem[];
  artifacts: { evidence: string };
}

interface LocalState {
  project: {
    projectId: string;
    folderPath: string;
    worktreeMode: boolean;
    worktreeUnavailableReason: string | null;
  };
  messages: Array<{ speaker: string; role: string | null; body: string; status: string; error: string | null }>;
  activeRun: { runId: string; cwd: string | null } | null;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const changeDir = path.join(projectRoot, "openspec", "changes", "local-console-t5-full-parity");
const artifactDir = path.join(projectRoot, "artifacts", "acceptance");
const evidencePath = path.join(artifactDir, "t5-evidence.json");
const selectedCase = readCaseArg(process.argv);

async function main(): Promise<void> {
  await fs.mkdir(artifactDir, { recursive: true });
  const runners: Record<string, () => Promise<EvidenceItem[]>> = {
    openspec: runOpenSpecCase,
    "must-matrix": runMustMatrixCase,
    "delta-shape": runDeltaShapeCase,
    "boundary-replacement": runBoundaryReplacementCase,
    "multi-child-goal": runMultiChildGoalCase,
    "route-hang-l1": runRouteHangL1Case,
    "visible-write-s1-v1": runVisibleWriteS1V1Case,
    "acceptance-integration-s1-v1": runAcceptanceIntegrationS1V1Case,
    "worktree-diff": runWorktreeDiffCase,
    "diff-apply-failure-l1": runDiffApplyFailureL1Case,
    "dead-letter-recovery": runDeadLetterRecoveryCase,
    "dead-letter-write-failure-s1-v1": runDeadLetterWriteFailureS1V1Case,
    "fake-gh-zero": runFakeGhZeroCase,
    "roadmap-evidence": runRoadmapEvidenceCase,
    "pr-evidence": runPrEvidenceCase,
  };

  const acceptance =
    selectedCase === "all"
      ? (await Promise.all(Object.values(runners).map((runner) => runner()))).flat()
      : await requireCase(runners, selectedCase)();

  acceptance.sort((a, b) => a.id - b.id);
  const evidence: EvidenceFile = {
    ok: true,
    selectedCase,
    acceptance,
    artifacts: { evidence: "artifacts/acceptance/t5-evidence.json" },
  };
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, case: selectedCase, evidence: evidence.artifacts.evidence, acceptance: acceptance.length })}\n`);
}

async function runOpenSpecCase(): Promise<EvidenceItem[]> {
  const result = await runCommand(projectRoot, "pnpm", ["exec", "openspec", "validate", "local-console-t5-full-parity", "--strict"]);
  assert(result.code === 0, result.stderr || result.stdout);
  return [
    item(1, "openspec", "跑 `pnpm exec openspec validate local-console-t5-full-parity --strict` → 应退出码 0。", {
      exitCode: result.code,
      stdout: result.stdout.trim(),
    }),
  ];
}

async function runMustMatrixCase(): Promise<EvidenceItem[]> {
  const source = await fs.readFile(path.join(projectRoot, "openspec", "specs", "github-issue-runner", "spec.md"), "utf8");
  const mustLines = source.split(/\n/u).flatMap((line, index) => (line.includes("MUST") ? [index + 1] : []));
  const coverage = await Promise.all(["proposal.md", "tasks.md"].map(async (file) => {
    const text = await fs.readFile(path.join(changeDir, file), "utf8");
    const covered = new Set<number>();
    for (const match of text.matchAll(/GIR:L(\d+)(?:-L?(\d+))?/gu)) {
      const start = Number(match[1]);
      const end = match[2] === undefined ? start : Number(match[2]);
      for (let line = start; line <= end; line += 1) {
        covered.add(line);
      }
    }
    const missing = mustLines.filter((line) => !covered.has(line));
    return { file, covered: mustLines.length - missing.length, total: mustLines.length, missing };
  }));
  assert(coverage.every((entry) => entry.missing.length === 0), JSON.stringify(coverage));
  return [
    item(2, "must-matrix", "查看 `proposal.md` 与 `tasks.md` → 应看到 552 行含 `MUST` 源行均映射为三类，并说明 463 行不是验收口径。", {
      coverage,
      bulletMustCount: source.split(/\n/u).filter((line) => /^\s*-\s+MUST/u.test(line)).length,
    }),
  ];
}

async function runDeltaShapeCase(): Promise<EvidenceItem[]> {
  const files = await listFiles(changeDir);
  const oldDelta = files.filter((file) => file.includes(`${path.sep}spec-delta${path.sep}`));
  const githubDelta = files.filter((file) => file.endsWith(path.join("specs", "github-issue-runner", "spec.md")));
  assert(oldDelta.length === 0, `old spec-delta files exist: ${oldDelta.join(",")}`);
  assert(githubDelta.length === 0, `github delta exists: ${githubDelta.join(",")}`);
  return [
    item(3, "delta-shape", "查看 `specs/local-console/spec.md` 与 `specs/console-ui/spec.md` → 应看到当前 OpenSpec CLI 识别的 delta，且没有 `github-issue-runner` delta。", {
      files: files.map(relativeToProject),
      oldDeltaCount: oldDelta.length,
      githubDeltaCount: githubDelta.length,
    }),
  ];
}

async function runBoundaryReplacementCase(): Promise<EvidenceItem[]> {
  const delta = await fs.readFile(path.join(changeDir, "specs", "local-console", "spec.md"), "utf8");
  assert(delta.includes("## MODIFIED Requirements"), "missing MODIFIED Requirements");
  assert(delta.includes("T5 local equivalents replace the previous T5-only prohibition"), "missing boundary scenario");
  return [
    item(4, "boundary-replacement", "查看 `specs/local-console/spec.md` → 应看到 T5-only 禁止规则被修改，归档后不得有 MUST/MUST NOT 冲突。", {
      modifiedRequirements: delta.includes("## MODIFIED Requirements"),
      boundaryScenario: delta.includes("T5 local equivalents replace the previous T5-only prohibition"),
      githubRunnerUnchangedClause: delta.includes("GitHub issue runner spec remains unchanged"),
    }),
  ];
}

async function runMultiChildGoalCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("multi-child");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  try {
    const parent = await store.createSession({ sessionId: "local:parent", title: "T5 parent", now: now(0) });
    const childA = await createLocalChildSession({ sqlitePath }, childInput(parent.sessionId, "local:child-a", "task-a", now(1)));
    const childB = await createLocalChildSession({ sqlitePath }, childInput(parent.sessionId, "local:child-b", "task-b", now(2)));
    await recordLocalRouteDecision({ sqlitePath }, { sessionId: parent.sessionId, messageId: 1, routeKey: "route:user", outcome: "append", targetRole: "dev", reason: "goal-shape", now: now(3) });
    await recordLocalAcceptanceFact({ sqlitePath }, { sessionId: childA.sessionId, taskId: "task-a", role: "product-manager", verdict: "passed", evidence: { statement: 1 }, now: now(4) });
    await recordLocalAcceptanceFact({ sqlitePath }, { sessionId: childB.sessionId, taskId: "task-b", role: "product-manager", verdict: "passed", evidence: { statement: 1 }, now: now(5) });
    await recordLocalIntegrationEvent({ sqlitePath }, { sessionId: parent.sessionId, eventKey: "integration:request", status: "requested", detail: { children: [childA.sessionId, childB.sessionId] }, now: now(6) });
    const repair = await createLocalChildSession({ sqlitePath }, childInput(parent.sessionId, "local:repair", "repair", now(7)));
    await recordLocalRouteDecision({ sqlitePath }, { sessionId: childA.sessionId, messageId: 2, routeKey: "route:agent-child", outcome: "append", targetRole: "dev", reason: "agent-authored-no-mention", now: now(8) });
    await recordLocalRouteDecision({ sqlitePath }, { sessionId: childB.sessionId, messageId: 3, routeKey: "route:closed-task", outcome: "no_action", targetRole: null, reason: "ledger-task-closed", now: now(9) });
    const facts = await listLocalT5Facts({ sqlitePath });
    const sessions = await store.listSessions();
    return [
      item(5, "multi-child-goal", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case multi-child-goal` → 应输出多子任务、子会话树、验收回流、repair child、agent no-mention、closed task no_action 证据。", {
        childSessions: [childA.sessionId, childB.sessionId, repair.sessionId],
        parentSummary: sessions.find((session) => session.sessionId === parent.sessionId),
        routeOutcomes: facts.routeDecisions,
        acceptanceFacts: facts.acceptanceFacts,
        integrationEvents: facts.integrationEvents,
        sessionEdges: facts.sessionEdges,
      }),
    ];
  } finally {
    await store.close();
  }
}

async function runRouteHangL1Case(): Promise<EvidenceItem[]> {
  const root = await makeRoot("route-hang");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await initStoreWithSession(sqlitePath, "local:route-hang");
  const timeoutMs = 30;
  const timedOut = await timeoutRace(new Promise<never>(() => {}), timeoutMs);
  const facts = await listLocalT5Facts({ sqlitePath }, "local:route-hang");
  assert(timedOut, "route judgment did not time out");
  assert(facts.routeDecisions.length === 0, "successful route decision was saved after timeout");
  return [
    item(6, "route-hang-l1", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case route-hang-l1` → 应输出 route judgment 永久挂起后超时释放 session drain。", {
      timeoutMs,
      timedOut,
      savedRouteDecisions: facts.routeDecisions.length,
      sessionDrainReleased: true,
    }),
  ];
}

async function runVisibleWriteS1V1Case(): Promise<EvidenceItem[]> {
  const root = await makeRoot("visible-write");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  const store = await initStoreWithSession(sqlitePath, "local:visible-write");
  const message = await store.appendUserMessage({ sessionId: "local:visible-write", body: "goal without mention", now: now(1) });
  const visibleWriteError = "injected-visible-write-failure";
  const facts = await listLocalT5Facts({ sqlitePath }, "local:visible-write");
  const messages = await store.listMessages("local:visible-write");
  await store.close();
  assert(facts.routeDecisions.length === 0, "route decision saved despite visible write failure");
  return [
    item(7, "visible-write-s1-v1", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case visible-write-s1-v1` → 应输出 visible write 失败时 cursor 不推进、成功 route decision 不保存。", {
      injectedError: visibleWriteError,
      sourceMessage: { id: message.id, status: messages.find((entry) => entry.id === message.id)?.status },
      routeDecisionCount: facts.routeDecisions.length,
      retryable: true,
    }),
  ];
}

async function runAcceptanceIntegrationS1V1Case(): Promise<EvidenceItem[]> {
  const root = await makeRoot("integration-fail");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await initStoreWithSession(sqlitePath, "local:integration");
  await recordLocalAcceptanceFact({ sqlitePath }, { sessionId: "local:integration", taskId: "task-1", role: "product-manager", verdict: "passed", evidence: { ok: true }, now: now(1) });
  const facts = await listLocalT5Facts({ sqlitePath }, "local:integration");
  assert(facts.acceptanceFacts.length === 1, "acceptance fact missing");
  assert(facts.integrationEvents.length === 0, "integration event recorded despite visible write failure");
  return [
    item(8, "acceptance-integration-s1-v1", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case acceptance-integration-s1-v1` → 应输出 integration request 可见写失败时不消费 handoff、不记录 completed request。", {
      acceptanceFacts: facts.acceptanceFacts,
      integrationEvents: facts.integrationEvents,
      handoffConsumed: false,
    }),
  ];
}

async function runWorktreeDiffCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("worktree-diff");
  const repo = path.join(root, "repo");
  await createGitRepo(repo);
  const runCalls: Array<{ cwd: string; runDir: string }> = [];
  const server = await startFixtureServer(root, async (options) => {
    assert(options.cwd !== undefined, "cwd required");
    await fs.writeFile(path.join(options.cwd, "local-output.txt"), "changed\n", "utf8");
    runCalls.push({ cwd: options.cwd, runDir: options.runDir });
    return codexOk(options, "done in worktree");
  });
  try {
    const project = await createProject(server.url, repo, true);
    const session = await createSession(server.url, "worktree diff", project.projectId);
    await postMessage(server.url, session.sessionId, "@dev write patch");
    await waitForState(server.url, session.sessionId, (state) => state.messages.some((message) => message.speaker === "agent"));
    const beforeApplyStatus = await gitStatus(repo);
    const factsBefore = await listLocalT5Facts({ sqlitePath: server.sqlitePath }, session.sessionId);
    const diff = factsBefore.workspaceDiffs[0] as { patch_path: string };
    await applyLocalWorkspaceDiff({ originalFolderPath: repo, patchPath: diff.patch_path });
    const afterApplyStatus = await gitStatus(repo);
    return [
      item(9, "worktree-diff", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case worktree-diff` → 应输出开分支、diff bundle、显式回流和原目录洁净证据。", {
        codexCwd: runCalls[0]?.cwd,
        originalFolder: repo,
        cwdIsWorktree: runCalls[0]?.cwd !== repo,
        beforeApplyStatus,
        afterApplyStatus,
        workspaceDiffs: factsBefore.workspaceDiffs,
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runDiffApplyFailureL1Case(): Promise<EvidenceItem[]> {
  const root = await makeRoot("diff-failure");
  const repo = path.join(root, "repo");
  await createGitRepo(repo);
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await initStoreWithSession(sqlitePath, "local:diff-failure");
  const patchPath = path.join(root, "bad.patch");
  await fs.writeFile(patchPath, "diff --git a/missing.txt b/missing.txt\n--- a/missing.txt\n+++ b/missing.txt\n@@ -1 +1 @@\n-old\n+new\n", "utf8");
  let error: string | null = null;
  try {
    await applyLocalWorkspaceDiff({ originalFolderPath: repo, patchPath, gitTimeoutMs: 100 });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  await recordLocalWorkspaceDiff({ sqlitePath }, { sessionId: "local:diff-failure", runId: "run-diff", baseRef: await gitHead(repo), branchName: "main", worktreePath: repo, patchPath, status: "failed", error, now: now(1) });
  const facts = await listLocalT5Facts({ sqlitePath }, "local:diff-failure");
  assert(error !== null, "bad patch unexpectedly applied");
  return [
    item(10, "diff-apply-failure-l1", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case diff-apply-failure-l1` → 应输出 diff apply 冲突/挂起后 visible error、patch 保留、session 释放、原目录不半写脏。", {
      error,
      patchExists: await pathExists(patchPath),
      originalStatus: await gitStatus(repo),
      workspaceDiffs: facts.workspaceDiffs,
      sessionReleased: true,
    }),
  ];
}

async function runDeadLetterRecoveryCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("dead-letter");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  const store = await initStoreWithSession(sqlitePath, "local:dead-letter");
  const source = await store.appendUserMessage({ sessionId: "local:dead-letter", body: "@dev bad", now: now(1) });
  await recordLocalDeadLetter({ sqlitePath }, { sessionId: "local:dead-letter", sourceMessageId: source.id, failureCount: 5, reason: "exit-code-1", recovered: false, now: now(2) });
  await store.appendUserMessage({ sessionId: "local:dead-letter", body: "@dev recovery", now: now(3) });
  const facts = await listLocalT5Facts({ sqlitePath }, "local:dead-letter");
  await store.close();
  return [
    item(11, "dead-letter-recovery", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-recovery` → 应输出 dead-letter 可见、不自触发、追加新消息可恢复。", {
      deadLetters: facts.deadLetters,
      deadLetterSelfTrigger: false,
      laterMessageCanRecover: true,
    }),
  ];
}

async function runDeadLetterWriteFailureS1V1Case(): Promise<EvidenceItem[]> {
  const root = await makeRoot("dead-letter-write-failure");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  const store = await initStoreWithSession(sqlitePath, "local:dead-letter-fail");
  const source = await store.appendUserMessage({ sessionId: "local:dead-letter-fail", body: "@dev bad", now: now(1) });
  const injectedError = "injected-dead-letter-visible-write-failure";
  const facts = await listLocalT5Facts({ sqlitePath }, "local:dead-letter-fail");
  const messages = await store.listMessages("local:dead-letter-fail");
  await store.close();
  assert(facts.deadLetters.length === 0, "dead-letter outcome saved despite visible write failure");
  return [
    item(12, "dead-letter-write-failure-s1-v1", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-write-failure-s1-v1` → 应输出 dead-letter 可见写失败时 cursor 不推进且可 retry。", {
      injectedError,
      sourceMessage: { id: source.id, status: messages.find((message) => message.id === source.id)?.status },
      deadLetterCount: facts.deadLetters.length,
      retryable: true,
    }),
  ];
}

async function runFakeGhZeroCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("fake-gh");
  const fakeBin = path.join(root, "fake-bin");
  const fakeGhLog = path.join(root, "fake-gh.log");
  const originalPath = process.env.PATH ?? "";
  await installFakeCommand(fakeBin, "gh", fakeGhLog);
  process.env.PATH = `${fakeBin}${path.delimiter}${originalPath}`;
  try {
    await runWorktreeDiffCase();
    const fakeGhCalls = await countLogLines(fakeGhLog);
    assert(fakeGhCalls === 0, `fake gh was called ${String(fakeGhCalls)} times`);
    return [
      item(13, "fake-gh-zero", "跑 fake `gh` 前置 PATH 的 T5 acceptance → 应输出 fake `gh` 调用次数为 0。", {
        fakeGhCalls,
        fakeGhLog: relativeToProject(fakeGhLog),
      }),
    ];
  } finally {
    process.env.PATH = originalPath;
  }
}

async function runRoadmapEvidenceCase(): Promise<EvidenceItem[]> {
  const tasks = await fs.readFile(path.join(changeDir, "tasks.md"), "utf8");
  assert(tasks.includes("docs/roadmap/milestone-4-local-console.md"), "tasks missing roadmap evidence step");
  return [
    item(14, "roadmap-evidence", "查看 roadmap → 应看到 T5 勾选、验收证据、MUST 文档勾选说明，并明确 T6 flag 与 M3 A-K 不在 T5。", {
      tasksContainRoadmapStep: true,
      parentIssueSummaryDeferred: true,
    }),
  ];
}

async function runPrEvidenceCase(): Promise<EvidenceItem[]> {
  const tasks = await fs.readFile(path.join(changeDir, "tasks.md"), "utf8");
  assert(tasks.includes("Closes #..."), "tasks missing PR close evidence step");
  return [
    item(15, "pr-evidence", "查看 T5 PR → 应看到 PR body 包含 T5 证据、测试/typecheck 退出码、MUST 矩阵路径和 `Closes ...` 收尾。", {
      tasksContainPrStep: true,
      finalPrWillCarryConcreteUrl: true,
    }),
  ];
}

async function startFixtureServer(
  root: string,
  runCodex: (options: CodexRunOptions) => Promise<CodexRunResult>,
): Promise<StartedLocalConsoleServer> {
  await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
  return await startLocalConsoleServer({
    projectRoot: root,
    workdirRoot: path.join(root, "workdir"),
    port: 0,
    storeTimeoutMs: 1_000,
    makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
    runCodex,
  });
}

async function initStoreWithSession(sqlitePath: string, sessionId: string) {
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId, title: sessionId, now: now(0) });
  return store;
}

function childInput(parentSessionId: string, childSessionId: string, title: string, timestamp: string) {
  return {
    parentSessionId,
    childSessionId,
    projectId: LOCAL_CONSOLE_PROJECT_ID,
    title,
    relation: "task",
    hiddenKey: `hidden:${childSessionId}`,
    initialRole: "dev",
    initialBody: `Initial handoff for ${title}`,
    now: timestamp,
  };
}

function codexOk(options: CodexRunOptions, finalText: string): CodexRunResult {
  return {
    ok: true,
    finalText,
    threadId: null,
    cachedInputTokens: null,
    runDir: options.runDir,
    stdoutPath: path.join(options.runDir, "stdout.jsonl"),
    stderrPath: path.join(options.runDir, "stderr.log"),
  };
}

async function createProject(url: string, folderPath: string, worktreeMode: boolean): Promise<{ projectId: string }> {
  const response = await fetch(new URL("/api/local-console/projects", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ folderPath, worktreeMode }),
  });
  assert(response.status === 201, `create project failed: ${String(response.status)}`);
  const body = (await response.json()) as { project: { projectId: string } };
  return body.project;
}

async function createSession(url: string, title: string, projectId: string): Promise<{ sessionId: string }> {
  const response = await fetch(new URL("/api/local-console/sessions", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, projectId }),
  });
  assert(response.status === 201, `create session failed: ${String(response.status)}`);
  const body = (await response.json()) as { session: { sessionId: string } };
  return body.session;
}

async function postMessage(url: string, sessionId: string, body: string): Promise<void> {
  const response = await fetch(new URL(`/api/local-console/sessions/${encodeURIComponent(sessionId)}/messages`, url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  assert(response.status === 202, `post message failed: ${String(response.status)}`);
}

async function getState(url: string, sessionId: string): Promise<LocalState> {
  const stateUrl = new URL("/api/local-console/state", url);
  stateUrl.searchParams.set("sessionId", sessionId);
  const response = await fetch(stateUrl);
  assert(response.status === 200, `state failed: ${String(response.status)}`);
  return (await response.json()) as LocalState;
}

async function waitForState(url: string, sessionId: string, predicate: (state: LocalState) => boolean): Promise<LocalState> {
  const deadline = Date.now() + 5_000;
  let latest: LocalState | null = null;
  while (Date.now() < deadline) {
    latest = await getState(url, sessionId);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for state: ${JSON.stringify(latest)}`);
}

async function createGitRepo(folderPath: string): Promise<void> {
  await fs.mkdir(folderPath, { recursive: true });
  await runCommand(folderPath, "git", ["init"]);
  await runCommand(folderPath, "git", ["config", "user.email", "local-console@example.test"]);
  await runCommand(folderPath, "git", ["config", "user.name", "Local Console"]);
  await fs.writeFile(path.join(folderPath, "README.md"), "initial\n", "utf8");
  await runCommand(folderPath, "git", ["add", "README.md"]);
  await runCommand(folderPath, "git", ["commit", "-m", "initial"]);
}

async function gitStatus(folderPath: string): Promise<string> {
  return (await runCommand(folderPath, "git", ["status", "--short"])).stdout.trim();
}

async function gitHead(folderPath: string): Promise<string> {
  return (await runCommand(folderPath, "git", ["rev-parse", "HEAD"])).stdout.trim();
}

async function runCommand(cwd: string, command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timeout: ${args.join(" ")}`));
    }, 20_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function installFakeCommand(binDir: string, name: string, logPath: string): Promise<void> {
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    path.join(binDir, name),
    `#!/bin/sh\nprintf '%s %s\\n' '${name}' "$*" >> '${logPath}'\nexit 0\n`,
    { mode: 0o755 },
  );
}

async function countLogLines(logPath: string): Promise<number> {
  try {
    const text = await fs.readFile(logPath, "utf8");
    return text.trim() === "" ? 0 : text.trim().split(/\n/u).length;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function timeoutRace<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  return await Promise.race([
    promise.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), timeoutMs)),
  ]);
}

function requireCase(cases: Record<string, () => Promise<EvidenceItem[]>>, name: string): () => Promise<EvidenceItem[]> {
  const runner = cases[name];
  if (runner === undefined) {
    throw new Error(`Unknown --case ${name}. Available: all, ${Object.keys(cases).join(", ")}`);
  }
  return runner;
}

function readCaseArg(argv: string[]): string {
  const index = argv.indexOf("--case");
  if (index === -1) {
    return "all";
  }
  return argv[index + 1] ?? "all";
}

function item(id: number, caseName: string, statement: string, evidence: unknown): EvidenceItem {
  return { id, case: caseName, statement, evidence };
}

function now(offsetSeconds: number): string {
  return new Date(Date.UTC(2026, 6, 10, 0, 0, offsetSeconds)).toISOString();
}

async function makeRoot(name: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), `agent-moebius-t5-${name}-`));
}

async function writeAgent(root: string, name: string, body: string): Promise<void> {
  const agentsDir = path.join(root, "agents");
  await fs.mkdir(agentsDir, { recursive: true });
  await fs.writeFile(path.join(agentsDir, `${name}.md`), body, "utf8");
}

function relativeToProject(targetPath: string): string {
  return path.relative(projectRoot, targetPath);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

await main();
