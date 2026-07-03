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

  it("discovers generated artifacts and formats preview markdown", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-cwd-"));
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-moebius-artifact-run-"));
    const svgPath = path.join(cwd, "diagram.svg");
    await fs.writeFile(svgPath, "<svg></svg>", "utf8");
    const startedAtMs = Date.now() - 1_000;

    const artifacts = await discoverOutputArtifacts({
      cwd,
      runDir,
      finalText: "Generated `diagram.svg`.",
      startedAtMs,
    });

    expect(artifacts).toHaveLength(1);
    const published: PublishedArtifact[] = [
      {
        displayName: artifacts[0]?.displayName ?? "diagram.svg",
        kind: "image",
        url: "https://example.test/diagram.svg",
      },
    ];
    expect(formatPublishedArtifactsMarkdown(published)).toContain("![diagram.svg](https://example.test/diagram.svg)");
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
