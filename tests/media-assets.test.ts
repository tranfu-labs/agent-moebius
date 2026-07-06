import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverOutputArtifacts,
  formatPublishedArtifactsMarkdown,
  prepareIssueMedia,
  type PublishedArtifact,
} from "../src/media-assets.js";
import type { IssueMediaReference } from "../src/issue-media.js";

describe("media assets", () => {
  it("downloads and validates images and videos into the run directory", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-media-test-"));
    const references: IssueMediaReference[] = [
      makeReference("image", "https://example.test/image.png", 1),
      makeReference("video", "https://example.test/video.mp4", 2),
    ];

    const result = await prepareIssueMedia({
      references,
      runDir,
      fetchImpl: async (url) =>
        new Response("bytes", {
          status: 200,
          headers: {
            "content-type": String(url).endsWith(".png") ? "image/png" : "video/mp4",
            "content-length": "5",
          },
        }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.prepared).toHaveLength(2);
    expect(result.imagePaths).toHaveLength(1);
    await expect(fs.stat(result.prepared[0]?.filePath ?? "")).resolves.toBeTruthy();
  });

  it("downloads GitHub release assets through the authenticated gh downloader instead of anonymous fetch", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-media-test-"));
    const url =
      "https://github.com/tranfu-labs/tranfucom/releases/download/agent-moebius-artifacts/home-375-86e2556573.png";
    const downloadedAssets: Array<{ owner: string; repo: string; tag: string; assetName: string }> = [];

    const result = await prepareIssueMedia({
      references: [makeReference("image", url, 1)],
      runDir,
      fetchImpl: async () => {
        throw new Error("anonymous fetch must not be used for GitHub release assets");
      },
      downloadReleaseAssetImpl: async (asset, destinationPath) => {
        downloadedAssets.push(asset);
        await fs.writeFile(destinationPath, "png-bytes");
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(downloadedAssets).toEqual([
      {
        owner: "tranfu-labs",
        repo: "tranfucom",
        tag: "agent-moebius-artifacts",
        assetName: "home-375-86e2556573.png",
      },
    ]);
    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]?.kind).toBe("image");
    expect(result.prepared[0]?.filePath.endsWith(".png")).toBe(true);
    expect(result.imagePaths).toHaveLength(1);
    await expect(fs.readFile(result.prepared[0]?.filePath ?? "", "utf8")).resolves.toBe("png-bytes");
  });

  it("still enforces size limits for GitHub release assets", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-media-test-"));
    const url = "https://github.com/tranfu-labs/tranfucom/releases/download/agent-moebius-artifacts/huge.png";

    const result = await prepareIssueMedia({
      references: [makeReference("image", url, 1)],
      runDir,
      limits: { imageMaxBytes: 4, videoMaxBytes: 4 },
      downloadReleaseAssetImpl: async (_asset, destinationPath) => {
        await fs.writeFile(destinationPath, "way-more-than-four-bytes");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures[0]?.reason).toBe("too-large:24>4");
    await expect(fs.readdir(path.join(runDir, "input-media"))).resolves.toEqual([]);
  });

  it("reports gh download failures for GitHub release assets", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-media-test-"));
    const url = "https://github.com/tranfu-labs/tranfucom/releases/download/agent-moebius-artifacts/missing.png";

    const result = await prepareIssueMedia({
      references: [makeReference("image", url, 1)],
      runDir,
      downloadReleaseAssetImpl: async () => {
        throw new Error("release asset not found");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures[0]?.reason).toBe("download-error:release asset not found");
  });

  it("reports media preparation failures instead of silently dropping bad media", async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-media-test-"));
    const result = await prepareIssueMedia({
      references: [makeReference("unknown", "https://example.test/page", 1)],
      runDir,
      fetchImpl: async () =>
        new Response("html", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "4" },
        }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures[0]?.reason).toBe("unsupported-content-type:text/html");
  });

  it("discovers explicitly referenced worktree artifacts and formats preview markdown", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-cwd-"));
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-run-"));
    await fs.mkdir(path.join(cwd, "artifacts", "acceptance"), { recursive: true });
    const pngPath = path.join(cwd, "artifacts", "acceptance", "t3.png");
    await fs.writeFile(pngPath, "png", "utf8");
    const startedAtMs = Date.now() - 1_000;

    const artifacts = await discoverOutputArtifacts({
      cwd,
      runDir,
      finalText: "## 验收证据\n- 验收截图：artifacts/acceptance/t3.png",
      startedAtMs,
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.filePath).toContain(`${path.sep}output-artifacts${path.sep}`);
    const published: PublishedArtifact[] = [
      {
        displayName: artifacts[0]?.displayName ?? "t3.png",
        kind: "image",
        url: "https://example.test/t3.png",
      },
    ];
    expect(formatPublishedArtifactsMarkdown(published)).toContain("![t3.png](https://example.test/t3.png)");
  });

  it("does not publish unreferenced worktree artifacts", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-cwd-"));
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-run-"));
    await fs.mkdir(path.join(cwd, "artifacts", "acceptance"), { recursive: true });
    await fs.writeFile(path.join(cwd, "artifacts", "acceptance", "t3.png"), "png", "utf8");

    const artifacts = await discoverOutputArtifacts({
      cwd,
      runDir,
      finalText: "## 验收证据\n- 单元测试通过",
      startedAtMs: Date.now() - 1_000,
    });

    expect(artifacts).toEqual([]);
  });

  it("rejects absolute and escaping artifact references", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-parent-"));
    const cwd = path.join(parent, "cwd");
    const runDir = path.join(parent, "run");
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(parent, "secret.png"), "png", "utf8");
    await fs.writeFile(path.join(cwd, "inside.png"), "png", "utf8");

    const artifacts = await discoverOutputArtifacts({
      cwd,
      runDir,
      finalText: `![escape](../secret.png)\n![absolute](${path.join(cwd, "inside.png")})`,
      startedAtMs: Date.now() - 1_000,
    });

    expect(artifacts).toEqual([]);
  });
});

function makeReference(kind: IssueMediaReference["kind"], url: string, ordinalInMessage: number): IssueMediaReference {
  return {
    messageIndex: 4,
    source: "comment",
    kind,
    url,
    label: null,
    ordinalInMessage,
    syntax: "bare-url",
  };
}
