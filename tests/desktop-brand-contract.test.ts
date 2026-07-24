import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("desktop brand contract", () => {
  it("copies canonical assets into both renderer outputs", async () => {
    const buildScript = await readFile(path.join(repoRoot, "desktop/scripts/build.mjs"), "utf8");

    expect(buildScript).toContain('"console-page/favicon-32.png"');
    expect(buildScript).toContain('"status-page/favicon-32.png"');
    expect(buildScript).toContain('"status-page/moebius-icon-64.png"');
    expect(buildScript).toContain('"app-icon-1024.png"');
  });

  it("declares favicon links and shows the diagnostic-page brand mark", async () => {
    const [consoleHtml, statusHtml] = await Promise.all([
      readFile(path.join(repoRoot, "desktop/src/console-page/index.html"), "utf8"),
      readFile(path.join(repoRoot, "desktop/src/status-page/index.html"), "utf8"),
    ]);

    expect(consoleHtml).toContain('href="./favicon-32.png"');
    expect(statusHtml).toContain('href="./favicon-32.png"');
    expect(statusHtml).toContain('src="./moebius-icon-64.png"');
    expect(statusHtml).toContain("<span>Moebius</span>");
  });
});
