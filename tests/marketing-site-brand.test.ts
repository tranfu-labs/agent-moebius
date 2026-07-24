import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(repoRoot, "sites/marketeam");

describe("marketing site brand", () => {
  it("publishes the canonical logo, favicon, and Apple Touch Icon", async () => {
    const html = await readFile(path.join(siteRoot, "index.html"), "utf8");

    expect(html).toContain('href="./assets/favicon-32.png"');
    expect(html).toContain('href="./assets/apple-touch-icon.png"');
    expect(html).toContain('src="./assets/moebius-icon-64.png"');
    expect(html).not.toContain('rel="icon" href="data:,"');
    await Promise.all([
      access(path.join(siteRoot, "assets/favicon-32.png")),
      access(path.join(siteRoot, "assets/apple-touch-icon.png")),
      access(path.join(siteRoot, "assets/moebius-icon-64.png")),
    ]);
  });

  it("states the Apple Silicon-only platform scope at each purchase-facing entry", async () => {
    const html = await readFile(path.join(siteRoot, "index.html"), "utf8");

    expect(html).toContain("开源 · macOS · Apple Silicon");
    expect(html).toContain("免费开源的 macOS · Apple Silicon 应用");
    expect(html).toContain("macOS Apple Silicon 版即将开放");
    expect(html).toContain("正式版本仅面向 Apple Silicon Mac");
  });
});
