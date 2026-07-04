import type { ObserverDiagnostic, ObserverSourceStatus } from "./read-state.js";
import type { ObserverIssueView, ObserverModel, ObserverRepositoryView } from "./model.js";

export function renderObserverPage(model: ObserverModel): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Moebius Observer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #64748b;
      --line: #d7dde6;
      --accent: #0f766e;
      --warn: #b45309;
      --error: #b91c1c;
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
      font-size: 14px;
      letter-spacing: 0;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .repo {
      padding: 12px 0;
      border-top: 1px solid var(--line);
    }
    .repo:first-of-type { border-top: 0; }
    .repo-title {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .empty, .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .issue-link {
      display: block;
      padding: 6px 0;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .diagnostics {
      display: grid;
      gap: 8px;
    }
    .diagnostic, .issue {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
    }
    .diagnostic[data-status="error"] { border-color: #fecaca; }
    .diagnostic[data-status="partial"] { border-color: #fed7aa; }
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
    }
    .tag.error { color: var(--error); border-color: #fecaca; background: #fef2f2; }
    .tag.partial { color: var(--warn); border-color: #fed7aa; background: #fff7ed; }
    dl {
      display: grid;
      grid-template-columns: minmax(120px, max-content) minmax(0, 1fr);
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
      dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Agent Moebius Observer</h1>
    <div class="meta">read on load · ${escapeHtml(model.generatedAt)}</div>
  </header>
  <main>
    <aside>
      <section>
        <h2>Whitelisted repositories</h2>
        ${renderRepositoryList(model)}
      </section>
    </aside>
    <div class="content">
      <section>
        <h2>Diagnostics</h2>
        ${renderDiagnostics(model.diagnostics)}
      </section>
      <section>
        <h2>Issues</h2>
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

function renderDiagnostics(diagnostics: ObserverDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return `<p class="empty">没有诊断信息。</p>`;
  }

  return `<div class="diagnostics">${diagnostics.map(renderDiagnostic).join("")}</div>`;
}

function renderDiagnostic(diagnostic: ObserverDiagnostic): string {
  return `<div class="diagnostic" data-status="${escapeAttribute(diagnostic.status)}">
    <div class="tag-row">
      <span class="tag ${diagnostic.status === "error" ? "error" : diagnostic.status === "partial" ? "partial" : ""}">${escapeHtml(
        statusLabel(diagnostic.status),
      )}</span>
      <span class="tag">${escapeHtml(diagnostic.source)}</span>
      ${diagnostic.line === undefined ? "" : `<span class="tag">line ${diagnostic.line}</span>`}
    </div>
    <div>${escapeHtml(diagnostic.message)}</div>
  </div>`;
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
    return `<section><h3>Intake</h3><p class="empty">没有 intake 记录。</p></section>`;
  }

  const failureCount = issue.intake.failureCount ?? 0;
  return `<section>
    <h3>Intake</h3>
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
    return `<section><h3>Role threads</h3><p class="empty">没有 role thread 记录。</p></section>`;
  }

  return `<section>
    <h3>Role threads</h3>
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
    return `<section><h3>Agent contexts</h3><p class="empty">没有 agent context 记录。</p></section>`;
  }

  return `<section>
    <h3>Agent contexts</h3>
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
    return `<section><h3>Runs</h3><p class="empty">没有 run manifest 记录。</p></section>`;
  }

  return `<section>
    <h3>Runs</h3>
    ${issue.runs.map(renderRun).join("")}
  </section>`;
}

function renderRun(run: ObserverIssueView["runs"][number]): string {
  return `<div class="run">
    <div><strong>${escapeHtml(run.completedAt)}</strong> · ${escapeHtml(run.role)} · ${escapeHtml(run.stage)}</div>
    <div class="muted">started ${escapeHtml(run.startedAt)}</div>
    ${run.artifacts.length === 0 ? `<p class="empty">没有 artifact。</p>` : run.artifacts.map(renderArtifact).join("")}
  </div>`;
}

function renderArtifact(artifact: ObserverIssueView["runs"][number]["artifacts"][number]): string {
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
  }
}

function issueDomId(issue: ObserverIssueView): string {
  return `issue-${issue.owner}-${issue.repo}-${issue.number}`.replace(/[^a-zA-Z0-9_-]/g, "-");
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
