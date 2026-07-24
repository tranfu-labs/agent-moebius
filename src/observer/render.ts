import type { ObserverDiagnostic, ObserverRunDetailReadResult, ObserverRunManifestRecord, ObserverSourceStatus } from "./read-state.js";
import {
  runNodeId,
  type ObserverExecutionNodeView,
  type ObserverGateView,
  type ObserverGoalView,
  type ObserverIssueRefView,
  type ObserverIssueView,
  type ObserverLedgerView,
  type ObserverMilestoneView,
  type ObserverModel,
  type ObserverOwnerPhaseView,
  type ObserverPhaseView,
  type ObserverRepositoryView,
  type ObserverRunEvidenceView,
  type ObserverRunTokenView,
  type ObserverTaskView,
} from "./model.js";

export interface ObserverRenderSelection {
  projectKey?: string;
  issueKey?: string;
  runId?: string;
}

export function renderObserverPage(model: ObserverModel, selection: ObserverRenderSelection = {}): string {
  const selected = resolveSelection(model, selection);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moebius Observer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #64748b;
      --line: #d7dde6;
      --accent: #0f766e;
      --accent-soft: #e6f4f1;
      --warn: #b45309;
      --warn-soft: #fff7ed;
      --error: #b91c1c;
      --error-soft: #fef2f2;
      --code: #eef2f7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    header {
      padding: 20px 24px 14px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .meta {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }
    main {
      display: grid;
      grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
      min-height: calc(100vh - 78px);
    }
    aside {
      border-right: 1px solid var(--line);
      background: var(--panel);
      padding: 16px;
    }
    .content {
      padding: 16px 20px 32px;
    }
    .observer-workspace {
      display: grid;
      grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(240px, 320px);
      gap: 12px;
      align-items: start;
    }
    .selector-panel, .dag-panel, .token-panel, .detail-panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
    }
    .dag-panel {
      min-width: 0;
    }
    .dag {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }
    .dag-node {
      display: block;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #fbfcfe;
      color: var(--text);
      text-decoration: none;
    }
    .dag-node:hover { text-decoration: none; border-color: #99d6cd; }
    .dag-node[data-status="completed"] { border-left: 4px solid var(--accent); }
    .dag-node[data-status="stuck"], .dag-node[data-status="failed"] { border-left: 4px solid var(--warn); }
    .dag-node[data-status="dead-letter"] { border-left: 4px solid var(--error); }
    .dag-node-title {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .dag-edge {
      display: flex;
      gap: 6px;
      align-items: center;
      color: var(--muted);
      font-size: 12px;
      padding-left: 10px;
    }
    .run-detail {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 360px;
      overflow: auto;
      background: var(--code);
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
    }
    .token-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }
    .token-table th, .token-table td {
      border-top: 1px solid var(--line);
      padding: 6px 4px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    section {
      margin-bottom: 20px;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 16px;
      letter-spacing: 0;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 15px;
      letter-spacing: 0;
    }
    h4 {
      margin: 12px 0 6px;
      font-size: 13px;
      letter-spacing: 0;
    }
    h5 {
      margin: 10px 0 6px;
      font-size: 13px;
      letter-spacing: 0;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .repo, .nav-item {
      padding: 12px 0;
      border-top: 1px solid var(--line);
    }
    .repo:first-of-type, .nav-item:first-of-type { border-top: 0; }
    .repo-title, .nav-title {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .empty, .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .issue-link, .goal-link {
      display: block;
      padding: 6px 0;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .diagnostics {
      display: grid;
      gap: 8px;
    }
    .diagnostic, .issue, .ledger-card, .subtree, .gate, .evidence, .phase-block {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
    }
    .diagnostic[data-status="error"] { border-color: #fecaca; }
    .diagnostic[data-status="timeout"], .diagnostic[data-status="partial"] { border-color: #fed7aa; }
    .ledger-card {
      margin-bottom: 14px;
    }
    .subtree {
      margin: 10px 0 0 16px;
      background: #fbfcfe;
    }
    .phase-block {
      margin-top: 8px;
      padding: 10px;
    }
    .phase-active {
      border-color: #99d6cd;
      background: var(--accent-soft);
    }
    .gate {
      margin-top: 8px;
      border-color: #fed7aa;
      background: var(--warn-soft);
    }
    .evidence {
      margin-top: 8px;
      background: #fbfcfe;
    }
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 6px 0;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 2px 6px;
      color: var(--muted);
      font-size: 12px;
      background: #fbfcfe;
      overflow-wrap: anywhere;
    }
    .tag.ok { color: var(--accent); border-color: #99d6cd; background: var(--accent-soft); }
    .tag.error { color: var(--error); border-color: #fecaca; background: var(--error-soft); }
    .tag.partial, .tag.timeout, .tag.warn { color: var(--warn); border-color: #fed7aa; background: var(--warn-soft); }
    .tag.muted { color: var(--muted); background: #f1f5f9; }
    dl {
      display: grid;
      grid-template-columns: minmax(132px, max-content) minmax(0, 1fr);
      gap: 4px 12px;
      margin: 8px 0 0;
      font-size: 13px;
    }
    dt { color: var(--muted); }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    code {
      background: var(--code);
      border-radius: 4px;
      padding: 1px 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    details {
      margin-top: 8px;
      font-size: 13px;
    }
    summary {
      cursor: pointer;
      color: var(--muted);
    }
    .run {
      border-top: 1px solid var(--line);
      padding-top: 10px;
      margin-top: 10px;
    }
    .artifact {
      margin-top: 8px;
      display: grid;
      gap: 6px;
    }
    .artifact img {
      max-width: min(520px, 100%);
      max-height: 280px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      object-fit: contain;
    }
    @media (max-width: 760px) {
      main { display: block; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .content { padding: 14px; }
      .observer-workspace { grid-template-columns: 1fr; }
      dl { grid-template-columns: 1fr; }
      .subtree { margin-left: 0; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Moebius Observer</h1>
    <div class="meta">read on load · ${escapeHtml(model.generatedAt)}</div>
  </header>
  <main>
    <aside>
      <section>
        <h2>Project filter</h2>
        ${renderProjectFilter(model, selected)}
      </section>
    </aside>
    <div class="content">
      <section>
        <h2>Issue execution DAG</h2>
        ${renderExecutionWorkspace(model, selected)}
      </section>
      <section>
        <h2>Diagnostics</h2>
        ${renderDiagnostics(model)}
      </section>
      <section>
        <h2>Goal ledger tree</h2>
        ${renderGoalNav(model.ledger)}
        ${renderLedgerTree(model.ledger)}
      </section>
      <section>
        <h2>Unlinked local runs</h2>
        ${renderUnlinkedRuns(model.ledger.unlinkedRuns)}
      </section>
      <section>
        <h2>Legacy issue/run records</h2>
        ${renderIssues(model)}
      </section>
    </div>
  </main>
</body>
</html>`;
}

export function isImageUrl(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  return /\.(png|jpe?g|gif|webp|svg)$/.test(pathname);
}

interface ResolvedSelection {
  project: ObserverRepositoryView | null;
  issue: ObserverIssueView | null;
  runId: string | null;
}

function resolveSelection(model: ObserverModel, selection: ObserverRenderSelection): ResolvedSelection {
  const project =
    model.repositories.find((repository) => repository.key === selection.projectKey) ??
    model.repositories.find((repository) => repository.hasRecords) ??
    model.repositories[0] ??
    null;
  const issue =
    project?.issues.find((candidate) => candidate.key === selection.issueKey) ??
    project?.issues[0] ??
    null;
  const runIds = new Set(
    issue?.execution.nodes.filter((node) => node.kind === "codex-run").map((node) => node.id) ?? [],
  );
  const runId =
    selection.runId !== undefined && runIds.has(selection.runId)
      ? selection.runId
      : issue?.execution.nodes.find((node) => node.kind === "codex-run")?.id ?? null;

  return { project, issue, runId };
}

function renderProjectFilter(model: ObserverModel, selected: ResolvedSelection): string {
  if (!model.configUsable) {
    return `<p class="empty">配置读取失败，无法确认 WATCH_REPOSITORIES。</p>`;
  }

  if (model.repositories.length === 0) {
    return `<p class="empty">WATCH_REPOSITORIES 为空。</p>`;
  }

  return `<div class="nav-item">
    <div class="tag-row"><span class="tag">source WATCH_REPOSITORIES</span></div>
    ${model.repositories
      .map((repository) => {
        const active = selected.project?.key === repository.key;
        return `<a class="issue-link" href="${escapeAttribute(selectionHref({ project: repository.key }))}">
          ${active ? "› " : ""}${escapeHtml(repository.key)} · issues ${repository.issues.length}${
            repository.hasRecords ? "" : " · 没有记录"
          }
        </a>`;
      })
      .join("")}
  </div>`;
}

function renderExecutionWorkspace(model: ObserverModel, selected: ResolvedSelection): string {
  if (!model.configUsable) {
    return `<p class="empty">配置读取失败，暂不展示 issue 执行 DAG。</p>`;
  }
  if (selected.project === null) {
    return `<p class="empty">没有配置 WATCH_REPOSITORIES。</p>`;
  }

  return `<div class="observer-workspace">
    <div class="selector-panel">
      <h3>Project</h3>
      <div class="tag-row"><span class="tag ok">${escapeHtml(selected.project.key)}</span></div>
      <h3>Issue</h3>
      ${renderIssueSelector(selected.project, selected.issue)}
    </div>
    <div class="dag-panel">
      ${selected.issue === null ? `<p class="empty">该项目没有本地 issue 记录。</p>` : renderIssueDag(selected.issue, selected)}
    </div>
    <div class="token-panel">
      ${selected.issue === null ? `<p class="empty">没有 token manifest。</p>` : renderTokenPanel(selected.issue)}
    </div>
  </div>`;
}

function renderIssueSelector(repository: ObserverRepositoryView, selectedIssue: ObserverIssueView | null): string {
  if (repository.issues.length === 0) {
    return `<p class="empty">没有记录</p>`;
  }

  return `<div>
    ${repository.issues
      .map((issue) => {
        const active = selectedIssue?.key === issue.key;
        return `<a class="issue-link" href="${escapeAttribute(selectionHref({ project: repository.key, issue: issue.key }))}">
          ${active ? "› " : ""}issue ${issue.number} · ${escapeHtml(issue.latestRunStage ?? "no manifest")}
        </a>`;
      })
      .join("")}
  </div>`;
}

function renderIssueDag(issue: ObserverIssueView, selected: ResolvedSelection): string {
  return `<article>
    <h3>${escapeHtml(issue.key)}</h3>
    <div class="tag-row">
      ${issue.sources.map((source) => `<span class="tag">${escapeHtml(source)}</span>`).join("")}
      <span class="tag">nodes ${issue.execution.nodes.length}</span>
      <span class="tag">edges ${issue.execution.edges.length}</span>
    </div>
    ${renderDagNodes(issue, selected)}
    ${renderDagEdges(issue)}
    ${renderSelectedRunDetail(issue, selected.runId)}
  </article>`;
}

function renderDagNodes(issue: ObserverIssueView, selected: ResolvedSelection): string {
  if (issue.execution.nodes.length === 0) {
    return `<p class="empty">没有可构造 DAG 的本地事实。</p>`;
  }

  return `<div class="dag">
    ${issue.execution.nodes.map((node, index) => renderDagNode(issue, node, index, selected)).join("")}
  </div>`;
}

function renderDagNode(issue: ObserverIssueView, node: ObserverExecutionNodeView, index: number, selected: ResolvedSelection): string {
  const tags = [
    `kind=${node.kind}`,
    `status=${node.status}`,
    node.role === undefined ? null : `role=${node.role}`,
    node.stage === undefined ? null : `stage=${node.stage}`,
    node.reason === undefined ? null : `reason=${node.reason}`,
    node.failureCount === undefined ? null : `failureCount=${node.failureCount}`,
    node.deadLetter === true ? "deadLetter=true" : null,
  ].filter((tag): tag is string => tag !== null);
  const body = `<div class="dag-node-title">${escapeHtml(`${index + 1}. ${node.title}`)}</div>
    <div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="muted">${escapeHtml(node.completedAt)}</div>`;

  if (node.kind !== "codex-run") {
    return `<div class="dag-node" data-status="${escapeAttribute(node.status)}">${body}</div>`;
  }

  return `<a class="dag-node" data-status="${escapeAttribute(node.status)}" href="${escapeAttribute(
    selectionHref({ project: `${issue.owner}/${issue.repo}`, issue: issue.key, run: node.id }),
  )}" aria-current="${selected.runId === node.id ? "true" : "false"}">${body}</a>`;
}

function renderDagEdges(issue: ObserverIssueView): string {
  if (issue.execution.edges.length === 0) {
    return `<p class="empty">没有 DAG edge。</p>`;
  }

  return `<section>
    <h4>Edges</h4>
    ${issue.execution.edges
      .map((edge) => `<div class="dag-edge"><code>${escapeHtml(edge.from)}</code><span>→</span><code>${escapeHtml(edge.to)}</code><span>${escapeHtml(edge.label)}</span></div>`)
      .join("")}
  </section>`;
}

function renderSelectedRunDetail(issue: ObserverIssueView, runId: string | null): string {
  const runNode = issue.execution.nodes.find((node) => node.id === runId && node.kind === "codex-run");
  const run = runNode?.run;
  if (run === undefined || runNode === undefined) {
    return `<section class="detail-panel"><h4>Codex run detail</h4><p class="empty">选择 Codex run 节点查看输入上下文与输出全文。</p></section>`;
  }

  return `<section class="detail-panel">
    <h4>Codex run detail</h4>
    <div class="tag-row">
      <span class="tag ok">selected ${escapeHtml(runNode.id)}</span>
      <span class="tag">${escapeHtml(run.role)}</span>
      <span class="tag">${escapeHtml(run.stage)}</span>
    </div>
    <h5>Agent input context</h5>
    ${renderRunDetailBlock(run.details?.inputContext ?? unavailableDetail("input context"))}
    <h5>Agent output full text</h5>
    ${renderRunDetailBlock(run.details?.output ?? unavailableDetail("agent output"))}
  </section>`;
}

function renderRunDetailBlock(detail: ObserverRunDetailReadResult): string {
  const status = detail.status === "ok" ? "ok" : detail.status === "timeout" || detail.status === "missing" ? "partial" : "error";
  const content = detail.status === "ok" ? sanitizeDetail(detail.content ?? "") : (detail.message ?? detail.status);
  return `<div class="tag-row"><span class="tag ${status}">${escapeHtml(detail.status)}</span><span class="tag">${escapeHtml(
    detail.source,
  )}</span></div><pre class="run-detail">${escapeHtml(content)}</pre>`;
}

function unavailableDetail(source: string): ObserverRunDetailReadResult {
  return { status: "unavailable", source, message: "detail-read-unavailable" };
}

function renderTokenPanel(issue: ObserverIssueView): string {
  const summary = issue.execution.tokenSummary;
  return `<h3>Token panel</h3>
    <div class="tag-row">
      <span class="tag">input ${formatTokenValue(summary.inputTokens.value, summary.inputTokens.unknown)}</span>
      <span class="tag">output ${formatTokenValue(summary.outputTokens.value, summary.outputTokens.unknown)}</span>
      <span class="tag">cached ${formatTokenValue(summary.cachedInputTokens.value, summary.cachedInputTokens.unknown)}</span>
      <span class="tag ${summary.unknownDenominator ? "partial" : "ok"}">cached share ${escapeHtml(summary.cachedShare)}${
        summary.unknownDenominator ? " · unknown 分母" : ""
      }</span>
    </div>
    ${summary.runs.length === 0 ? `<p class="empty">没有 token usage manifest。</p>` : renderRunTokenTable(summary.runs)}`;
}

function renderRunTokenTable(runs: ObserverRunTokenView[]): string {
  return `<table class="token-table">
    <thead>
      <tr><th>run</th><th>input</th><th>output</th><th>cached</th><th>share</th><th>health</th></tr>
    </thead>
    <tbody>
      ${runs
        .map(
          (run) => `<tr>
            <td>${escapeHtml(run.role)}<br><code>${escapeHtml(run.runId)}</code></td>
            <td>${renderTokenCell(run.inputTokens)}</td>
            <td>${renderTokenCell(run.outputTokens)}</td>
            <td>${renderTokenCell(run.cachedInputTokens)}</td>
            <td>${escapeHtml(run.cachedShare)}${run.unknownDenominator ? "<br>unknown denominator" : ""}</td>
            <td>${run.cacheSuspicious ? `<span class="tag warn">缓存疑似失效</span>` : `<span class="tag ok">normal</span>`}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderTokenCell(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function formatTokenValue(value: number, unknown: boolean): string {
  return unknown ? `${value} known + unknown` : String(value);
}

function selectionHref(input: { project?: string; issue?: string; run?: string }): string {
  const params = new URLSearchParams();
  if (input.project !== undefined) {
    params.set("project", input.project);
  }
  if (input.issue !== undefined) {
    params.set("issue", input.issue);
  }
  if (input.run !== undefined) {
    params.set("run", input.run);
  }
  const query = params.toString();
  return query.length === 0 ? "/" : `/?${query}`;
}

const DETAIL_HIDDEN_KEY_PATTERN =
  /moebius-(?:orchestration|roundtable|roundtable-completion|integration-acceptance)-key:[a-f0-9]{16,64}/giu;
const TOKEN_LIKE_PATTERN =
  /\b(?:ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/gu;
const LOCAL_ABSOLUTE_PATH_PATTERN = /(?:\/Users\/[^\s"'<>]+|\/tmp\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/gu;

function sanitizeDetail(value: string): string {
  return value
    .replace(DETAIL_HIDDEN_KEY_PATTERN, "[hidden-key]")
    .replace(TOKEN_LIKE_PATTERN, "[redacted]")
    .replace(LOCAL_ABSOLUTE_PATH_PATTERN, "[local-path]");
}

function renderGoalNav(ledger: ObserverLedgerView): string {
  const status = ledger.status === "ok" ? "ok" : ledger.status === "timeout" ? "timeout" : ledger.status === "error" ? "error" : "muted";
  const goalLinks = ledger.goals
    .map(
      (goal) => `<a class="goal-link" href="#${escapeAttribute(goalDomId(goal))}">${escapeHtml(goal.title)} · ${escapeHtml(
        goal.phases.statusLabel,
      )} · waiting gates ${countGoalGates(goal)}</a>`,
    )
    .join("");

  return `<div class="nav-item">
    <div class="tag-row">
      <span class="tag ${status}">ledger ${escapeHtml(ledger.status)}</span>
      <span class="tag">filtered ledger goals ${ledger.filteredGoalCount} not watched</span>
      <span class="tag">Unlinked local runs ${ledger.unlinkedRuns.length}</span>
    </div>
    ${goalLinks.length === 0 ? `<p class="empty">${ledgerStatusEmptyText(ledger)}</p>` : goalLinks}
  </div>`;
}

function renderRepositoryList(model: ObserverModel): string {
  if (!model.configUsable) {
    return `<p class="empty">配置读取失败，无法确认白名单 repository。</p>`;
  }

  if (model.repositories.length === 0) {
    return `<p class="empty">没有配置白名单 repository。</p>`;
  }

  return model.repositories.map(renderRepositoryNav).join("");
}

function renderRepositoryNav(repository: ObserverRepositoryView): string {
  const issueLinks = repository.issues
    .map(
      (issue) => `<a class="issue-link" href="#${escapeAttribute(issueDomId(issue))}">issue ${issue.number} · ${escapeHtml(
        issue.latestRunStage ?? "no manifest",
      )}</a>`,
    )
    .join("");

  return `<div class="repo">
    <div class="repo-title">${escapeHtml(repository.key)}</div>
    ${repository.hasRecords ? issueLinks : `<div class="empty">没有记录</div>`}
  </div>`;
}

function renderDiagnostics(model: ObserverModel): string {
  const ledgerDiagnostics =
    model.ledger.filteredGoalCount > 0
      ? [
          {
            source: "filtered ledger goals",
            status: "partial" as const,
            message: `${model.ledger.filteredGoalCount} not watched`,
          },
        ]
      : [];
  const diagnostics: ObserverDiagnostic[] = [...model.diagnostics, ...ledgerDiagnostics];
  if (diagnostics.length === 0) {
    return `<p class="empty">没有诊断信息。</p>`;
  }

  return `<div class="diagnostics">${diagnostics.map(renderDiagnostic).join("")}</div>`;
}

function renderDiagnostic(diagnostic: ObserverDiagnostic): string {
  return `<div class="diagnostic" data-status="${escapeAttribute(diagnostic.status)}">
    <div class="tag-row">
      <span class="tag ${diagnostic.status}">${escapeHtml(statusLabel(diagnostic.status))}</span>
      <span class="tag">${escapeHtml(diagnostic.source)}</span>
      ${diagnostic.line === undefined ? "" : `<span class="tag">line ${diagnostic.line}</span>`}
    </div>
    <div>${escapeHtml(diagnostic.message)}</div>
  </div>`;
}

function renderLedgerTree(ledger: ObserverLedgerView): string {
  if (ledger.status === "error") {
    return `<div class="ledger-card"><p class="empty">账本读取失败，树视图暂不可用。</p></div>`;
  }
  if (ledger.status === "timeout") {
    return `<div class="ledger-card"><p class="empty">目标账本读取超时，树视图暂不可用。</p></div>`;
  }
  if (ledger.status === "missing") {
    return `<div class="ledger-card"><p class="empty">目标账本缺失，树视图暂不可用。</p></div>`;
  }
  if (ledger.goals.length === 0) {
    return `<div class="ledger-card"><p class="empty">没有 watched ledger goal。</p></div>`;
  }

  return ledger.goals.map(renderGoal).join("");
}

function renderGoal(goal: ObserverGoalView): string {
  return `<article class="ledger-card" id="${escapeAttribute(goalDomId(goal))}">
    <h3>Goal ${escapeHtml(goal.title)}</h3>
    <div class="tag-row">
      <span class="tag">${escapeHtml(goal.id)}</span>
      <span class="tag">status ${escapeHtml(goal.status)}</span>
      <span class="tag">quality ${escapeHtml(goal.qualityBaseline)}</span>
      <span class="tag warn">waiting gates ${countGoalGates(goal)}</span>
    </div>
    ${renderIssueRefs("Issue refs", goal.issueRefs)}
    ${renderPhaseSummary(goal.phases)}
    ${goal.milestones.map(renderMilestone).join("")}
    ${renderUnassignedTasks(goal.unassignedTasks)}
  </article>`;
}

function renderMilestone(milestone: ObserverMilestoneView): string {
  return `<section class="subtree">
    <h4>Milestone ${escapeHtml(milestone.title)}</h4>
    <div class="tag-row">
      <span class="tag">${escapeHtml(milestone.id)}</span>
      <span class="tag">quality ${escapeHtml(milestone.qualityBaseline)}</span>
    </div>
    ${renderIssueRefs("Issue refs", milestone.issueRefs)}
    ${renderPhaseSummary(milestone.phases)}
    ${milestone.tasks.map(renderTask).join("")}
  </section>`;
}

function renderUnassignedTasks(tasks: ObserverTaskView[]): string {
  if (tasks.length === 0) {
    return "";
  }

  return `<section class="subtree">
    <h4>未归属里程碑任务</h4>
    ${tasks.map(renderTask).join("")}
  </section>`;
}

function renderTask(task: ObserverTaskView): string {
  return `<section class="subtree">
    <h5>Task ${escapeHtml(task.title)}</h5>
    <div class="tag-row">
      <span class="tag">${escapeHtml(task.id)}</span>
      <span class="tag">readiness ${escapeHtml(task.status)}</span>
      <span class="tag">quality ${escapeHtml(task.qualityBaseline)}</span>
      <span class="tag">acceptance statements ${task.acceptanceStatementCount}</span>
    </div>
    <dl>
      <dt>readiness missing</dt><dd>${escapeHtml(task.readinessMissing.length === 0 ? "none" : task.readinessMissing.join(", "))}</dd>
      <dt>dependencies</dt><dd>${escapeHtml(task.dependencies.length === 0 ? "none" : task.dependencies.join(", "))}</dd>
      <dt>scope</dt><dd>${escapeHtml(task.scope)}</dd>
      <dt>latest child acceptance</dt><dd>${escapeHtml(task.acceptanceSummary)}</dd>
      <dt>parent issue ref</dt><dd>${task.parentIssueRef === null ? "missing" : renderIssueRef(task.parentIssueRef)}</dd>
    </dl>
    ${renderIssueRefs("Child issue refs", task.childIssueRefs)}
    ${renderPhaseSummary(task.phases)}
    ${renderIntegrationEvents(task.integrationEvents)}
    ${renderGates(task.gates)}
    ${renderRunEvidenceList(task.runEvidence)}
  </section>`;
}

function renderPhaseSummary(phases: ObserverOwnerPhaseView): string {
  const owner = `${phases.owner.kind}:${phases.owner.id}`;
  const active = phases.active === null ? `<p class="empty">${escapeHtml(phases.statusLabel)}</p>` : renderPhase(phases.active, true);
  const error =
    phases.error === null
      ? ""
      : `<div class="tag-row"><span class="tag error">ledger error</span><span class="tag error">${escapeHtml(phases.error)}</span></div>`;
  const secondary =
    phases.secondary.length === 0
      ? ""
      : `<details><summary>pending/completed phases (${phases.secondary.length})</summary>${phases.secondary
          .map((phase) => renderPhase(phase, false))
          .join("")}</details>`;

  return `<section>
    <h4>Phase owner ${escapeHtml(owner)}</h4>
    <div class="tag-row"><span class="tag ${phases.error === null ? "ok" : "error"}">${escapeHtml(phases.statusLabel)}</span></div>
    ${error}
    ${active}
    ${secondary}
  </section>`;
}

function renderPhase(phase: ObserverPhaseView, active: boolean): string {
  return `<div class="phase-block ${active ? "phase-active" : ""}">
    <div><strong>${active ? "active phase" : `${phase.status} phase`}: ${escapeHtml(phase.name)}</strong></div>
    <dl>
      <dt>phase id</dt><dd>${escapeHtml(phase.id)}</dd>
      <dt>objective</dt><dd>${escapeHtml(phase.objective)}</dd>
      <dt>quality baseline</dt><dd>${escapeHtml(phase.qualityBaseline)}</dd>
      <dt>acceptance statements</dt><dd>${phase.acceptanceStatementCount}</dd>
      <dt>dependencies</dt><dd>${escapeHtml(phase.dependencies.length === 0 ? "none" : phase.dependencies.join(", "))}</dd>
    </dl>
  </div>`;
}

function renderIssueRefs(title: string, refs: ObserverIssueRefView[]): string {
  if (refs.length === 0) {
    return `<section><h4>${escapeHtml(title)}</h4><p class="empty">none</p></section>`;
  }

  return `<section>
    <h4>${escapeHtml(title)}</h4>
    <div class="tag-row">${refs.map(renderIssueRef).join("")}</div>
  </section>`;
}

function renderIssueRef(ref: ObserverIssueRefView): string {
  const watchStatus = ref.watched ? "" : " · not watched / no live poll status";
  const roundtable = ref.roundtableChild ? " · roundtable child" : "";
  const note = ref.notePreview === null ? "" : ` · note ${ref.notePreview}`;
  const css = ref.watched ? "" : " muted";
  return `<span class="tag${css}">${escapeHtml(`${ref.label} · ${ref.relation} · ${ref.status}${watchStatus}${roundtable}${note}`)}</span>`;
}

function renderIntegrationEvents(events: ObserverTaskView["integrationEvents"]): string {
  if (events.length === 0) {
    return `<section><h4>Integration acceptance event</h4><p class="empty">none</p></section>`;
  }

  return `<section>
    <h4>Integration acceptance event</h4>
    ${events
      .map(
        (event) => `<dl>
          <dt>status</dt><dd>${escapeHtml(event.status)}</dd>
          <dt>reviewer</dt><dd>${escapeHtml(event.reviewerRole)}</dd>
          <dt>parent issue</dt><dd>${escapeHtml(event.parentIssue)}</dd>
          <dt>capturedAt</dt><dd>${escapeHtml(event.capturedAt)}</dd>
        </dl>`,
      )
      .join("")}
  </section>`;
}

function renderGates(gates: ObserverGateView[]): string {
  if (gates.length === 0) {
    return `<section><h4>Human gates</h4><p class="empty">none waiting</p></section>`;
  }

  return `<section>
    <h4>Human gates</h4>
    ${gates
      .map(
        (gate) => `<div class="gate">
          <dl>
            <dt>waiting</dt><dd>${escapeHtml(gate.label)}</dd>
            <dt>basis</dt><dd>${escapeHtml(gate.basis)}</dd>
            <dt>next issue</dt><dd>${escapeHtml(gate.nextIssue)}</dd>
          </dl>
        </div>`,
      )
      .join("")}
  </section>`;
}

function renderRunEvidenceList(evidence: ObserverRunEvidenceView[]): string {
  if (evidence.length === 0) {
    return `<section><h4>Run evidence</h4><p class="empty">none</p></section>`;
  }

  return `<section>
    <h4>Run evidence</h4>
    ${evidence
      .map(
        (item) => `<div class="evidence">
          <div><strong>run evidence</strong>: ${escapeHtml(item.label)} · ${escapeHtml(item.resolution)}</div>
          ${item.run === null ? `<p class="empty">manifest record not loaded</p>` : renderRun(item.run)}
        </div>`,
      )
      .join("")}
  </section>`;
}

function renderUnlinkedRuns(runs: ObserverRunManifestRecord[]): string {
  if (runs.length === 0) {
    return `<p class="empty">没有 unlinked local runs。</p>`;
  }

  return runs.map(renderRun).join("");
}

function renderIssues(model: ObserverModel): string {
  const issues = model.repositories.flatMap((repository) => repository.issues);
  if (issues.length === 0) {
    return model.configUsable
      ? `<p class="empty">没有本地 issue 记录。</p>`
      : `<p class="empty">配置读取失败，暂不展示 issue 记录。</p>`;
  }

  return issues.map(renderIssue).join("");
}

function renderIssue(issue: ObserverIssueView): string {
  return `<article class="issue" id="${escapeAttribute(issueDomId(issue))}">
    <h3>${escapeHtml(issue.key)}</h3>
    <div class="tag-row">
      ${issue.sources.map((source) => `<span class="tag">${escapeHtml(source)}</span>`).join("")}
      <span class="tag">latest run: ${escapeHtml(issue.latestRunStage ?? "no manifest")}</span>
    </div>
    ${renderIntake(issue)}
    ${renderRoleThreads(issue)}
    ${renderAgentContexts(issue)}
    ${renderRuns(issue)}
  </article>`;
}

function renderIntake(issue: ObserverIssueView): string {
  if (issue.intake === null) {
    return `<section><h4>Intake</h4><p class="empty">没有 intake 记录。</p></section>`;
  }

  const failureCount = issue.intake.failureCount ?? 0;
  return `<section>
    <h4>Intake</h4>
    <dl>
      <dt>mode</dt><dd>${escapeHtml(issue.intake.mode)}</dd>
      <dt>updatedAt</dt><dd>${escapeHtml(issue.intake.updatedAt)}</dd>
      <dt>nextPollAt</dt><dd>${escapeHtml(issue.intake.nextPollAt ?? "null")}</dd>
      <dt>failureCount</dt><dd>${failureCount}</dd>
      <dt>lastFailureReason</dt><dd>${escapeHtml(issue.intake.lastFailureReason ?? "none")}</dd>
    </dl>
  </section>`;
}

function renderRoleThreads(issue: ObserverIssueView): string {
  if (issue.roleThreads.length === 0) {
    return `<section><h4>Role threads</h4><p class="empty">没有 role thread 记录。</p></section>`;
  }

  return `<section>
    <h4>Role threads</h4>
    ${issue.roleThreads
      .map(
        ({ role, state }) => `<dl>
          <dt>role</dt><dd>${escapeHtml(role)}</dd>
          <dt>lastSeenIndex</dt><dd>${state.lastSeenIndex}</dd>
          <dt>threadId</dt><dd title="${escapeAttribute(state.threadId)}">${escapeHtml(shorten(state.threadId))}</dd>
        </dl>`,
      )
      .join("")}
  </section>`;
}

function renderAgentContexts(issue: ObserverIssueView): string {
  if (issue.agentContexts.length === 0) {
    return `<section><h4>Agent contexts</h4><p class="empty">没有 agent context 记录。</p></section>`;
  }

  return `<section>
    <h4>Agent contexts</h4>
    ${issue.agentContexts
      .map(
        ({ role, state }) => `<dl>
          <dt>role</dt><dd>${escapeHtml(role)}</dd>
          <dt>preScript</dt><dd>${escapeHtml(state.preScript)}</dd>
          <dt>preparedFromMessageIndex</dt><dd>${state.preparedFromMessageIndex}</dd>
          <dt>worktreePath</dt><dd>${escapeHtml(state.worktreePath)}</dd>
        </dl>`,
      )
      .join("")}
  </section>`;
}

function renderRuns(issue: ObserverIssueView): string {
  if (issue.runs.length === 0) {
    return `<section><h4>Runs</h4><p class="empty">没有 run manifest 记录。</p></section>`;
  }

  return `<section>
    <h4>Runs</h4>
    ${issue.runs.map(renderRun).join("")}
  </section>`;
}

function renderRun(run: ObserverRunManifestRecord): string {
  const line = run.lineNumber === undefined ? "" : `line ${run.lineNumber} · `;
  return `<div class="run">
    <div><strong>${escapeHtml(run.completedAt)}</strong> · ${escapeHtml(line)}${escapeHtml(run.role)} · ${escapeHtml(run.stage)} · ${escapeHtml(
      `${run.issue.owner}/${run.issue.repo} issue ${run.issue.number}`,
    )}</div>
    <div class="muted">started ${escapeHtml(run.startedAt)}</div>
    ${run.artifacts.length === 0 ? `<p class="empty">没有 artifact。</p>` : run.artifacts.map(renderArtifact).join("")}
  </div>`;
}

function renderArtifact(artifact: ObserverRunManifestRecord["artifacts"][number]): string {
  if (artifact.publishedUrl === null) {
    return `<div class="artifact"><div><span class="tag partial">未发布</span> <code>${escapeHtml(artifact.path)}</code></div></div>`;
  }

  const url = artifact.publishedUrl;
  return `<div class="artifact">
    ${isImageUrl(url) ? `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(artifact.path)}">` : ""}
    <div><a href="${escapeAttribute(url)}" rel="noreferrer">${escapeHtml(url)}</a></div>
    <div class="muted"><code>${escapeHtml(artifact.path)}</code></div>
  </div>`;
}

function statusLabel(status: ObserverSourceStatus): string {
  switch (status) {
    case "ok":
      return "正常";
    case "missing":
      return "缺失";
    case "error":
      return "读取失败";
    case "partial":
      return "部分可用";
    case "timeout":
      return "读取超时";
  }
}

function ledgerStatusEmptyText(ledger: ObserverLedgerView): string {
  switch (ledger.status) {
    case "error":
      return "账本读取失败，树视图暂不可用。";
    case "timeout":
      return "目标账本读取超时，树视图暂不可用。";
    case "missing":
      return "目标账本缺失，树视图暂不可用。";
    case "ok":
      return "没有 watched ledger goal。";
  }
}

function countGoalGates(goal: ObserverGoalView): number {
  return (
    goal.unassignedTasks.reduce((count, task) => count + task.gates.length, 0) +
    goal.milestones.reduce((count, milestone) => count + milestone.tasks.reduce((taskCount, task) => taskCount + task.gates.length, 0), 0)
  );
}

function issueDomId(issue: ObserverIssueView): string {
  return `issue-${issue.owner}-${issue.repo}-${issue.number}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function goalDomId(goal: ObserverGoalView): string {
  return `goal-${goal.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function shorten(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
