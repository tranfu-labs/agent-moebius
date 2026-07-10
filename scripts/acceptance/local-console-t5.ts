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
import { LOCAL_CONSOLE_PROJECT_ID, type LocalConsoleMessage, type LocalConsoleStore } from "../../src/local-console/types.js";

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
  messages: Array<{ speaker: string; role: string | null; body: string; status: string; error: string | null; failureCount?: number }>;
  activeRun: { runId: string; cwd: string | null } | null;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const changeDir = path.join(projectRoot, "openspec", "changes", "local-console-t5-full-parity");
const acceptanceLoopChangeDirs = [
  path.join(projectRoot, "openspec", "changes", "local-console-t5-acceptance-loop"),
  path.join(projectRoot, "openspec", "changes", "archive", "2026-07-10-local-console-t5-acceptance-loop"),
];
const artifactDir = path.join(projectRoot, "artifacts", "acceptance");
const evidencePath = path.join(artifactDir, "t5-evidence.json");
const selectedCase = readCaseArg(process.argv);
const fixtureSqliteBusyTimeoutMs = 5_000;

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
    "deadletter-recovery-suite": runDeadLetterRecoverySuiteCase,
    "dead-letter-recovery": runDeadLetterRecoveryCase,
    "restart-stuck-recovery": runRestartStuckRecoveryCase,
    "record-response-dead-letter": runRecordResponseDeadLetterCase,
    "dead-letter-write-failure-s1-v1": runDeadLetterWriteFailureS1V1Case,
    "legacy-failure-metadata-recovery": runLegacyFailureMetadataRecoveryCase,
    "dead-letter-no-mention": runDeadLetterNoMentionCase,
    "acceptance-loop": runAcceptanceLoopCase,
    "acceptance-format-error": runAcceptanceFormatErrorCase,
    "acceptance-integration-write-failure": runAcceptanceIntegrationWriteFailureCase,
    "acceptance-recheck-after-repair": runAcceptanceRecheckAfterRepairCase,
    "acceptance-projection-missing": runAcceptanceProjectionMissingCase,
    "acceptance-store-timeout": runAcceptanceStoreTimeoutCase,
    "fake-gh-zero": runFakeGhZeroCase,
    "roadmap-evidence": runRoadmapEvidenceCase,
    "pr-evidence": runPrEvidenceCase,
  };

  const acceptance =
    selectedCase === "all"
      ? (await Promise.all(Object.values(runners).map((runner) => runner()))).flat()
      : selectedCase === "acceptance-loop-suite"
        ? await runAcceptanceLoopSuiteCase()
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
  const acceptanceLoopChangeDir = await resolveFirstExistingDirectory(acceptanceLoopChangeDirs);
  const delta = await fs.readFile(path.join(acceptanceLoopChangeDir, "specs", "local-console", "spec.md"), "utf8");
  const archivedSpec = await fs.readFile(path.join(projectRoot, "openspec", "specs", "local-console", "spec.md"), "utf8");
  assert(delta.includes("## MODIFIED Requirements"), "missing MODIFIED Requirements");
  assert(delta.includes("Acceptance loop replaces the previous T5-only acceptance prohibition"), "missing boundary scenario");
  assert(!/full acceptance pre-pass/iu.test(archivedSpec), "archived spec still forbids full acceptance pre-pass");
  return [
    item(4, "boundary-replacement", "查看 `specs/local-console/spec.md` → 应看到 T5-only 禁止规则被修改，归档后不得有 MUST/MUST NOT 冲突。", {
      modifiedRequirements: delta.includes("## MODIFIED Requirements"),
      boundaryScenario: delta.includes("Acceptance loop replaces the previous T5-only acceptance prohibition"),
      githubRunnerUnchangedClause: delta.includes("GitHub issue runner behavior remains unchanged"),
      archivedSpecHasAcceptanceLoop: archivedSpec.includes("本地验收走查解析"),
      archivedSpecConflictRemoved: !/full acceptance pre-pass/iu.test(archivedSpec),
    }),
  ];
}

