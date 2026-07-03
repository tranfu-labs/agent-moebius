import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SERVER_READY_TIMEOUT_MS = 5_000;
const BROWSER_LAUNCH_TIMEOUT_MS = 15_000;
const PAGE_GOTO_TIMEOUT_MS = 10_000;
const PAGE_READY_TIMEOUT_MS = 5_000;
const PAGE_STABLE_TIMEOUT_MS = 10_000;
const SCREENSHOT_TIMEOUT_MS = 10_000;
const DEFAULT_SPIKE_PREVIEW_ORACLE_READY_SELECTOR = "[data-spike-preview-ready=\"true\"]";
const SPIKE_PREVIEW_ORACLE_READY_SELECTOR =
  process.env.SPIKE_PREVIEW_ORACLE_READY_SELECTOR || DEFAULT_SPIKE_PREVIEW_ORACLE_READY_SELECTOR;

const SUPPORTED_MEDIA_EXTENSIONS = new Set([".svg", ".gif", ".png", ".jpg", ".jpeg", ".webp"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const sourceMarkdownPath = path.join(repoRoot, "docs/roadmap/milestone-1-acceptance-loop.md");
const distDir = path.join(__dirname, "dist");
const artifactsDir = path.join(__dirname, "artifacts");
const previewHtmlPath = path.join(distDir, "preview.html");
const screenshotPath = path.join(artifactsDir, "spike-preview-oracle.png");

async function main() {
  let server = null;
  let browser = null;

  try {
    await resetOutputDirs();
    await writePreviewHtml();
    server = await startPreviewServer();

    browser = await chromium.launch({
      timeout: BROWSER_LAUNCH_TIMEOUT_MS,
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await page.goto(`${server.url}/preview.html`, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_GOTO_TIMEOUT_MS,
    });
    try {
      await page.waitForSelector(SPIKE_PREVIEW_ORACLE_READY_SELECTOR, {
        state: "attached",
        timeout: PAGE_READY_TIMEOUT_MS,
      });
    } catch (error) {
      throw new Error(`ready failed: ${formatError(error)}`);
    }
    await page.waitForLoadState("networkidle", { timeout: PAGE_STABLE_TIMEOUT_MS });
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: SCREENSHOT_TIMEOUT_MS,
    });

    await assertOnlyExpectedMedia();
    console.log(`previewHtml=${path.relative(repoRoot, previewHtmlPath)}`);
    console.log(`screenshot=${path.relative(repoRoot, screenshotPath)}`);
  } finally {
    await closeBrowser(browser);
    await closeServer(server);
  }
}

async function resetOutputDirs() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.rm(artifactsDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
}

async function writePreviewHtml() {
  const markdown = await fs.readFile(sourceMarkdownPath, "utf8");
  const html = renderHtml(markdown);
  await fs.writeFile(previewHtmlPath, html, "utf8");
}

function renderHtml(markdown) {
  const body = markdown
    .split(/\r?\n/)
    .map((line) => renderLine(line))
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Milestone 1 Acceptance Loop Preview</title>
  <style>
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #172026;
      background: #f5f7f8;
    }
    body {
      margin: 0;
      padding: 32px;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px;
      background: #ffffff;
      border: 1px solid #d7dee2;
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(23, 32, 38, 0.08);
    }
    h1, h2, h3 {
      line-height: 1.25;
      margin: 28px 0 12px;
    }
    h1 {
      margin-top: 0;
      font-size: 28px;
    }
    h2 {
      font-size: 22px;
      border-top: 1px solid #e4e9ec;
      padding-top: 20px;
    }
    h3 {
      font-size: 18px;
    }
    p, li {
      line-height: 1.65;
      font-size: 15px;
    }
    pre {
      overflow: auto;
      padding: 14px;
      background: #f0f3f5;
      border-radius: 6px;
    }
    code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.94em;
    }
  </style>
</head>
<body>
  <main data-spike-preview-ready="true">
${body}
  </main>
</body>
</html>
`;
}

function renderLine(line) {
  const escaped = escapeHtml(line);
  if (line.startsWith("### ")) {
    return `    <h3>${escapeHtml(line.slice(4))}</h3>`;
  }
  if (line.startsWith("## ")) {
    return `    <h2>${escapeHtml(line.slice(3))}</h2>`;
  }
  if (line.startsWith("# ")) {
    return `    <h1>${escapeHtml(line.slice(2))}</h1>`;
  }
  if (line.startsWith("- ")) {
    return `    <p>• ${escapeHtml(line.slice(2))}</p>`;
  }
  if (line.trim() === "") {
    return "    <br>";
  }
  return `    <p>${escaped}</p>`;
}

async function startPreviewServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = request.url ?? "/";
      if (url !== "/" && url !== "/preview.html") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("not found");
        return;
      }
      const html = await fs.readFile(previewHtmlPath);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(formatError(error));
    }
  });

  await withTimeout(
    new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    }),
    SERVER_READY_TIMEOUT_MS,
    "server-ready",
  );

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server-ready failed: no TCP address");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function assertOnlyExpectedMedia() {
  const mediaFiles = await listMediaFiles(__dirname);
  const expected = path.relative(__dirname, screenshotPath);
  const relativeFiles = mediaFiles.map((filePath) => path.relative(__dirname, filePath)).sort();

  if (relativeFiles.length !== 1 || relativeFiles[0] !== expected) {
    throw new Error(`media-check failed: expected only ${expected}, got ${relativeFiles.join(", ")}`);
  }
}

async function listMediaFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMediaFiles(fullPath));
      continue;
    }
    if (entry.isFile() && SUPPORTED_MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

async function closeBrowser(browser) {
  if (browser === null) {
    return;
  }
  try {
    await browser.close();
  } catch (error) {
    console.error(`cleanup browser failed: ${formatError(error)}`);
  }
}

async function closeServer(serverHandle) {
  if (serverHandle === null) {
    return;
  }
  await new Promise((resolve) => {
    serverHandle.server.close((error) => {
      if (error !== undefined) {
        console.error(`cleanup server failed: ${formatError(error)}`);
      }
      resolve();
    });
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(`spike-preview-oracle failed: ${formatError(error)}`);
  console.error("If Chromium is missing, run: pnpm exec playwright install chromium");
  process.exitCode = 1;
});
