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

async function expectStableStep(page, step) {
  const currentStep = page.getByTestId(`step-${step}`);
  await currentStep.waitFor();
  await page.waitForTimeout(500);

  const activeStepCount = await page
    .locator('[data-testid^="step-"]')
    .count();
  if (activeStepCount !== 1 || (await currentStep.count()) !== 1) {
    throw new Error(
      `Expected onboarding to remain on step ${step}, found ${activeStepCount} active step roots.`
    );
  }
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
  if ((await desktopPage.getByTestId("back-action").count()) !== 0) {
    throw new Error("The first onboarding step must not expose a back action.");
  }
  checks.push("file-url-render");

  const primary = desktopPage.getByTestId("primary-action");
  await primary.focus();
  await desktopPage.keyboard.press("Enter");
  await expectStableStep(desktopPage, 2);
  checks.push("keyboard-step-1-to-2");

  await desktopPage.getByTestId("back-action").click();
  await expectStableStep(desktopPage, 1);
  await desktopPage.getByTestId("primary-action").click();
  await expectStableStep(desktopPage, 2);
  checks.push("back-navigation-preserves-journey");

  await desktopPage.getByTestId("open-team-builder").click();
  await desktopPage.getByTestId("team-builder").waitFor();
  if (!(await desktopPage.getByTestId("primary-action").isDisabled())) {
    throw new Error("Main onboarding continue must pause during AI team design.");
  }
  await desktopPage.getByTestId("builder-goal").fill(
    "希望每次产品发布时，有人统筹内容、渠道和排期。"
  );
  await desktopPage.getByLabel("发送目标").click();
  await desktopPage.getByTestId("builder-clarify").click();
  await desktopPage.getByTestId("team-proposal").waitFor();
  await desktopPage.waitForTimeout(350);
  checks.push("ai-team-builder-proposal");
  await desktopPage.screenshot({
    path: resolve(artifactDir, "team-builder-proposal-dark-wide.png"),
    fullPage: true
  });

  await desktopPage
    .getByLabel("调整团队提案")
    .fill("让负责人最后给我一份可复核的发布清单");
  await desktopPage.getByLabel("发送调整").click();
  await desktopPage.getByText(
    "已调整：让负责人最后给我一份可复核的发布清单"
  ).waitFor();
  await desktopPage.getByTestId("confirm-created-team").click();
  await desktopPage.getByTestId("created-team-card").waitFor();
  checks.push("ai-team-create-and-select");

  await desktopPage.getByTestId("primary-action").click();
  await expectStableStep(desktopPage, 3);
  await desktopPage
    .getByTestId("relay-stage")
    .getByText("素材、渠道、入口和发布时间已经一致")
    .waitFor();
  await desktopPage
    .getByTestId("relay-stage")
    .getByText("这次发布准备完成")
    .waitFor();
  const completedRelayItems = await desktopPage
    .locator(".relay-history li.is-complete")
    .count();
  if (completedRelayItems < 4) {
    throw new Error(
      `Expected persistent relay history before closeout, found ${completedRelayItems} completed items.`
    );
  }
  const graphMembers = await desktopPage
    .getByTestId("relay-beat")
    .evaluateAll((beats) => beats.map((beat) => beat.getAttribute("data-member")));
  const expectedGraphMembers = [
    "发布负责人",
    "内容策划",
    "渠道运营",
    "发布负责人",
    "渠道运营",
    "发布负责人"
  ];
  if (JSON.stringify(graphMembers) !== JSON.stringify(expectedGraphMembers)) {
    throw new Error(
      `Relay graph nodes do not match the message order: ${graphMembers.join(" -> ")}`
    );
  }
  const graphConnections = await desktopPage
    .locator(".relay-graph-connector")
    .count();
  if (graphConnections !== expectedGraphMembers.length - 1) {
    throw new Error(
      `Expected one connection per adjacent handoff, found ${graphConnections}.`
    );
  }
  checks.push("relay-graph-aligns-nodes-with-messages");
  await desktopPage.waitForTimeout(700);
  await desktopPage.screenshot({
    path: resolve(artifactDir, "relay-dark-wide.png"),
    fullPage: true
  });

  await desktopPage.getByTestId("replay-relay").click();
  await desktopPage
    .getByTestId("relay-stage")
    .getByText("这次发布我来统筹")
    .waitFor();
  checks.push("relay-replay");

  await desktopPage.getByTestId("primary-action").click();
  await expectStableStep(desktopPage, 4);
  await desktopPage.getByTestId("back-action").click();
  await expectStableStep(desktopPage, 3);
  const returnedRelayBeatCount = await desktopPage
    .getByTestId("relay-beat")
    .count();
  if (returnedRelayBeatCount > 1) {
    throw new Error(
      `Returning to relay should replay from the start, found ${returnedRelayBeatCount} visible beats.`
    );
  }
  await desktopPage.getByTestId("primary-action").click();
  await expectStableStep(desktopPage, 4);
  checks.push("step-4-back-replays-relay");
  checks.push("stable-step-transitions");
  await desktopPage.getByTestId("primary-action").click();
  await desktopPage.getByTestId("conversation-destination").waitFor();

  const selectedTeam = await desktopPage
    .getByTestId("selected-team")
    .textContent();
  if (!selectedTeam?.includes("产品发布团队")) {
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
  await missingPage.screenshot({
    path: resolve(artifactDir, "team-light-wide.png"),
    fullPage: true
  });
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
  await reducedPage.getByTestId("open-team-builder").click();
  await reducedPage.getByLabel("发送目标").click();
  await reducedPage.getByTestId("builder-clarify").click();
  await reducedPage.getByTestId("team-proposal").waitFor();
  await reducedPage.waitForTimeout(250);
  await reducedPage.screenshot({
    path: resolve(artifactDir, "team-builder-proposal-reduced-narrow.png"),
    fullPage: true
  });
  await reducedPage.getByTestId("confirm-created-team").click();
  await reducedPage.getByTestId("primary-action").click();
  await reducedPage.getByTestId("step-3").waitFor();

  const reduceMatches = await reducedPage.evaluate(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  if (!reduceMatches) {
    throw new Error("Reduced-motion verification context was not active.");
  }
  await reducedPage
    .getByTestId("relay-stage")
    .getByText("这次发布准备完成")
    .waitFor();
  const historyCount = await reducedPage.locator(".relay-history li").count();
  if (historyCount !== 6) {
    throw new Error(
      `Expected persistent relay history with 6 role beats, found ${historyCount} items.`
    );
  }
  checks.push("reduced-motion-equivalent-relay");
  await reducedPage.waitForTimeout(200);
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
    "team-builder-proposal-dark-wide.png",
    "relay-dark-wide.png",
    "conversation-dark-wide.png",
    "environment-missing-light.png",
    "team-light-wide.png",
    "team-builder-proposal-reduced-narrow.png",
    "relay-reduced-narrow.png"
  ]
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`Verified onboarding prototype: ${evidencePath}\n`);