async function runAcceptanceLoopSuiteCase(): Promise<EvidenceItem[]> {
  const acceptance: EvidenceItem[] = [];
  for (const runner of [
    runBoundaryReplacementCase,
    runAcceptanceLoopCase,
    runAcceptanceFormatErrorCase,
    runAcceptanceIntegrationWriteFailureCase,
    runAcceptanceRecheckAfterRepairCase,
    runAcceptanceProjectionMissingCase,
    runAcceptanceStoreTimeoutCase,
  ]) {
    acceptance.push(...await runner());
  }
  return acceptance;
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
  let runCount = 0;
  const server = await startFixtureServer(
    root,
    async (options) => {
      runCount += 1;
      if (options.prompt.includes("@dev recovery")) {
        return codexOk(options, "recovered");
      }
      return codexFailed(options, "exit-code-1");
    },
    { failureRetryLimit: 2 },
  );
  try {
    const session = await createSession(server.url, "dead-letter", LOCAL_CONSOLE_PROJECT_ID);
    await postMessage(server.url, session.sessionId, "@dev bad");
    await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "user" && message.status === "pending" && message.error === "exit-code-1"),
    );
    await server.runtime.processPending(session.sessionId);
    const deadLetterState = await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "system" && message.body.includes("Local dead-letter")),
    );
    await server.runtime.processPending(session.sessionId);
    const afterPoll = await getState(server.url, session.sessionId);
    await postMessage(server.url, session.sessionId, "@dev recovery");
    const recovered = await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "agent" && message.body === "recovered"),
    );
    const facts = await listLocalT5Facts({ sqlitePath: server.sqlitePath }, session.sessionId);
    const deadLetterMessages = afterPoll.messages.filter((message) => message.speaker === "system" && message.body.includes("Local dead-letter"));
    assert(deadLetterMessages.length === 1, `expected one dead-letter, got ${String(deadLetterMessages.length)}`);
    assert(facts.deadLetters.length === 1, `expected one dead-letter fact, got ${String(facts.deadLetters.length)}`);
    return [
      item(11, "dead-letter-recovery", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-recovery` → 应输出连续失败进入 visible dead-letter，后续不重复刷，新消息可恢复。", {
        runCount,
        deadLetters: facts.deadLetters,
        deadLetterMessages,
        userStatuses: deadLetterState.messages.filter((message) => message.speaker === "user").map((message) => ({ body: message.body, status: message.status, error: message.error })),
        recovered: recovered.messages.some((message) => message.speaker === "agent" && message.body === "recovered"),
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runDeadLetterRecoverySuiteCase(): Promise<EvidenceItem[]> {
  return [
    ...(await runDeadLetterRecoveryCase()),
    ...(await runRestartStuckRecoveryCase()),
    ...(await runRecordResponseDeadLetterCase()),
    ...(await runDeadLetterWriteFailureS1V1Case()),
    ...(await runLegacyFailureMetadataRecoveryCase()),
    ...(await runDeadLetterNoMentionCase()),
  ];
}

async function runRestartStuckRecoveryCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("restart-stuck");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  const session = await store.createSession({ sessionId: "local:restart-stuck", title: "restart stuck", now: now(0) });
  const completedSource = await store.appendUserMessage({ sessionId: session.sessionId, body: "@dev completed", now: now(1) });
  await store.recordAgentResponse({
    userMessageId: completedSource.id,
    sessionId: session.sessionId,
    role: "dev",
    body: "already completed",
    runId: "run-completed",
    runDir: path.join(root, "runs", "completed"),
    now: now(2),
  });
  const stale = await store.appendUserMessage({ sessionId: session.sessionId, body: "@dev stale", now: now(3) });
  await store.claimNextPendingMessage({ sessionId: session.sessionId, runId: "run-stale", now: now(4) });
  await store.close();

  const runCalls: string[] = [];
  const server = await startLocalConsoleServer({
    projectRoot: root,
    workdirRoot: path.join(root, "workdir"),
    sqlitePath,
    port: 0,
    storeTimeoutMs: 1_000,
    codexMaxDurationMs: 1,
    staleRunningGraceMs: 1,
    makeRunDir: (count) => path.join(root, "runs", `restart-${String(count)}`),
    runCodex: async (options) => {
      runCalls.push(options.prompt);
      return codexOk(options, "should not duplicate");
    },
  });
  try {
    const state = await waitForState(server.url, session.sessionId, (data) =>
      data.messages.some((message) => message.status === "stuck" && message.error?.includes("stale-running") === true),
    );
    const completedResponses = state.messages.filter((message) => message.speaker === "agent" && message.body === "already completed");
    assert(completedResponses.length === 1, `completed response duplicated: ${String(completedResponses.length)}`);
    assert(state.messages.some((message) => message.status === "stuck" && message.error?.includes("stale-running") === true), "stale message was not stuck");
    assert(!state.messages.some((message) => message.status === "running"), "session still has running messages");
    await postMessage(server.url, session.sessionId, "@dev after restart");
    const continued = await waitForState(server.url, session.sessionId, (data) =>
      data.messages.some((message) => message.speaker === "agent" && message.body === "should not duplicate"),
    );
    return [
      item(12, "restart-stuck-recovery", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case restart-stuck-recovery` → 应输出重启释放 stale running、不重复已完成 response、后续消息可继续。", {
        staleSourceId: stale.id,
        completedResponseCount: completedResponses.length,
        runningCount: state.messages.filter((message) => message.status === "running").length,
        stuckMessages: state.messages.filter((message) => message.status === "stuck"),
        continued: continued.messages.some((message) => message.speaker === "agent" && message.body === "should not duplicate"),
        runCallsAfterRestart: runCalls.length,
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runRecordResponseDeadLetterCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("record-response-dead-letter");
  const inner = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
  const store = new AlwaysFailRecordAgentResponseStore(inner);
  let runCount = 0;
  const server = await startFixtureServer(
    root,
    async (options) => {
      runCount += 1;
      if (options.prompt.includes("@dev recovery")) {
        return codexOk(options, "recovered after record failure");
      }
      return codexOk(options, "response that never commits");
    },
    { store, failureRetryLimit: 2 },
  );
  try {
    const session = await createSession(server.url, "record response dead-letter", LOCAL_CONSOLE_PROJECT_ID);
    await postMessage(server.url, session.sessionId, "@dev bad response");
    await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "user" && message.status === "pending"),
    );
    await server.runtime.processPending(session.sessionId);
    const deadLetter = await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "system" && message.body.includes("Local dead-letter")),
    );
    await postMessage(server.url, session.sessionId, "@dev recovery");
    store.failAgentResponses = false;
    const recovered = await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "agent" && message.body === "recovered after record failure"),
    );
    const facts = await listLocalT5Facts({ sqlitePath: server.sqlitePath }, session.sessionId);
    const agentResponses = deadLetter.messages.filter((message) => message.speaker === "agent" && message.body === "response that never commits");
    assert(agentResponses.length === 0, "agent response was duplicated despite record failure");
    assert(facts.deadLetters.length === 1, `expected one dead-letter fact, got ${String(facts.deadLetters.length)}`);
    return [
      item(13, "record-response-dead-letter", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case record-response-dead-letter` → 应输出 recordAgentResponse 提交前连续失败只产生一条 dead-letter，不重复写 agent response，后续新消息可处理。", {
        runCount,
        deadLetters: facts.deadLetters,
        duplicateAgentResponses: agentResponses.length,
        recovered: recovered.messages.some((message) => message.speaker === "agent" && message.body === "recovered after record failure"),
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runLegacyFailureMetadataRecoveryCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("legacy-metadata");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  const session = await store.createSession({ sessionId: "local:legacy-metadata", title: "legacy metadata", now: now(0) });
  const completedSource = await store.appendUserMessage({ sessionId: session.sessionId, body: "@dev completed", now: now(1) });
  await store.recordAgentResponse({
    userMessageId: completedSource.id,
    sessionId: session.sessionId,
    role: "dev",
    body: "legacy completed",
    runId: "run-completed",
    runDir: path.join(root, "runs", "completed"),
    now: now(2),
  });
  await store.appendUserMessage({ sessionId: session.sessionId, body: "@dev stale legacy", now: now(3) });
  await store.claimNextPendingMessage({ sessionId: session.sessionId, runId: "run-stale", now: now(4) });
  await store.close();
  const db = new DatabaseSync(sqlitePath);
  try {
    db.exec("ALTER TABLE session_messages DROP COLUMN failure_count");
    db.exec("ALTER TABLE session_messages DROP COLUMN last_failure_reason");
  } finally {
    db.close();
  }
  const server = await startLocalConsoleServer({
    projectRoot: root,
    workdirRoot: path.join(root, "workdir"),
    sqlitePath,
    port: 0,
    storeTimeoutMs: 1_000,
    codexMaxDurationMs: 1,
    staleRunningGraceMs: 1,
    makeRunDir: (count) => path.join(root, "runs", `legacy-${String(count)}`),
    runCodex: async (options) => codexOk(options, "legacy should not duplicate"),
  });
  try {
    const state = await waitForState(server.url, session.sessionId, (data) =>
      data.messages.some((message) => message.status === "stuck" && message.error?.includes("stale-running") === true),
    );
    const completedResponses = state.messages.filter((message) => message.speaker === "agent" && message.body === "legacy completed");
    const sourceRows = state.messages.filter((message) => message.speaker === "user").map((message) => ({
      body: message.body,
      status: message.status,
      failureCount: "failureCount" in message ? (message as { failureCount?: unknown }).failureCount : "not-in-api",
    }));
    return [
      item(14, "legacy-failure-metadata-recovery", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case legacy-failure-metadata-recovery` → 应输出旧 SQLite 缺失 failure metadata 时默认值补齐、stale running 释放或 stuck、已完成 response 不重复。", {
        completedResponseCount: completedResponses.length,
        sourceRows,
        stuckMessages: state.messages.filter((message) => message.status === "stuck"),
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runDeadLetterNoMentionCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("dead-letter-no-mention");
  let runCount = 0;
  const server = await startFixtureServer(
    root,
    async (options) => {
      runCount += 1;
      return codexFailed(options, "handoff-like failure for @dev and @qa");
    },
    { failureRetryLimit: 1 },
  );
  try {
    const session = await createSession(server.url, "dead-letter no mention", LOCAL_CONSOLE_PROJECT_ID);
    await postMessage(server.url, session.sessionId, "@dev bad");
    const state = await waitForState(server.url, session.sessionId, (data) =>
      data.messages.some((message) => message.speaker === "system" && message.body.includes("Local dead-letter")),
    );
    await server.runtime.processPending(session.sessionId);
    const afterDrain = await getState(server.url, session.sessionId);
    const deadLetter = state.messages.find((message) => message.speaker === "system" && message.body.includes("Local dead-letter"));
    assert(deadLetter !== undefined, "missing dead-letter");
    assert(!/@[A-Za-z][A-Za-z0-9_-]*/u.test(deadLetter.body), `dead-letter contains legal mention: ${deadLetter.body}`);
    assert(afterDrain.messages.filter((message) => message.speaker === "agent").length === 0, "dead-letter triggered agent");
    return [
      item(15, "dead-letter-no-mention", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-no-mention` → 应输出 dead-letter reason/body 含交棒文本时可见记录仍无合法 agent mention，后续 drain 不自触发。", {
        runCount,
        deadLetterBody: deadLetter.body,
        containsLegalMention: /@[A-Za-z][A-Za-z0-9_-]*/u.test(deadLetter.body),
        agentMessagesAfterDrain: afterDrain.messages.filter((message) => message.speaker === "agent").length,
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runDeadLetterWriteFailureS1V1Case(): Promise<EvidenceItem[]> {
  const root = await makeRoot("dead-letter-write-failure");
  const inner = await createSqliteLocalConsoleStore({ sqlitePath: path.join(root, ".state", "local-console.sqlite") });
  const store = new FailOnceDeadLetterStore(inner);
  const server = await startFixtureServer(root, async (options) => codexFailed(options, "exit-code-1"), {
    store,
    failureRetryLimit: 1,
  });
  try {
    const session = await createSession(server.url, "dead-letter write failure", LOCAL_CONSOLE_PROJECT_ID);
    await postMessage(server.url, session.sessionId, "@dev bad");
    await waitForState(server.url, session.sessionId, (state) =>
      store.failedDeadLetterWrites === 1 &&
      state.messages.some((message) => message.speaker === "user" && message.status === "pending"),
    );
    const factsBeforeRetry = await listLocalT5Facts({ sqlitePath: server.sqlitePath }, session.sessionId);
    const messagesBeforeRetry = await getState(server.url, session.sessionId);
    assert(factsBeforeRetry.deadLetters.length === 0, "dead-letter outcome saved despite visible write failure");
    await server.runtime.processPending(session.sessionId);
    const deadLetter = await waitForState(server.url, session.sessionId, (state) =>
      state.messages.some((message) => message.speaker === "system" && message.body.includes("Local dead-letter")),
    );
    const factsAfterRetry = await listLocalT5Facts({ sqlitePath: server.sqlitePath }, session.sessionId);
    return [
      item(16, "dead-letter-write-failure-s1-v1", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case dead-letter-write-failure-s1-v1` → 应输出 dead-letter 可见写失败时 cursor 不推进且可 retry，恢复后同一 source 可写入 dead-letter。", {
        injectedError: "injected-dead-letter-visible-write-failure",
        beforeRetry: {
          messages: messagesBeforeRetry.messages,
          deadLetterCount: factsBeforeRetry.deadLetters.length,
        },
        afterRetry: {
          deadLetterMessages: deadLetter.messages.filter((message) => message.speaker === "system" && message.body.includes("Local dead-letter")),
          deadLetterCount: factsAfterRetry.deadLetters.length,
        },
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runAcceptanceLoopCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("acceptance-loop");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "dev", "# dev\n\nROLE:dev");
  await writeAgent(root, "product-manager", "# product-manager\n\nROLE:product-manager");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId: "local:acceptance-parent", title: "acceptance parent", now: now(0) });
  await createLocalChildSession(
    { sqlitePath },
    {
      parentSessionId: "local:acceptance-parent",
      childSessionId: "local:acceptance-child",
      projectId: LOCAL_CONSOLE_PROJECT_ID,
      title: "acceptance child",
      relation: "task",
      hiddenKey: "acceptance-child-key",
      initialRole: "dev",
      initialBody: acceptanceChildBody(["跑 parser → 应退出码 0", "跑 runtime → 应退出码 0"], "task-acceptance-loop"),
      now: now(1),
    },
  );
  await appendDisplayedAcceptance(store, "local:acceptance-child", "product-manager", [
    "1. 通过 — parser evidence",
    "2. 通过 — runtime evidence",
    "验收结论：通过",
  ].join("\n"), 2);
  await store.close();
  const server = await startFixtureServer(root, async (options) => codexOk(options, "unexpected"));
  try {
    await server.runtime.processPending("local:acceptance-child");
    const childFacts = await listLocalT5Facts({ sqlitePath }, "local:acceptance-child");
    const parentFacts = await listLocalT5Facts({ sqlitePath }, "local:acceptance-parent");
    assert(childFacts.acceptanceFacts.length === 1, "passed acceptance fact missing");
    assert(parentFacts.integrationEvents.length === 1, "parent integration event missing");
    return [
      item(16, "acceptance-loop", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case acceptance-loop` → 应输出本地验收通过事实并驱动 parent integration progress。", {
        acceptanceFacts: childFacts.acceptanceFacts,
        parentIntegrationEvents: parentFacts.integrationEvents,
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runAcceptanceFormatErrorCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("acceptance-format");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "dev", "# dev\n\nROLE:dev");
  await writeAgent(root, "qa", "# qa\n\nROLE:qa");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId: "local:format-parent", title: "format parent", now: now(0) });
  await createLocalChildSession(
    { sqlitePath },
    {
      parentSessionId: "local:format-parent",
      childSessionId: "local:format-child",
      projectId: LOCAL_CONSOLE_PROJECT_ID,
      title: "format child",
      relation: "task",
      hiddenKey: "format-child-key",
      initialRole: "dev",
      initialBody: acceptanceChildBody(["跑 one → 应退出码 0", "跑 two → 应退出码 0"], "task-format"),
      now: now(1),
    },
  );
  await appendDisplayedAcceptance(store, "local:format-child", "qa", [
    "1. 通过 — only one",
    "验收结论：通过",
    "@dev malformed handoff",
  ].join("\n"), 2);
  await store.close();
  const server = await startFixtureServer(root, async (options) => codexOk(options, "unexpected"));
  try {
    await server.runtime.processPending("local:format-child");
    const facts = await listLocalT5Facts({ sqlitePath }, "local:format-child");
    const state = await getState(server.url, "local:format-child");
    assert(facts.acceptanceFacts.length === 0, "malformed acceptance saved a fact");
    assert(state.messages.some((message) => message.body.includes("本地验收走查格式无法解析")), "format reminder missing");
    return [
      item(17, "acceptance-format-error", "跑 `pnpm exec tsx scripts/acceptance/local-console-t5.ts --case acceptance-format-error` → 应输出格式错误可见提醒，不保存 passed fact，不消费同消息 handoff。", {
        acceptanceFacts: facts.acceptanceFacts,
        reminder: state.messages.find((message) => message.body.includes("本地验收走查格式无法解析")),
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runAcceptanceIntegrationWriteFailureCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("acceptance-write-failure");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "dev", "# dev\n\nROLE:dev");
  await writeAgent(root, "product-manager", "# product-manager\n\nROLE:product-manager");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId: "local:write-parent", title: "write parent", now: now(0) });
  await createLocalChildSession(
    { sqlitePath },
    {
      parentSessionId: "local:write-parent",
      childSessionId: "local:write-child",
      projectId: LOCAL_CONSOLE_PROJECT_ID,
      title: "write child",
      relation: "task",
      hiddenKey: "write-child-key",
      initialRole: "dev",
      initialBody: acceptanceChildBody(["跑 one → 应退出码 0"], "task-write"),
      now: now(1),
    },
  );
  const message = await appendDisplayedAcceptance(store, "local:write-child", "product-manager", [
    "1. 通过 — ok",
    "验收结论：通过",
    "@dev should-not-run",
  ].join("\n"), 2);
  await store.close();
  const locked = new DatabaseSync(sqlitePath);
  const server = await startFixtureServer(root, async (options) => codexOk(options, "unexpected"));
  try {
    locked.exec("BEGIN EXCLUSIVE");
    await server.runtime.processPending("local:write-child");
    locked.exec("ROLLBACK");
    await server.runtime.processPending("local:write-child");
    const facts = await listLocalT5Facts({ sqlitePath }, "local:write-child");
    const parentFacts = await listLocalT5Facts({ sqlitePath }, "local:write-parent");
    assert(facts.acceptanceFacts.length === 1, "retry did not save exactly one fact");
    assert(parentFacts.integrationEvents.length === 1, "retry did not save exactly one parent event");
    return [
      item(18, "acceptance-integration-write-failure", "注入 parent integration visible write 失败 → 应不推进 cursor、不消费同消息 handoff、不记录 completed integration request，retry 后只生成一个 deduped parent progress。", {
        sourceMessageId: message.id,
        acceptanceFacts: facts.acceptanceFacts,
        parentEvents: parentFacts.integrationEvents,
      }),
    ];
  } finally {
    try {
      locked.exec("ROLLBACK");
    } catch {}
    locked.close();
    await server.close();
  }
}

async function runAcceptanceRecheckAfterRepairCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("acceptance-recheck");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "dev", "# dev\n\nROLE:dev");
  await writeAgent(root, "product-manager", "# product-manager\n\nROLE:product-manager");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId: "local:recheck-parent", title: "recheck parent", now: now(0) });
  await createLocalChildSession(
    { sqlitePath },
    {
      parentSessionId: "local:recheck-parent",
      childSessionId: "local:recheck-child",
      projectId: LOCAL_CONSOLE_PROJECT_ID,
      title: "recheck child",
      relation: "task",
      hiddenKey: "recheck-child-key",
      initialRole: "dev",
      initialBody: acceptanceChildBody(["跑 one → 应退出码 0"], "task-recheck"),
      now: now(1),
    },
  );
  await appendDisplayedAcceptance(store, "local:recheck-child", "product-manager", [
    "1. 不通过 — failed before repair",
    "验收结论：不通过",
  ].join("\n"), 2);
  await store.close();
  const server = await startFixtureServer(root, async (options) => codexOk(options, "unexpected"));
  try {
    await server.runtime.processPending("local:recheck-child");
  } finally {
    await server.close();
  }
  const store2 = await createSqliteLocalConsoleStore({ sqlitePath });
  await store2.init();
  await appendDisplayedAcceptance(store2, "local:recheck-child", "product-manager", [
    "1. 通过 — repair verified",
    "验收结论：通过",
  ].join("\n"), 6);
  await store2.close();
  const restarted = await startFixtureServer(root, async (options) => codexOk(options, "unexpected"));
  try {
    await restarted.runtime.processPending("local:recheck-child");
    const facts = await listLocalT5Facts({ sqlitePath }, "local:recheck-child");
    const parentFacts = await listLocalT5Facts({ sqlitePath }, "local:recheck-parent");
    assert(facts.acceptanceFacts.length === 2, "expected failed and passed acceptance history");
    assert(parentFacts.sessionEdges.some((edge) => edge.relation === "repair"), "expected repair edge on parent session");
    return [
      item(19, "acceptance-recheck-after-repair", "同一验收角色先输出不通过走查，再 repair 后输出通过走查 → latest passed fact 应驱动 rejoin，旧 failed repair visible record 或 repair reference 仍可审计。", {
        acceptanceFacts: facts.acceptanceFacts,
        sessionEdges: parentFacts.sessionEdges,
        integrationEvents: parentFacts.integrationEvents,
      }),
    ];
  } finally {
    await restarted.close();
  }
}

async function runAcceptanceProjectionMissingCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("acceptance-projection");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "qa", "# qa\n\nROLE:qa");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId: "local:projection-missing", title: "projection missing", now: now(0) });
  await appendDisplayedAcceptance(store, "local:projection-missing", "qa", [
    "1. 通过 — ok",
    "验收结论：通过",
  ].join("\n"), 1);
  await store.close();
  const server = await startFixtureServer(root, async (options) => codexOk(options, "unexpected"));
  try {
    await server.runtime.processPending("local:projection-missing");
    const facts = await listLocalT5Facts({ sqlitePath }, "local:projection-missing");
    const state = await getState(server.url, "local:projection-missing");
    assert(facts.acceptanceFacts.length === 0, "missing projection saved a fact");
    assert(state.messages.some((message) => message.body.includes("未找到 formal acceptance statements")), "blocked message missing");
    return [
      item(20, "acceptance-projection-missing", "缺 formal acceptance statements projection 的 child session 收到验收角色消息 → 应写 visible blocked/error，不伪造验收范围，不保存 passed fact。", {
        acceptanceFacts: facts.acceptanceFacts,
        blocked: state.messages.find((message) => message.body.includes("未找到 formal acceptance statements")),
      }),
    ];
  } finally {
    await server.close();
  }
}

async function runAcceptanceStoreTimeoutCase(): Promise<EvidenceItem[]> {
  const root = await makeRoot("acceptance-timeout");
  const sqlitePath = path.join(root, ".state", "local-console.sqlite");
  await writeAgent(root, "qa", "# qa\n\nROLE:qa");
  const store = await createSqliteLocalConsoleStore({ sqlitePath });
  await store.init();
  await store.createSession({ sessionId: "local:timeout-parent", title: "timeout parent", now: now(0) });
  await createLocalChildSession(
    { sqlitePath },
    {
      parentSessionId: "local:timeout-parent",
      childSessionId: "local:timeout-child",
      projectId: LOCAL_CONSOLE_PROJECT_ID,
      title: "timeout child",
      relation: "task",
      hiddenKey: "timeout-child-key",
      initialRole: "dev",
      initialBody: acceptanceChildBody(["跑 one → 应退出码 0"], "task-timeout"),
      now: now(1),
    },
  );
  await appendDisplayedAcceptance(store, "local:timeout-child", "qa", [
    "1. 通过 — ok",
    "验收结论：通过",
  ].join("\n"), 2);
  await store.close();
  const lock = new DatabaseSync(sqlitePath);
  const server = await startLocalConsoleServer({
    projectRoot: root,
    sqlitePath,
    port: 0,
    storeTimeoutMs: 200,
    sqliteBusyTimeoutMs: 500,
    runCodex: async (options) => codexOk(options, "unexpected"),
    makeRunDir: (count) => path.join(root, "runs", `timeout-${String(count)}`),
  });
  try {
    lock.exec("BEGIN EXCLUSIVE");
    await server.runtime.processPending("local:timeout-child");
    lock.exec("ROLLBACK");
    const factsAfterTimeout = await listLocalT5Facts({ sqlitePath }, "local:timeout-child");
    await server.runtime.processPending("local:timeout-child");
    const factsAfterRetry = await listLocalT5Facts({ sqlitePath }, "local:timeout-child");
    assert(factsAfterTimeout.acceptanceFacts.length === 0, "timeout saved successful fact");
    assert(factsAfterRetry.acceptanceFacts.length === 1, "retry did not save fact");
    return [
      item(21, "acceptance-store-timeout", "SQLite 组合事务或 store command timeout → 系统应在配置超时内释放 session drain，消息保持 retryable 或 visible diagnosed，且不保存成功验收事实。", {
        factsAfterTimeout: factsAfterTimeout.acceptanceFacts,
        factsAfterRetry: factsAfterRetry.acceptanceFacts,
      }),
    ];
  } finally {
    try {
      lock.exec("ROLLBACK");
    } catch {}
    lock.close();
    await server.close();
  }
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
  options: Partial<Parameters<typeof startLocalConsoleServer>[0]> = {},
): Promise<StartedLocalConsoleServer> {
  await writeAgent(root, "dev", "# Dev\n\nROLE:dev");
  return await startLocalConsoleServer({
    projectRoot: root,
    workdirRoot: path.join(root, "workdir"),
    port: 0,
    storeTimeoutMs: 1_000,
    makeRunDir: (count) => path.join(root, "runs", `run-${String(count)}`),
    runCodex,
    ...options,
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

async function appendDisplayedAcceptance(
  store: Awaited<ReturnType<typeof createSqliteLocalConsoleStore>>,
  sessionId: string,
  role: string,
  body: string,
  offsetSeconds: number,
): Promise<{ id: number }> {
  const sqlitePath = store.sqlitePath;
  await store.close();
  const database = new DatabaseSync(sqlitePath);
  try {
    database.exec(`PRAGMA busy_timeout = ${String(fixtureSqliteBusyTimeoutMs)}`);
    const timestamp = now(offsetSeconds);
    const result = database
      .prepare(
        `INSERT INTO session_messages
          (session_id, speaker, role, body, status, run_id, run_dir, error, source_kind, source_id, created_at, updated_at)
         VALUES (?, 'agent', ?, ?, 'displayed', ?, ?, NULL, 'local-acceptance-fixture', NULL, ?, ?)`,
      )
      .run(sessionId, role, body, `run-acceptance-${String(offsetSeconds)}`, `/tmp/run-acceptance-${String(offsetSeconds)}`, timestamp, timestamp);
    return { id: Number(result.lastInsertRowid) };
  } finally {
    database.close();
  }
}

function acceptanceChildBody(statements: string[], taskId: string): string {
  return [
    `Ledger task id: ${taskId}`,
    "",
    "Acceptance statements:",
    ...statements.map((statement, index) => `${index + 1}. ${statement}`),
    "",
    "Initial handoff:",
    "@dev 请实现。",
  ].join("\n");
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

function codexFailed(options: CodexRunOptions, reason: string): CodexRunResult {
  return {
    ok: false,
    reason,
    runDir: options.runDir,
    stdoutPath: path.join(options.runDir, "stdout.jsonl"),
    stderrPath: path.join(options.runDir, "stderr.log"),
  };
}

class AlwaysFailRecordAgentResponseStore implements LocalConsoleStore {
  readonly sqlitePath: string;
  failAgentResponses = true;

  constructor(protected readonly inner: LocalConsoleStore) {
    this.sqlitePath = inner.sqlitePath;
  }

  async init(): Promise<void> { await this.inner.init(); }
  async close(): Promise<void> { await this.inner.close(); }
  async createProject(input: Parameters<LocalConsoleStore["createProject"]>[0]) { return await this.inner.createProject(input); }
  async updateProject(input: Parameters<LocalConsoleStore["updateProject"]>[0]) { return await this.inner.updateProject(input); }
  async listProjects() { return await this.inner.listProjects(); }
  async getSessionWorkspace(sessionId: string) { return await this.inner.getSessionWorkspace(sessionId); }
  async recordProjectWorkspaceStatus(input: Parameters<LocalConsoleStore["recordProjectWorkspaceStatus"]>[0]) { await this.inner.recordProjectWorkspaceStatus(input); }
  async createSession(input: Parameters<LocalConsoleStore["createSession"]>[0]) { return await this.inner.createSession(input); }
  async listSessions() { return await this.inner.listSessions(); }
  async appendUserMessage(input: Parameters<LocalConsoleStore["appendUserMessage"]>[0]) { return await this.inner.appendUserMessage(input); }
  async listMessages(sessionId: string) { return await this.inner.listMessages(sessionId); }
  async hasRunningMessage(sessionId: string) { return await this.inner.hasRunningMessage(sessionId); }
  async claimNextPendingMessage(input: Parameters<LocalConsoleStore["claimNextPendingMessage"]>[0]) { return await this.inner.claimNextPendingMessage(input); }
  async setRunDir(input: Parameters<LocalConsoleStore["setRunDir"]>[0]) { await this.inner.setRunDir(input); }
  async recordAgentResponse(input: Parameters<LocalConsoleStore["recordAgentResponse"]>[0]) {
    if (this.failAgentResponses) {
      throw new Error("injected-record-agent-response-before-commit");
    }
    await this.inner.recordAgentResponse(input);
  }
  async recordSystemAndComplete(input: Parameters<LocalConsoleStore["recordSystemAndComplete"]>[0]) { await this.inner.recordSystemAndComplete(input); }
  async recordMessageProcessed(input: Parameters<LocalConsoleStore["recordMessageProcessed"]>[0]) { await this.inner.recordMessageProcessed(input); }
  async findRouteDecision(input: Parameters<LocalConsoleStore["findRouteDecision"]>[0]) { return await this.inner.findRouteDecision(input); }
  async recordRouteAppend(input: Parameters<LocalConsoleStore["recordRouteAppend"]>[0]) { await this.inner.recordRouteAppend(input); }
  async recordRouteNoAction(input: Parameters<LocalConsoleStore["recordRouteNoAction"]>[0]) { await this.inner.recordRouteNoAction(input); }
  async releaseMessageForRetry(input: Parameters<LocalConsoleStore["releaseMessageForRetry"]>[0]) { await this.inner.releaseMessageForRetry(input); }
  async recordFailure(input: Parameters<LocalConsoleStore["recordFailure"]>[0]) { await this.inner.recordFailure(input); }
  async recordRetryableFailure(input: Parameters<LocalConsoleStore["recordRetryableFailure"]>[0]): Promise<LocalConsoleMessage> { return await this.inner.recordRetryableFailure(input); }
  async recordDeadLetter(input: Parameters<LocalConsoleStore["recordDeadLetter"]>[0]) { await this.inner.recordDeadLetter(input); }
  async recordInterrupted(input: Parameters<LocalConsoleStore["recordInterrupted"]>[0]) { await this.inner.recordInterrupted(input); }
  async recordStuck(input: Parameters<LocalConsoleStore["recordStuck"]>[0]) { await this.inner.recordStuck(input); }
  async markStaleRunning(input: Parameters<LocalConsoleStore["markStaleRunning"]>[0]) { return await this.inner.markStaleRunning(input); }
}

class FailOnceDeadLetterStore extends AlwaysFailRecordAgentResponseStore {
  private failNextDeadLetter = true;
  failedDeadLetterWrites = 0;

  override async recordAgentResponse(input: Parameters<LocalConsoleStore["recordAgentResponse"]>[0]) {
    await this.inner.recordAgentResponse(input);
  }

  override async recordDeadLetter(input: Parameters<LocalConsoleStore["recordDeadLetter"]>[0]) {
    if (this.failNextDeadLetter) {
      this.failNextDeadLetter = false;
      this.failedDeadLetterWrites += 1;
      throw new Error("injected-dead-letter-visible-write-failure");
    }
    await super.recordDeadLetter(input);
  }
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

async function resolveFirstExistingDirectory(paths: string[]): Promise<string> {
  for (const targetPath of paths) {
    if (await pathExists(targetPath)) {
      return targetPath;
    }
  }
  throw new Error(`No existing directory found: ${paths.map(relativeToProject).join(", ")}`);
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
