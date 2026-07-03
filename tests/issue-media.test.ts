import { describe, expect, it } from "vitest";
import { appendMediaManifest, extractIssueMediaReferences } from "../src/issue-media.js";
import type { TimelineMessage } from "../src/conversation.js";

describe("issue media", () => {
  it("extracts image and video references from GitHub-flavored issue text", () => {
    const messages: TimelineMessage[] = [
      {
        index: 2,
        speaker: "user",
        source: "comment",
        body: [
          "![screen](https://github.com/user-attachments/assets/abc)",
          '<video src="https://example.test/demo.mp4"></video>',
          "[diagram](https://example.test/diagram.svg)",
          "https://example.test/movie.webm",
          "https://example.test/page.html",
        ].join("\n"),
      },
    ];

    expect(extractIssueMediaReferences(messages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageIndex: 2,
          kind: "image",
          url: "https://github.com/user-attachments/assets/abc",
          label: "screen",
          syntax: "markdown-image",
        }),
        expect.objectContaining({
          messageIndex: 2,
          kind: "video",
          url: "https://example.test/demo.mp4",
          syntax: "html",
        }),
        expect.objectContaining({
          messageIndex: 2,
          kind: "image",
          url: "https://example.test/diagram.svg",
          label: "diagram",
          syntax: "markdown-link",
        }),
        expect.objectContaining({
          messageIndex: 2,
          kind: "video",
          url: "https://example.test/movie.webm",
          syntax: "bare-url",
        }),
      ]),
    );
  });

  it("appends prepared media manifest to prompts", () => {
    expect(
      appendMediaManifest("prompt", [
        {
          messageIndex: 3,
          kind: "video",
          filePath: "/tmp/run/input-media/video.mp4",
          originalUrl: "https://example.test/video.mp4",
          label: "demo",
          contentType: "video/mp4",
          byteLength: 123,
        },
      ]),
    ).toContain("本轮可用媒体文件");
  });
});
