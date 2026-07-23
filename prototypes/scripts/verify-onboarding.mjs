import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repositoryRoot = resolve(packageRoot, "..");
const prototypePath = resolve(
  repositoryRoot,
  "docs/product/pages/onboarding.prototype.html"
);
const artifactDir = resolve(
  repositoryRoot,
  "artifacts/acceptance/onboarding-prototype"
);
const evidencePath = resolve(artifactDir, "evidence.json");
const html = await readFile(prototypePath, "utf8");
const prototypeUrl = pathToFileURL(prototypePath).href;
const externalAttributes = [
  ...html.matchAll(/\b(?:src|href)=["']([^"'#][^"']*)["']/gu)
]
  .map((match) => match[1])
  .filter((value) => !value.startsWith("data:") && !value.startsWith("mailto:"));

if (externalAttributes.length > 0) {
  throw new Error(
    `Published HTML has external resource attributes: ${externalAttributes.join(", ")}`
  );
}

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const externalRequests = new Set();
const checks = [];

function watchExternalRequests(page) {
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      externalRequests.add(url);
    }
  });
}

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark"
  });
  const desktopPage = await desktopContext.newPage();
  watchExternalRequests(desktopPage);
  await desktopPage.goto(prototypeUrl);
  await desktopPage.getByTestId("step-1").waitFor();
  checks.push("file-url-render");

  const primary = desktopPage.getByTestId("primary-action");
  await primary.focus();
  await desktopPage.keyboard.press("Enter");
  await desktopPage.getByTestId("step-2").waitFor();
  checks.push("keyboard-step-1-to-2");

  await desktopPage.getByTestId("primary-action").click();
  await desktopPage.getByTestId("step-3").waitFor();
  await desktopPage
    .getByTestId("relay-stage")
    .getByText("边界状态已覆盖，验证通过")
    .waitFor();
  const completedRelayItems = await desktopPage
    .locator(".relay-history li.is-complete")
    .count();
  if (completedRelayItems < 4) {
    throw new Error(
      `Expected persistent relay history before closeout, found ${completedRelayItems} completed items.`
    );
  }
  await desktopPage.screenshot({
    path: resolve(artifactDir, "relay-dark-wide.png"),
    fullPage: true
  });

  await desktopPage.getByTestId("replay-relay").click();
  await desktopPage
    .getByTestId("relay-stage")
    .getByText("把需求收束成可执行方案")
    .waitFor();
  checks.push("relay-replay");

  await desktopPage.getByTestId("primary-action").click();
  await desktopPage.getByTestId("step-4").waitFor();
  await desktopPage.getByTestId("primary-action").click();
  await desktopPage.getByTestId("conversation-destination").waitFor();

  const selectedTeam = await desktopPage
    .getByTestId("selected-team")
    .textContent();
  if (!selectedTeam?.includes("开发团队")) {
    throw new Error("Selected team was not carried into the new conversation.");
  }
  checks.push("complete-journey-with-team");
  await desktopPage.screenshot({
    path: resolve(artifactDir, "conversation-dark-wide.png"),
    fullPage: true
  });
  await desktopContext.close();

  const missingContext = await browser.newContext({
    viewport: { width: 1100, height: 760 },
    colorScheme: "light"
  });
  const missingPage = await missingContext.newPage();
  watchExternalRequests(missingPage);
  await missingPage.goto(`${prototypeUrl}?scenario=missing&theme=light`);
  const missingPrimary = missingPage.getByTestId("primary-action");
  if (!(await missingPrimary.isDisabled())) {
    throw new Error("Missing Codex scenario did not disable continue.");
  }
  await missingPage.screenshot({
    path: resolve(artifactDir, "environment-missing-light.png"),
    fullPage: true
  });
  await missingPage.getByTestId("recheck").click();
  await missingPrimary.waitFor({ state: "visible" });
  await missingPage.waitForFunction(() => {
    const button = document.querySelector('[data-testid="primary-action"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await missingPrimary.click();
  await missingPage.getByTestId("step-2").waitFor();
  checks.push("missing-codex-hard-gate-and-recheck");
  await missingContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 520, height: 860 },
    colorScheme: "dark",
    reducedMotion: "reduce"
  });
  const reducedPage = await reducedContext.newPage();
  watchExternalRequests(reducedPage);
  await reducedPage.goto(prototypeUrl);
  await reducedPage.getByTestId("primary-action").click();
  await reducedPage.getByTestId("primary-action").click();
  await reducedPage.getByTestId("step-3").waitFor();

  const reduceMatches = await reducedPage.evaluate(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  if (!reduceMatches) {
    throw new Error("Reduced-motion verification context was not active.");
  }
  const historyCount = await reducedPage.locator(".relay-history li").count();
  if (historyCount !== 6) {
    throw new Error(`Expected 6 persistent relay stages, found ${historyCount}.`);
  }
  checks.push("reduced-motion-equivalent-relay");
  await reducedPage.screenshot({
    path: resolve(artifactDir, "relay-reduced-narrow.png"),
    fullPage: true
  });
  await reducedContext.close();
} finally {
  await browser.close();
}

if (externalRequests.size > 0) {
  throw new Error(
    `Prototype made external requests: ${[...externalRequests].join(", ")}`
  );
}

const evidence = {
  generatedAt: new Date().toISOString(),
  prototype: "docs/product/pages/onboarding.prototype.html",
  sha256: createHash("sha256").update(html).digest("hex"),
  bytes: Buffer.byteLength(html),
  checks,
  externalRequests: [],
  screenshots: [
    "relay-dark-wide.png",
    "conversation-dark-wide.png",
    "environment-missing-light.png",
    "relay-reduced-narrow.png"
  ]
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`Verified onboarding prototype: ${evidencePath}\n`);
