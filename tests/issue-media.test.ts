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
          kind: "video",
          url: "https://example.test/movie.webm",
          syntax: "bare-url",
        }),
      ]),
    );
  });

  it("filters SVG issue input references across supported syntaxes", () => {
    const messages: TimelineMessage[] = [
      {
        index: 7,
        speaker: "user",
        source: "comment",
        body: [
          "![diagram](https://example.test/diagram.svg)",
          "[diagram link](https://example.test/link.svg)",
          '<img src="https://example.test/html.svg">',
          "https://example.test/bare.svg",
          "![screen](https://example.test/screen.png)",
          '<video src="https://example.test/demo.mp4"></video>',
        ].join("\n"),
      },
    ];

    const references = extractIssueMediaReferences(messages);

    expect(references.map((reference) => reference.url)).toEqual([
      "https://example.test/screen.png",
      "https://example.test/demo.mp4",
    ]);
    expect(references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "image", syntax: "markdown-image" }),
        expect.objectContaining({ kind: "video", syntax: "html" }),
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
